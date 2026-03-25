import { NextResponse } from 'next/server';
import { getToken } from './token-manager.js';
import { verifySession, COOKIE_NAME } from './session.js';

// Throttle last_active_at updates to at most once per 5 minutes per user
const _activeCache = new Map();
const ACTIVE_INTERVAL = 5 * 60 * 1000;

async function touchActivity(userid) {
  const now = Date.now();
  if (_activeCache.get(userid) > now - ACTIVE_INTERVAL) return;
  _activeCache.set(userid, now);
  try {
    const { getSupabaseAdmin } = await import('../supabase/server.js');
    const sb = getSupabaseAdmin();
    await sb.from('profiles').update({ last_active_at: new Date().toISOString() }).eq('moodle_id', userid);
  } catch {}
}

/**
 * Verify that the request comes from an authenticated session.
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
    // Non-blocking activity tracking
    touchActivity(tokenData.userid).catch(() => {});
    return { ...tokenData, loginId: session.loginId, error: null };
  } catch {
    return { error: NextResponse.json({ error: 'Authentication failed' }, { status: 401 }) };
  }
}
