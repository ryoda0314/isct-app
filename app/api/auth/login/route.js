import { NextResponse } from 'next/server';
import { getToken, invalidateToken } from '../../../../lib/auth/token-manager.js';
import { createSessionToken, sessionCookieOptions, COOKIE_NAME, verifySession } from '../../../../lib/auth/session.js';
import { getSupabaseAdmin } from '../../../../lib/supabase/server.js';

// H7: Per-account brute force protection
// WARNING: In-memory Map resets on serverless cold starts.
// For production, persist login attempts to Supabase or Vercel KV.
// Current in-memory approach provides partial protection on warm instances only.
const loginAttempts = new Map();
const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000; // 15 minutes
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of loginAttempts) {
    if (now - v.first > LOCKOUT_MS) loginAttempts.delete(k);
  }
}, 5 * 60 * 1000);

function checkLoginRate(loginId) {
  const now = Date.now();
  const rec = loginAttempts.get(loginId);
  if (!rec) return true;
  if (now - rec.first > LOCKOUT_MS) { loginAttempts.delete(loginId); return true; }
  return rec.count < MAX_ATTEMPTS;
}

function recordFailedLogin(loginId) {
  const now = Date.now();
  const rec = loginAttempts.get(loginId);
  if (!rec || now - rec.first > LOCKOUT_MS) {
    loginAttempts.set(loginId, { count: 1, first: now });
  } else {
    rec.count++;
  }
}

function clearLoginAttempts(loginId) {
  loginAttempts.delete(loginId);
}

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    let loginId = body.userId;

    // If no userId in body, try existing session
    if (!loginId) {
      const cookie = request.cookies.get(COOKIE_NAME)?.value;
      const session = verifySession(cookie);
      if (session) loginId = session.loginId;
    }

    if (!loginId) {
      return NextResponse.json({ error: 'userId required' }, { status: 400 });
    }

    // H7: Brute force protection
    if (!checkLoginRate(loginId)) {
      return NextResponse.json(
        { error: 'ログイン試行回数が上限に達しました。しばらく待ってから再試行してください' },
        { status: 429 }
      );
    }

    invalidateToken(loginId);
    let userid, fullname;
    try {
      ({ userid, fullname } = await getToken(loginId));
    } catch (e) {
      recordFailedLogin(loginId);
      throw e;
    }
    clearLoginAttempts(loginId);

    // Save profile to DB on login
    try {
      const sb = getSupabaseAdmin();
      await sb.from('profiles').upsert(
        { moodle_id: userid, name: fullname || `User ${userid}` },
        { onConflict: 'moodle_id', ignoreDuplicates: false }
      );
    } catch (e) {
      console.error('[Login] profile upsert:', e.message);
    }

    const token = createSessionToken(loginId, userid);
    const response = NextResponse.json({ success: true, moodleUserId: userid, fullname });
    response.cookies.set(COOKIE_NAME, token, sessionCookieOptions());
    return response;
  } catch (err) {
    return NextResponse.json({ error: 'Login failed' }, { status: 401 });
  }
}
