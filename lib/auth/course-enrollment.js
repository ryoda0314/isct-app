import { fetchUserCourses } from '../api/courses.js';

let cachedCourseIds = null;
let cacheExpiry = null;
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes

export async function isEnrolledInCourse(wstoken, userid, courseId) {
  if (!cachedCourseIds || !cacheExpiry || Date.now() > cacheExpiry) {
    const courses = await fetchUserCourses(wstoken, userid);
    cachedCourseIds = new Set(courses.map(c => String(c.id)));
    cacheExpiry = Date.now() + CACHE_TTL;
  }
  return cachedCourseIds.has(String(courseId));
}

export function invalidateCourseCache() {
  cachedCourseIds = null;
  cacheExpiry = null;
}
