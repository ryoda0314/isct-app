import { performSSOLogin } from './sso-login.js';
import { loadCredentials } from '../credentials.js';
import { T2SCHOLA_API } from '../config.js';
import { destroySession } from './session.js';
import { invalidateCourseCache } from './course-enrollment.js';

let cachedToken = null;
let cachedUserId = null;
let cachedFullname = null;
let tokenExpiry = null;
let failCount = 0;
let failResetTimer = null;

const TOKEN_TTL = 2 * 60 * 60 * 1000; // 2 hours (L2)
const MAX_RETRIES = 2;
const BACKOFF_MS = 30_000;
const CIRCUIT_RESET_MS = 60_000; // L3: auto-reset after 1 minute

export async function getToken() {
  if (cachedToken && tokenExpiry && Date.now() < tokenExpiry) {
    return { wstoken: cachedToken, userid: cachedUserId, fullname: cachedFullname };
  }

  if (failCount >= MAX_RETRIES) {
    const msg = `Login circuit breaker open (${failCount} failures). Wait ${BACKOFF_MS / 1000}s or call invalidateToken().`;
    throw new Error(msg);
  }

  console.log('[TokenManager] Token expired or missing, performing SSO login...');

  try {
    const creds = await loadCredentials();
    const result = await performSSOLogin(creds);

    if (!result.wstoken) {
      throw new Error('No wstoken returned from SSO');
    }

    cachedToken = result.wstoken;
    failCount = 0;
    if (failResetTimer) { clearTimeout(failResetTimer); failResetTimer = null; }

    // Get user ID via site info
    const url = new URL(T2SCHOLA_API);
    url.searchParams.set('wstoken', cachedToken);
    url.searchParams.set('wsfunction', 'core_webservice_get_site_info');
    url.searchParams.set('moodlewsrestformat', 'json');

    const resp = await fetch(url.toString());
    const siteInfo = await resp.json();

    if (siteInfo.exception) {
      throw new Error(`Moodle error: ${siteInfo.message}`);
    }

    cachedUserId = siteInfo.userid;
    cachedFullname = siteInfo.fullname || '';
    tokenExpiry = Date.now() + TOKEN_TTL;

    console.log(`[TokenManager] Authenticated as user ${cachedUserId} (${cachedFullname})`);
    return { wstoken: cachedToken, userid: cachedUserId, fullname: cachedFullname };

  } catch (error) {
    failCount++;
    // L3: Auto-reset circuit breaker after cooldown
    if (!failResetTimer) {
      failResetTimer = setTimeout(() => {
        failCount = 0;
        failResetTimer = null;
        console.log('[TokenManager] Circuit breaker auto-reset');
      }, CIRCUIT_RESET_MS);
    }
    console.error(`[TokenManager] Login attempt ${failCount} failed:`, error.message);
    throw error;
  }
}

export function invalidateToken() {
  cachedToken = null;
  cachedUserId = null;
  cachedFullname = null;
  tokenExpiry = null;
  failCount = 0;
  if (failResetTimer) { clearTimeout(failResetTimer); failResetTimer = null; }
  destroySession();
  invalidateCourseCache();
}

export function isAuthenticated() {
  return cachedToken !== null && tokenExpiry !== null && Date.now() < tokenExpiry;
}
