import { performSSOLogin } from './sso-login.js';
import { loadCredentials } from '../credentials.js';
import { T2SCHOLA_API } from '../config.js';
import { invalidateCourseCache } from './course-enrollment.js';

// Per-user token cache: loginId -> { wstoken, userid, fullname, tokenExpiry, failCount, failResetTimer }
const tokenCache = new Map();
// Per-user login lock to prevent duplicate SSO attempts
const loginLocks = new Map();

const TOKEN_TTL = 2 * 60 * 60 * 1000; // 2 hours
const MAX_RETRIES = 2;
const CIRCUIT_RESET_MS = 60_000; // 1 minute auto-reset

export async function getToken(loginId) {
  if (!loginId) throw new Error('loginId required');

  let entry = tokenCache.get(loginId);
  if (entry?.wstoken && entry.tokenExpiry && Date.now() < entry.tokenExpiry) {
    return { wstoken: entry.wstoken, userid: entry.userid, fullname: entry.fullname };
  }

  // If another request is already performing SSO for this user, wait for it
  if (loginLocks.has(loginId)) {
    await loginLocks.get(loginId);
    // Re-check cache after waiting
    entry = tokenCache.get(loginId);
    if (entry?.wstoken && entry.tokenExpiry && Date.now() < entry.tokenExpiry) {
      return { wstoken: entry.wstoken, userid: entry.userid, fullname: entry.fullname };
    }
  }

  if (!entry) entry = { failCount: 0, failResetTimer: null };

  if (entry.failCount >= MAX_RETRIES) {
    throw new Error(`Login circuit breaker open for ${loginId}`);
  }

  // Acquire lock for this user's login
  let resolveLock;
  loginLocks.set(loginId, new Promise(r => { resolveLock = r; }));

  console.log(`[TokenManager] Token expired/missing for ${loginId}, performing SSO login...`);

  try {
    const creds = await loadCredentials(loginId);
    const result = await performSSOLogin(creds);

    if (!result.wstoken) {
      throw new Error('No wstoken returned from SSO');
    }

    entry.wstoken = result.wstoken;
    entry.failCount = 0;
    if (entry.failResetTimer) { clearTimeout(entry.failResetTimer); entry.failResetTimer = null; }

    const url = new URL(T2SCHOLA_API);
    url.searchParams.set('wstoken', entry.wstoken);
    url.searchParams.set('wsfunction', 'core_webservice_get_site_info');
    url.searchParams.set('moodlewsrestformat', 'json');

    const resp = await fetch(url.toString());
    const siteInfo = await resp.json();

    if (siteInfo.exception) {
      throw new Error(`Moodle error: ${siteInfo.message}`);
    }

    entry.userid = siteInfo.userid;
    entry.fullname = siteInfo.fullname || '';
    entry.tokenExpiry = Date.now() + TOKEN_TTL;
    tokenCache.set(loginId, entry);

    console.log(`[TokenManager] Authenticated ${loginId} as user ${entry.userid} (${entry.fullname})`);
    return { wstoken: entry.wstoken, userid: entry.userid, fullname: entry.fullname };

  } catch (error) {
    entry.failCount++;
    if (!entry.failResetTimer) {
      entry.failResetTimer = setTimeout(() => {
        entry.failCount = 0;
        entry.failResetTimer = null;
        console.log(`[TokenManager] Circuit breaker auto-reset for ${loginId}`);
      }, CIRCUIT_RESET_MS);
    }
    tokenCache.set(loginId, entry);
    console.error(`[TokenManager] Login failed for ${loginId}:`, error.message);
    throw error;
  } finally {
    loginLocks.delete(loginId);
    resolveLock();
  }
}

export function invalidateToken(loginId) {
  if (loginId) {
    const entry = tokenCache.get(loginId);
    if (entry) {
      if (entry.failResetTimer) clearTimeout(entry.failResetTimer);
      if (entry.userid) invalidateCourseCache(entry.userid);
    }
    tokenCache.delete(loginId);
  } else {
    for (const entry of tokenCache.values()) {
      if (entry.failResetTimer) clearTimeout(entry.failResetTimer);
    }
    tokenCache.clear();
    invalidateCourseCache();
  }
}

export function isAuthenticated(loginId) {
  if (!loginId) return false;
  const entry = tokenCache.get(loginId);
  return !!(entry?.wstoken && entry.tokenExpiry && Date.now() < entry.tokenExpiry);
}
