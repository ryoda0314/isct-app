/**
 * Client-side Moodle API caller.
 * Calls Moodle webservice REST API directly from the user's browser/device,
 * bypassing the server-side proxy (which gets 403 from LMS).
 *
 * Security:
 * - wstoken is held in a module-scoped closure, never in localStorage/sessionStorage
 * - Token auto-expires after 10 minutes (client must re-fetch from server)
 * - CSP connect-src restricts which domains can be contacted
 * - Rate limited on server side (5 req/min for /api/auth/token)
 */

const LMS_API = 'https://lms.s.isct.ac.jp/2025/webservice/rest/server.php';

// In-memory token cache (never persisted to storage)
let _cachedToken = null;
let _cachedUserid = null;
let _tokenExpiry = 0;
const TOKEN_CLIENT_TTL = 10 * 60 * 1000; // 10 minutes

/**
 * Get token from server, with short-lived in-memory cache.
 * Never stores token in localStorage/sessionStorage.
 */
export async function getClientToken() {
  if (_cachedToken && Date.now() < _tokenExpiry) {
    return { wstoken: _cachedToken, userid: _cachedUserid };
  }
  const r = await fetch('/api/auth/token');
  if (r.status === 401) {
    const err = new Error('Not authenticated');
    err.code = 'AUTH_REQUIRED';
    throw err;
  }
  if (!r.ok) throw new Error(`Token fetch failed: ${r.status}`);
  const { wstoken, userid } = await r.json();
  _cachedToken = wstoken;
  _cachedUserid = userid;
  _tokenExpiry = Date.now() + TOKEN_CLIENT_TTL;
  return { wstoken, userid };
}

/** Clear cached token (call on logout) */
export function clearClientToken() {
  _cachedToken = null;
  _cachedUserid = null;
  _tokenExpiry = 0;
}

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

  let resp;
  try {
    resp = await fetch(LMS_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });
  } catch (e) {
    console.error(`[MoodleAPI] network error wsfunction=${wsfunction} name=${e.name} msg=${e.message}`);
    const err = new Error(`Moodle network error (${wsfunction}): ${e.message}`);
    err.code = 'MOODLE_NETWORK_ERROR';
    err.cause = e;
    throw err;
  }

  const text = await resp.text();

  if (text.startsWith('<') || text.startsWith('<!')) {
    console.error(`[MoodleAPI] HTML response wsfunction=${wsfunction} status=${resp.status} preview=${text.substring(0, 200)}`);
    const err = new Error(`Moodle returned HTML (status=${resp.status}): ${text.substring(0, 120)}`);
    err.code = 'MOODLE_HTML_RESPONSE';
    err.httpStatus = resp.status;
    throw err;
  }

  let data;
  try {
    data = JSON.parse(text);
  } catch {
    console.error(`[MoodleAPI] invalid JSON wsfunction=${wsfunction} status=${resp.status} preview=${text.substring(0, 200)}`);
    throw new Error(`Moodle response is not valid JSON (status=${resp.status}): ${text.substring(0, 120)}`);
  }

  if (data.exception) {
    console.error(`[MoodleAPI] exception wsfunction=${wsfunction} errorcode=${data.errorcode} msg=${data.message}`);
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
