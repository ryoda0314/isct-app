import { fetchUserCourses } from '../api/courses.js';

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

export async function isEnrolledInCourse(wstoken, userid, courseId) {
  let cache = courseCaches.get(userid);
  if (!cache || Date.now() > cache.expiry) {
    // Evict oldest if at capacity
    if (courseCaches.size >= MAX_ENTRIES) {
      const oldest = courseCaches.keys().next().value;
      courseCaches.delete(oldest);
    }
    const courses = await fetchUserCourses(wstoken, userid);
    const deptPrefixes = new Set();
    for (const c of courses) {
      const m = c.shortname?.match(/([A-Z]{2,4})\.[A-Z]\d{3}/);
      if (m) deptPrefixes.add(m[1]);
    }
    console.log(`[Enrollment] user=${userid} courses=${courses.length} depts=[${[...deptPrefixes]}] ids=[${[...courses.map(c=>c.id)].slice(0,5)}...]`);
    cache = { courseIds: new Set(courses.map(c => String(c.id))), deptPrefixes, expiry: Date.now() + CACHE_TTL };
    courseCaches.set(userid, cache);
  }
  const cid = String(courseId);
  // Global rooms (e.g. global:sandbox) are open to all authenticated users
  if (cid.startsWith('global:') || cid.startsWith('dept:global:')) return true;
  if (cid.startsWith('dept:')) {
    const dept = cid.slice(5);
    const ok = cache.deptPrefixes.has(dept);
    if (!ok) console.log(`[Enrollment] DENIED dept=${dept} available=[${[...cache.deptPrefixes]}]`);
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
