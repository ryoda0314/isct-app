import { fetchUserCourses } from '../api/courses.js';
import { DEPTS } from '../../campus-sns/data.js';

// Per-user course cache: moodleUserId -> { courseIds, expiry }
const courseCaches = new Map();
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes
const MAX_ENTRIES = 1000;

// Periodic cleanup of expired entries (every 10 minutes)
setInterval(() => {
  const now = Date.now();
  for (const [uid, cache] of courseCaches) {
    if (now > cache.expiry) courseCaches.delete(uid);
  }
}, 10 * 60 * 1000).unref();

async function fetchProfile(userid) {
  try {
    const { getSupabaseAdmin } = await import('../supabase/server.js');
    const sb = getSupabaseAdmin();
    const { data } = await sb.from('profiles').select('dept, unit').eq('moodle_id', userid).maybeSingle();
    return data || {};
  } catch (e) {
    console.error('[Enrollment] profile fetch failed:', e.message);
    return {};
  }
}

/** Fallback: load enrollments from Supabase when Moodle API is unreachable */
async function fetchEnrollmentsFromDb(userid) {
  try {
    const { getSupabaseAdmin } = await import('../supabase/server.js');
    const sb = getSupabaseAdmin();
    const { data, error } = await sb
      .from('course_enrollments')
      .select('course_moodle_id')
      .eq('moodle_user_id', userid);
    if (error || !data) return null;
    return data.map(r => ({ id: r.course_moodle_id }));
  } catch (e) {
    console.error('[Enrollment] DB fallback failed:', e.message);
    return null;
  }
}

export async function isEnrolledInCourse(wstoken, userid, courseId) {
  const cid = String(courseId);
  // Global rooms are open to all authenticated users — check BEFORE hitting Moodle API
  if (cid.startsWith('global:') || cid.startsWith('dept:global:')) return true;

  // Language-community rooms ("lang:<code>") — membership lives in language_members,
  // NOT Moodle enrollment. Check it directly and skip the Moodle course fetch.
  if (cid.startsWith('lang:')) {
    const code = cid.slice('lang:'.length);
    try {
      const { getSupabaseAdmin } = await import('../supabase/server.js');
      const sb = getSupabaseAdmin();
      const { data } = await sb
        .from('language_members')
        .select('user_id')
        .eq('lang_code', code)
        .eq('user_id', userid)
        .maybeSingle();
      return !!data;
    } catch (e) {
      console.error('[Enrollment] language membership check failed:', e.message);
      return false;
    }
  }

  let cache = courseCaches.get(userid);
  if (!cache || Date.now() > cache.expiry) {
    // Evict oldest if at capacity
    if (courseCaches.size >= MAX_ENTRIES) {
      const oldest = courseCaches.keys().next().value;
      courseCaches.delete(oldest);
    }
    let courses, profile;
    try {
      [courses, profile] = await Promise.all([
        fetchUserCourses(wstoken, userid),
        fetchProfile(userid),
      ]);
    } catch (e) {
      // Moodle API unreachable (403 etc.) — fall back to Supabase enrollments
      console.warn(`[Enrollment] Moodle API failed (${e.message}), falling back to DB`);
      const dbCourses = await fetchEnrollmentsFromDb(userid);
      if (!dbCourses) throw e; // DB fallback also failed
      courses = dbCourses;
      profile = await fetchProfile(userid);
    }
    const deptPrefixes = new Set();
    for (const c of courses) {
      const m = c.shortname?.match(/([A-Z]{2,4})\.[A-Z]\d{3}/);
      if (m) deptPrefixes.add(m[1]);
    }
    console.log(`[Enrollment] user=${userid} courses=${courses.length} depts=[${[...deptPrefixes]}] profileDept=${profile.dept} profileUnit=${profile.unit}`);
    cache = {
      courseIds: new Set(courses.map(c => String(c.id))),
      deptPrefixes,
      profileDept: profile.dept || null,
      profileUnit: profile.unit || null,
      expiry: Date.now() + CACHE_TTL,
    };
    courseCaches.set(userid, cache);
  }
  // cid already computed above
  // School rooms (e.g. "dept:school:engineering")
  if (cid.startsWith('dept:school:')) {
    const schoolKey = cid.slice('dept:school:'.length);
    // Profile dept belongs to this school
    if (cache.profileDept && DEPTS[cache.profileDept]?.school === schoolKey) return true;
    // Fallback: user has courses from a dept in this school
    const schoolDeptCodes = Object.entries(DEPTS)
      .filter(([_, d]) => d.school === schoolKey)
      .map(([code]) => code);
    const ok = schoolDeptCodes.some(d => cache.deptPrefixes.has(d));
    if (!ok) console.log(`[Enrollment] DENIED school=${schoolKey} available=[${[...cache.deptPrefixes]}] profileDept=${cache.profileDept}`);
    return ok;
  }
  // Unit rooms (e.g. "dept:unit:24B-39")
  if (cid.startsWith('dept:unit:')) {
    const unitId = cid.slice('dept:unit:'.length);
    const ok = cache.profileUnit === unitId;
    if (!ok) console.log(`[Enrollment] DENIED unit=${unitId} profileUnit=${cache.profileUnit}`);
    return ok;
  }
  // Dept rooms (e.g. "dept:MEC")
  if (cid.startsWith('dept:')) {
    const dept = cid.slice(5);
    if (cache.profileDept === dept) return true;
    const ok = cache.deptPrefixes.has(dept);
    if (!ok) console.log(`[Enrollment] DENIED dept=${dept} available=[${[...cache.deptPrefixes]}] profileDept=${cache.profileDept}`);
    return ok;
  }
  const ok = cache.courseIds.has(cid);
  if (!ok) console.log(`[Enrollment] DENIED courseId=${cid}`);
  return ok;
}

/**
 * Seed the enrollment cache from client-provided course data.
 * Called from all-meta when the client sends rawCourses fetched directly from Moodle.
 */
export function seedEnrollmentCache(userid, rawCourses, profileDept, profileUnit) {
  const deptPrefixes = new Set();
  for (const c of rawCourses) {
    const m = c.shortname?.match(/([A-Z]{2,4})\.[A-Z]\d{3}/);
    if (m) deptPrefixes.add(m[1]);
  }
  const cache = {
    courseIds: new Set(rawCourses.map(c => String(c.id))),
    deptPrefixes,
    profileDept: profileDept || null,
    profileUnit: profileUnit || null,
    expiry: Date.now() + CACHE_TTL,
  };
  courseCaches.set(userid, cache);
  console.log(`[Enrollment] seeded cache for user=${userid} courses=${rawCourses.length} depts=[${[...deptPrefixes]}]`);
}

/**
 * Sync a user's course enrollments to Supabase with MINIMAL writes.
 *
 * Reads the existing rows and only INSERTs newly-added courses and DELETEs
 * dropped ones — so when nothing changed (the common case on every startup /
 * 15-min refresh) it performs ZERO writes. This keeps the fallback table
 * correct (drops are removed → no ghost members) while avoiding the disk-IO
 * churn that a blind re-upsert caused (600k+ row updates depleted the Nano
 * instance's disk-IO budget and effectively froze the DB).
 *
 * Fire-and-forget friendly: callers may ignore the returned promise.
 *
 * @param {number} userid - Moodle user id
 * @param {Array<number|string>} courseIds - current visible Moodle course ids
 */
export async function syncEnrollments(userid, courseIds) {
  try {
    const { getSupabaseAdmin } = await import('../supabase/server.js');
    const sb = getSupabaseAdmin();
    const current = new Set(courseIds.map(Number));
    // Safety: never let a transient empty/failed course fetch wipe all rows.
    if (current.size === 0) return;

    const { data: rows, error: selErr } = await sb
      .from('course_enrollments')
      .select('course_moodle_id')
      .eq('moodle_user_id', userid);
    if (selErr) { console.error('[Enrollment] sync select error:', selErr.message); return; }

    const existing = new Set((rows || []).map(r => Number(r.course_moodle_id)));
    const toAdd = [...current].filter(id => !existing.has(id));
    const toRemove = [...existing].filter(id => !current.has(id));
    if (toAdd.length === 0 && toRemove.length === 0) return; // no change → no writes

    if (toAdd.length) {
      // upsert+ignoreDuplicates makes concurrent syncs (e.g. two tabs) race-safe.
      const { error } = await sb
        .from('course_enrollments')
        .upsert(toAdd.map(id => ({ moodle_user_id: userid, course_moodle_id: id })),
                { onConflict: 'moodle_user_id,course_moodle_id', ignoreDuplicates: true });
      if (error) console.error('[Enrollment] sync insert error:', error.message);
    }
    if (toRemove.length) {
      const { error } = await sb
        .from('course_enrollments')
        .delete()
        .eq('moodle_user_id', userid)
        .in('course_moodle_id', toRemove);
      if (error) console.error('[Enrollment] sync delete error:', error.message);
    }
  } catch (e) {
    console.error('[Enrollment] sync failed:', e.message);
  }
}

export function invalidateCourseCache(userid) {
  if (userid !== undefined) {
    courseCaches.delete(userid);
  } else {
    courseCaches.clear();
  }
}
