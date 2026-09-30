import { NextResponse } from 'next/server';
import { getToken, invalidateToken } from '../../../../lib/auth/token-manager.js';
import { createSessionToken, sessionCookieOptions, COOKIE_NAME, verifySession } from '../../../../lib/auth/session.js';
import { getSupabaseAdmin } from '../../../../lib/supabase/server.js';
import { isRateLimited, recordAttempt, clearRateLimit } from '../../../../lib/rate-limit.js';

// Re-login for an already-signed-in account using its stored credentials.
// SECURITY: this route never trusts an identity from the request body — it used
// to accept { userId } and would SSO with that user's *stored* credentials and
// hand back their session cookie (account takeover by student ID alone).
const LOGIN_LIMIT = { max: 5, windowSec: 15 * 60 };

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const cookie = request.cookies.get(COOKIE_NAME)?.value;
    const session = verifySession(cookie);
    if (!session) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }
    if (body.userId && body.userId !== session.loginId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const loginId = session.loginId;
    const rateKey = `login:${loginId}`;

    // H7: Brute force protection (shared across instances)
    if (await isRateLimited(rateKey, LOGIN_LIMIT)) {
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
      await recordAttempt(rateKey, LOGIN_LIMIT);
      throw e;
    }
    await clearRateLimit(rateKey);

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
