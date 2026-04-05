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

export async function isEnrolledInCourse(wstoken, userid, courseId) {
  let cache = courseCaches.get(userid);
  if (!cache || Date.now() > cache.expiry) {
    // Evict oldest if at capacity
    if (courseCaches.size >= MAX_ENTRIES) {
      const oldest = courseCaches.keys().next().value;
      courseCaches.delete(oldest);
    }
    const [courses, profile] = await Promise.all([
      fetchUserCourses(wstoken, userid),
      fetchProfile(userid),
    ]);
    const deptPrefixes = new Set();
    for (const c of courses) {
      const m = c.shortname?.match(/([A-Z]{2,4})\.[A-Z]\d{3}/);
      if (m) deptPrefixes.add(m[1]);
    }
    console.log(`[Enrollment] user=${userid} courses=${courses.length} depts=[${[...deptPrefixes]}] profileDept=${profile.dept} profileUnit=${profile.unit} ids=[${[...courses.map(c=>c.id)].slice(0,5)}...]`);
    cache = {
      courseIds: new Set(courses.map(c => String(c.id))),
      deptPrefixes,
      profileDept: profile.dept || null,
      profileUnit: profile.unit || null,
      expiry: Date.now() + CACHE_TTL,
    };
    courseCaches.set(userid, cache);
  }
  const cid = String(courseId);
  // Global rooms (e.g. global:sandbox) are open to all authenticated users
  if (cid.startsWith('global:') || cid.startsWith('dept:global:')) return true;
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

export function invalidateCourseCache(userid) {
  if (userid !== undefined) {
    courseCaches.delete(userid);
  } else {
    courseCaches.clear();
  }
}
