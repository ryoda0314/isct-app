import { performSSOLogin } from './sso-login.js';
import { loadCredentials } from '../credentials.js';
import { T2SCHOLA_API } from '../config.js';
import { invalidateCourseCache } from './course-enrollment.js';
import { getSupabaseAdmin } from '../supabase/server.js';

// Per-user token cache: loginId -> { wstoken, userid, fullname, tokenExpiry, failCount, failResetTimer }
const tokenCache = new Map();
// Per-user login lock to prevent duplicate SSO attempts
const loginLocks = new Map();

const TOKEN_TTL = 2 * 60 * 60 * 1000; // 2 hours
const DB_CHECK_INTERVAL = 5 * 60 * 1000; // 5 min — キャッシュされたトークンのDB存在確認間隔
const MAX_RETRIES = 2;
const CIRCUIT_RESET_MS = 60_000; // 1 minute auto-reset

/** Validate a wstoken with Moodle and return site info, or null if invalid */
async function validateToken(wstoken) {
  try {
    const body = new URLSearchParams({
      wstoken,
      wsfunction: 'core_webservice_get_site_info',
      moodlewsrestformat: 'json',
    });
    const resp = await fetch(T2SCHOLA_API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'MoodleMobile 4.4.0 (Android)',
      },
      body: body.toString(),
    });
    const text = await resp.text();
    let info;
    try {
      info = JSON.parse(text);
    } catch {
      console.error('[TokenManager] validateToken: non-JSON response, status:', resp.status, 'body:', text.substring(0, 500));
      return null;
    }
    if (info.exception) {
      console.error('[TokenManager] validateToken exception:', info.errorcode, info.message);
      return null;
    }
    return info;
  } catch (e) {
    console.error('[TokenManager] validateToken fetch error:', e.message);
    return null;
  }
}

/** Save token to Supabase for persistence across serverless cold starts */
async function saveTokenToDb(loginId, wstoken, userid, fullname) {
  try {
    const sb = getSupabaseAdmin();
    await sb.from('user_tokens').upsert({
      login_id: loginId,
      wstoken,
      moodle_user_id: userid,
      fullname: fullname || '',
      updated_at: new Date().toISOString(),
    }, { onConflict: 'login_id' });
  } catch (e) {
    console.error('[TokenManager] Failed to save token to DB:', e.message);
  }
}

/** Load token from Supabase (for cold start recovery) */
async function loadTokenFromDb(loginId) {
  try {
    const sb = getSupabaseAdmin();
    const { data, error } = await sb
      .from('user_tokens')
      .select('wstoken, moodle_user_id, fullname')
      .eq('login_id', loginId)
      .single();
    if (error || !data) return null;
    return data;
  } catch {
    return null;
  }
}

/** Lightweight check: does the token row still exist in DB? (for cross-instance revocation) */
async function tokenExistsInDb(loginId) {
  try {
    const sb = getSupabaseAdmin();
    const { count, error } = await sb
      .from('user_tokens')
      .select('login_id', { count: 'exact', head: true })
      .eq('login_id', loginId);
    if (error) return true; // DB障害時はキャッシュを信頼
    return count > 0;
  } catch {
    return true;
  }
}

export async function getToken(loginId) {
  if (!loginId) throw new Error('loginId required');

  let entry = tokenCache.get(loginId);
  if (entry?.wstoken && entry.tokenExpiry && Date.now() < entry.tokenExpiry) {
    // 定期的にDBを確認し、ログアウト/削除された場合はキャッシュを無効化
    if (!entry.dbCheckExpiry || Date.now() > entry.dbCheckExpiry) {
      const exists = await tokenExistsInDb(loginId);
      if (!exists) {
        tokenCache.delete(loginId);
        throw new Error('Session revoked');
      }
      entry.dbCheckExpiry = Date.now() + DB_CHECK_INTERVAL;
    }
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

  try {
    // Step 1: Try loading token from Supabase (cold start recovery)
    // Note: server-side validateToken() gets 403 from LMS, so trust DB-cached tokens
    // with stored userid/fullname. They will be refreshed on next SSO login.
    const dbToken = await loadTokenFromDb(loginId);
    if (dbToken?.wstoken && dbToken.moodle_user_id) {
      console.log(`[TokenManager] Found cached token in DB for ${loginId}, using stored info`);
      entry.wstoken = dbToken.wstoken;
      entry.userid = dbToken.moodle_user_id;
      entry.fullname = dbToken.fullname || '';
      entry.tokenExpiry = Date.now() + TOKEN_TTL;
      entry.dbCheckExpiry = Date.now() + DB_CHECK_INTERVAL;
      entry.failCount = 0;
      tokenCache.set(loginId, entry);
      console.log(`[TokenManager] DB token restored for ${loginId} (user ${entry.userid})`);
      return { wstoken: entry.wstoken, userid: entry.userid, fullname: entry.fullname };
    }

    // Step 2: SSO login with stored credentials
    console.log(`[TokenManager] Performing SSO login for ${loginId}...`);
    const creds = await loadCredentials(loginId);
    const result = await performSSOLogin(creds);

    if (!result.wstoken) {
      throw new Error('No wstoken returned from SSO');
    }

    entry.wstoken = result.wstoken;
    entry.failCount = 0;
    if (entry.failResetTimer) { clearTimeout(entry.failResetTimer); entry.failResetTimer = null; }

    // Use site info from SSO browser session (server-side fetch gets 403 from LMS)
    const siteInfo = result.siteInfo || await validateToken(entry.wstoken);
    if (!siteInfo) {
      throw new Error('Token validation failed after SSO');
    }

    entry.userid = siteInfo.userid;
    entry.fullname = siteInfo.fullname || '';
    entry.tokenExpiry = Date.now() + TOKEN_TTL;
    entry.dbCheckExpiry = Date.now() + DB_CHECK_INTERVAL;
    tokenCache.set(loginId, entry);

    // Save to Supabase for cold start recovery
    await saveTokenToDb(loginId, entry.wstoken, entry.userid, entry.fullname);

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

export function resetCircuitBreaker(loginId) {
  if (!loginId) return;
  const entry = tokenCache.get(loginId);
  if (entry) {
    entry.failCount = 0;
    if (entry.failResetTimer) { clearTimeout(entry.failResetTimer); entry.failResetTimer = null; }
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
    // Also remove from DB
    try {
      const sb = getSupabaseAdmin();
      sb.from('user_tokens').delete().eq('login_id', loginId).then(() => {});
    } catch {}
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
