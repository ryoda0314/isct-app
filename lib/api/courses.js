import { callMoodleAPI } from './moodle-client.js';

/**
 * Fetch all courses the user is enrolled in.
 * Returns: [{id, shortname, fullname, enrolledusercount, idnumber, visible, ...}]
 */
export async function fetchUserCourses(wstoken, userid) {
  return callMoodleAPI(wstoken, 'core_enrol_get_users_courses', { userid });
}

/**
 * Fetch enrolled users for a course.
 * Returns: [{id, fullname, profileimageurl, ...}]
 */
export async function fetchEnrolledUsers(wstoken, courseid) {
  return callMoodleAPI(wstoken, 'core_enrol_get_enrolled_users', { courseid });
}

/**
 * Fetch course contents (sections, modules).
 * Returns: [{id, name, visible, summary, modules: [{id, name, modname, ...}]}]
 */
export async function fetchCourseContents(wstoken, courseid) {
  return callMoodleAPI(wstoken, 'core_course_get_contents', { courseid });
}
