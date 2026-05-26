import { NextResponse } from 'next/server';
import { verifySession, COOKIE_NAME } from '../../../../../lib/auth/session.js';
import { getToken, invalidateToken } from '../../../../../lib/auth/token-manager.js';

/**
 * POST /api/auth/token/refresh
 * Force a fresh SSO login by invalidating the cached wstoken (memory + DB)
 * and re-running SSO. Used by the client when Moodle returns `invalidtoken`,
 * which happens when the wstoken expires server-side (~weeks).
 *
 * Heavy operation (Puppeteer SSO ~10s). Tier-limited to 5 req/min via middleware.
 */
export async function POST(request) {
  const cookie = request.cookies.get(COOKIE_NAME)?.value;
  const session = verifySession(cookie);
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  try {
    invalidateToken(session.loginId);
    const tokenData = await getToken(session.loginId);
    return NextResponse.json({
      wstoken: tokenData.wstoken,
      userid: tokenData.userid,
      fullname: tokenData.fullname,
    });
  } catch (e) {
    console.error(`[TokenRefresh] failed for loginId=${session.loginId}:`, e.message);
    return NextResponse.json({ error: 'Token refresh failed' }, { status: 401 });
  }
}
