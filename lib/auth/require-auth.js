import { NextResponse } from 'next/server';
import { getToken } from './token-manager.js';
import { verifySession, COOKIE_NAME } from './session.js';

// Throttle last_active_at updates to at most once per 15 minutes per user.
const _activeCache = new Map();
const ACTIVE_INTERVAL = 15 * 60 * 1000;

async function touchActivity(userid) {
  const now = Date.now();
  if (_activeCache.get(userid) > now - ACTIVE_INTERVAL) return;
  _activeCache.set(userid, now);
  try {
    const { getSupabaseAdmin } = await import('../supabase/server.js');
    const sb = getSupabaseAdmin();
    // The in-memory cache above is per-instance and resets on every serverless
    // cold start, so it can't dedupe across instances. Let the DB enforce the
    // throttle: only write when the stored value is actually stale. Instances
    // that find a fresh last_active_at match 0 rows and write nothing — no WAL,
    // no dead tuple. This removed the bulk of profiles write churn.
    const threshold = new Date(now - ACTIVE_INTERVAL).toISOString();
    await sb.from('profiles')
      .update({ last_active_at: new Date(now).toISOString() })
      .eq('moodle_id', userid)
      .or(`last_active_at.is.null,last_active_at.lt.${threshold}`);
  } catch {}
}

// Cache ban status for 60s to avoid hitting DB on every request
const _banCache = new Map();
const BAN_CACHE_TTL = 60_000;

async function isBanned(userid) {
  const now = Date.now();
  const cached = _banCache.get(userid);
  if (cached && now - cached.ts < BAN_CACHE_TTL) return cached.banned;
  try {
    const { getSupabaseAdmin } = await import('../supabase/server.js');
    const sb = getSupabaseAdmin();
    const { data } = await sb.from('profiles').select('banned').eq('moodle_id', userid).maybeSingle();
    const banned = !!data?.banned;
    _banCache.set(userid, { banned, ts: now });
    if (_banCache.size > 500) { for (const [k, v] of _banCache) { if (now - v.ts > BAN_CACHE_TTL) _banCache.delete(k); } }
    return banned;
  } catch { return false; }
}

/**
 * Verify that the request comes from an authenticated, non-banned session.
 * Returns { wstoken, userid, fullname, loginId, error: null } on success,
 * or { error: NextResponse } on failure.
 */
export async function requireAuth(request) {
  const cookie = request.cookies.get(COOKIE_NAME)?.value;
  const session = verifySession(cookie);
  if (!session) {
    return { error: NextResponse.json({ error: 'Not authenticated' }, { status: 401 }) };
  }

  try {
    const tokenData = await getToken(session.loginId);

    // Check if user is banned
    if (await isBanned(tokenData.userid)) {
      return { error: NextResponse.json({ error: 'アカウントが停止されています', banned: true }, { status: 403 }) };
    }

    // Non-blocking activity tracking
    touchActivity(tokenData.userid).catch(() => {});
    return { ...tokenData, loginId: session.loginId, error: null };
  } catch (e) {
    console.error(`[Auth] getToken failed for loginId=${session.loginId}:`, e.message);
    return { error: NextResponse.json({ error: 'Authentication failed' }, { status: 401 }) };
  }
}
