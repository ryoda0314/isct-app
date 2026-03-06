import { NextResponse } from 'next/server';
import { getToken } from './token-manager.js';
import { verifySession, COOKIE_NAME } from './session.js';

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
    return { ...tokenData, loginId: session.loginId, error: null };
  } catch {
    return { error: NextResponse.json({ error: 'Authentication failed' }, { status: 401 }) };
  }
}
