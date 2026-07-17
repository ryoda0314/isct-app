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

import { isNative } from './capacitor.js';

const LMS_API = 'https://lms.s.isct.ac.jp/2025/webservice/rest/server.php';
const LMS_UPLOAD = 'https://lms.s.isct.ac.jp/2025/webservice/upload.php';

// In-memory token cache (never persisted to storage)
let _cachedToken = null;
let _cachedUserid = null;
let _tokenExpiry = 0;
const TOKEN_CLIENT_TTL = 10 * 60 * 1000; // 10 minutes
// Single in-flight fetch so concurrent startup callers (App + each useCourseMaterials,
// friends, etc.) share ONE /api/auth/token request instead of bursting past the
// 5 req/min rate limit → 429. Without this, a cold load fires N simultaneous fetches.
let _tokenInFlight = null;

/**
 * Get token from server, with short-lived in-memory cache + single-flight dedup.
 * Never stores token in localStorage/sessionStorage.
 */
export async function getClientToken() {
  if (_cachedToken && Date.now() < _tokenExpiry) {
    return { wstoken: _cachedToken, userid: _cachedUserid };
  }
  if (_tokenInFlight) return _tokenInFlight; // concurrent callers share the same fetch
  _tokenInFlight = (async () => {
    // Hard timeout so a hung backend can't freeze startup forever.
    const r = await fetch('/api/auth/token', { signal: AbortSignal.timeout(12000) });
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
  })();
  try {
    return await _tokenInFlight;
  } finally {
    _tokenInFlight = null;
  }
}

/** Clear cached token (call on logout) */
export function clearClientToken() {
  _cachedToken = null;
  _cachedUserid = null;
  _tokenExpiry = 0;
}

// Errorcodes that indicate the wstoken is no longer accepted by Moodle —
// happens when the token expires server-side (~weeks). One refresh + retry
// should recover transparently.
const TOKEN_INVALID_ERRORCODES = new Set([
  'invalidtoken',
]);

// Single in-flight refresh promise so concurrent invalidtoken errors share one SSO.
let _refreshInFlight = null;

/**
 * Re-run the ISCT SSO on-device to get a fresh wstoken, so the server's
 * Puppeteer SSO (and the credentials it requires) is not needed for routine
 * token expiry. Credentials are fetched per-use and never persisted client-side
 * beyond this call.
 *
 * Returns { wstoken, userid } or null if the native path is unavailable/failed
 * (caller then falls back to the server refresh).
 */
/**
 * Get the credential bundle from on-device secure storage (Keychain/Keystore),
 * migrating it from the server once on first run. Returns the bundle, or null
 * on web / when the native plugin is unavailable. Throws AUTH_REQUIRED if the
 * server reports the session is gone during migration.
 */
async function ensureLocalCreds() {
  if (!isNative()) return null;
  const { loadCredsBundle, saveCredsBundle } = await import('./secureCreds.js');

  const stored = await loadCredsBundle();
  if (stored?.password && stored?.totpSecret) {
    console.log('[SecureCreds] using locally-stored credentials (no server fetch)');
    return stored;
  }

  // First run on this device: migrate the full bundle from the server, then
  // persist it locally so the server-side copy can eventually be retired.
  const r = await fetch('/api/auth/credentials/bundle', {
    headers: { 'x-app-platform': 'capacitor' },
    signal: AbortSignal.timeout(12000),
  });
  if (r.status === 401) {
    const err = new Error('Not authenticated');
    err.code = 'AUTH_REQUIRED';
    throw err;
  }
  if (!r.ok) return null;
  const bundle = await r.json();
  if (!bundle?.password || !bundle?.totpSecret) return null;
  console.log('[SecureCreds] migrating credentials from server to device Keychain (first run)');
  try { await saveCredsBundle(bundle); } catch (e) { console.warn('[SecureCreds] save failed:', e.message); }
  return bundle;
}

async function refreshTokenNative() {
  if (!isNative()) return null;
  try {
    const bundle = await ensureLocalCreds();
    if (!bundle) return null;

    // Generate the 2FA code on-device from the stored secret — no server call.
    const { generateTOTP } = await import('./totp.js');
    const totpCode = await generateTOTP(bundle.totpSecret);

    const { acquireWsToken } = await import('./plugins/portalWebView.js');
    const { wstoken, userid } = await acquireWsToken({
      userId: bundle.userId || bundle.loginId,
      password: bundle.password,
      totpCode,
    });
    if (!wstoken) return null;
    return { wstoken, userid: userid || bundle.moodleUserId || _cachedUserid };
  } catch (e) {
    if (e.code === 'AUTH_REQUIRED') throw e;
    console.warn('[MoodleAPI] native SSO refresh failed, falling back to server:', e.message);
    return null;
  }
}

async function refreshClientToken() {
  if (_refreshInFlight) return _refreshInFlight;
  _refreshInFlight = (async () => {
    // Prefer on-device SSO so the server doesn't need stored credentials.
    const native = await refreshTokenNative();
    if (native) {
      _cachedToken = native.wstoken;
      if (native.userid) _cachedUserid = native.userid;
      _tokenExpiry = Date.now() + TOKEN_CLIENT_TTL;
      return { wstoken: _cachedToken, userid: _cachedUserid };
    }

    // Fallback: server-side Puppeteer SSO.
    const r = await fetch('/api/auth/token/refresh', { method: 'POST' });
    if (r.status === 401) {
      const err = new Error('Not authenticated');
      err.code = 'AUTH_REQUIRED';
      throw err;
    }
    if (!r.ok) throw new Error(`Token refresh failed: ${r.status}`);
    const { wstoken, userid } = await r.json();
    _cachedToken = wstoken;
    _cachedUserid = userid;
    _tokenExpiry = Date.now() + TOKEN_CLIENT_TTL;
    return { wstoken, userid };
  })();
  try {
    return await _refreshInFlight;
  } finally {
    _refreshInFlight = null;
  }
}

/**
 * Call a Moodle webservice function directly from the client.
 * Internally retries once after refreshing the wstoken if Moodle returns
 * `invalidtoken` (token expired server-side).
 */
export async function callMoodleAPI(wstoken, wsfunction, params = {}, _retried = false) {
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
    if (!_retried && TOKEN_INVALID_ERRORCODES.has(data.errorcode)) {
      console.warn(`[MoodleAPI] token rejected (${data.errorcode}) for ${wsfunction}, refreshing & retrying once`);
      const fresh = await refreshClientToken();
      return callMoodleAPI(fresh.wstoken, wsfunction, params, true);
    }
    console.error(`[MoodleAPI] exception wsfunction=${wsfunction} errorcode=${data.errorcode} msg=${data.message}`);
    const err = new Error(`Moodle API [${data.errorcode}]: ${data.message}`);
    err.errorcode = data.errorcode;
    throw err;
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

/**
 * Upload one or more files to the user's Moodle *draft* file area (upload.php).
 * All files land in a SINGLE draft area so they submit together: the first
 * upload gets an itemid assigned by Moodle, and every later file reuses it.
 * Nothing is submitted here — the draft area is just staging (Moodle GCs it if
 * never referenced by a save_submission).
 *
 * upload.php is a separate endpoint from the REST server, so it does NOT share
 * callMoodleAPI's invalidtoken auto-refresh; call getClientToken() right before
 * uploading so the token is fresh (10-min client TTL).
 *
 * @param {string} wstoken
 * @param {File|File[]|FileList} files
 * @param {number} [itemid=0]  existing draft itemid to append to (0 = new area)
 * @returns {Promise<{itemid:number, files:Array}>}
 */
export async function uploadDraftFiles(wstoken, files, itemid = 0) {
  const list = files == null ? [] : (files instanceof File ? [files] : Array.from(files));
  if (!list.length) throw new Error('No files to upload');

  let curItem = itemid;
  const uploaded = [];
  for (const f of list) {
    const fd = new FormData();
    fd.set('token', wstoken);
    fd.set('filearea', 'draft');
    fd.set('itemid', String(curItem));
    fd.set('file', f, f.name);

    let resp;
    try {
      resp = await fetch(LMS_UPLOAD, { method: 'POST', body: fd });
    } catch (e) {
      console.error(`[MoodleUpload] network error name=${e.name} msg=${e.message}`);
      const err = new Error(`Moodle upload network error: ${e.message}`);
      err.code = 'MOODLE_NETWORK_ERROR';
      throw err;
    }

    const text = await resp.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      console.error(`[MoodleUpload] non-JSON status=${resp.status} preview=${text.slice(0, 200)}`);
      throw new Error(`upload.php returned non-JSON (status=${resp.status}): ${text.slice(0, 120)}`);
    }

    // Success is an array of file descriptors; errors come as an object
    // ({ error } or { exception, errorcode, message }).
    if (!Array.isArray(data)) {
      const msg = data?.error || data?.message || 'upload rejected';
      console.error(`[MoodleUpload] rejected errorcode=${data?.errorcode || data?.error} msg=${msg}`);
      const err = new Error(`Moodle upload error: ${msg}`);
      err.errorcode = data?.errorcode || data?.error;
      throw err;
    }

    for (const item of data) {
      if (item?.itemid != null) curItem = item.itemid; // reuse the assigned draft area
      uploaded.push(item);
    }
  }
  return { itemid: curItem, files: uploaded };
}

/**
 * Submit a FILE submission for an assignment, referencing files already staged
 * in a draft area by uploadDraftFiles(). With submissiondrafts disabled (the
 * ISCT default) this counts as submitted immediately — no submit_for_grading
 * step needed. Auto-refreshes the wstoken once on invalidtoken.
 *
 * @param {string} wstoken
 * @param {number} assignmentId  Moodle assignment id (asgn.moodleId)
 * @param {number} draftItemId   itemid from uploadDraftFiles()
 */
export function saveFileSubmission(wstoken, assignmentId, draftItemId) {
  return callMoodleAPI(wstoken, 'mod_assign_save_submission', {
    assignmentid: assignmentId,
    'plugindata[files_filemanager]': draftItemId,
  });
}

/**
 * Finalize a submission ("submit for grading"). Only needed when the assignment
 * has submissiondrafts enabled (require-submit-button). ISCT assignments don't,
 * but this keeps the flow correct if one ever does.
 */
export function submitForGrading(wstoken, assignmentId, acceptStatement = false) {
  return callMoodleAPI(wstoken, 'mod_assign_submit_for_grading', {
    assignmentid: assignmentId,
    acceptsubmissionstatement: acceptStatement ? 1 : 0,
  });
}

/** Fetch enrolled users for a course */
export function fetchEnrolledUsers(wstoken, courseid) {
  return callMoodleAPI(wstoken, 'core_enrol_get_enrolled_users', { courseid });
}

/** Fetch course contents (sections, modules) */
export function fetchCourseContents(wstoken, courseid) {
  return callMoodleAPI(wstoken, 'core_course_get_contents', { courseid });
}
