/**
 * Client-side Moodle API caller.
 * Calls Moodle webservice REST API directly from the user's browser/device,
 * bypassing the server-side proxy (which gets 403 from LMS).
 */

const LMS_API = 'https://lms.s.isct.ac.jp/2025/webservice/rest/server.php';

/**
 * Call a Moodle webservice function directly from the client.
 */
export async function callMoodleAPI(wstoken, wsfunction, params = {}) {
  const body = new URLSearchParams();
  body.set('wstoken', wstoken);
  body.set('wsfunction', wsfunction);
  body.set('moodlewsrestformat', 'json');

  for (const [key, value] of Object.entries(params)) {
    if (Array.isArray(value)) {
      value.forEach((v, i) => {
        if (typeof v === 'object' && v !== null) {
          for (const [k2, v2] of Object.entries(v)) {
            body.set(`${key}[${i}][${k2}]`, v2);
          }
        } else {
          body.set(`${key}[${i}]`, v);
        }
      });
    } else {
      body.set(key, value);
    }
  }

  const resp = await fetch(LMS_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  const text = await resp.text();

  if (text.startsWith('<') || text.startsWith('<!')) {
    const err = new Error(`Moodle returned HTML: ${text.substring(0, 120)}`);
    err.code = 'MOODLE_HTML_RESPONSE';
    throw err;
  }

  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`Moodle response is not valid JSON: ${text.substring(0, 120)}`);
  }

  if (data.exception) {
    throw new Error(`Moodle API [${data.errorcode}]: ${data.message}`);
  }

  return data;
}

/** Fetch user's enrolled courses */
export function fetchUserCourses(wstoken, userid) {
  return callMoodleAPI(wstoken, 'core_enrol_get_users_courses', { userid });
}

/** Fetch assignments for given course IDs */
export function fetchAssignments(wstoken, courseIds) {
  return callMoodleAPI(wstoken, 'mod_assign_get_assignments', { courseids: courseIds });
}

/** Fetch submission status for a specific assignment */
export function fetchSubmissionStatus(wstoken, assignmentId) {
  return callMoodleAPI(wstoken, 'mod_assign_get_submission_status', { assignid: assignmentId });
}

/** Fetch enrolled users for a course */
export function fetchEnrolledUsers(wstoken, courseid) {
  return callMoodleAPI(wstoken, 'core_enrol_get_enrolled_users', { courseid });
}

/** Fetch course contents (sections, modules) */
export function fetchCourseContents(wstoken, courseid) {
  return callMoodleAPI(wstoken, 'core_course_get_contents', { courseid });
}
