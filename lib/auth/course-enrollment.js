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
    cache = { courseIds: new Set(courses.map(c => String(c.id))), expiry: Date.now() + CACHE_TTL };
    courseCaches.set(userid, cache);
  }
  return cache.courseIds.has(String(courseId));
}

export function invalidateCourseCache(userid) {
  if (userid !== undefined) {
    courseCaches.delete(userid);
  } else {
    courseCaches.clear();
  }
}
