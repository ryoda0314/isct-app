import { NextResponse } from 'next/server';
import { isAuthenticated, getToken } from './token-manager.js';
import { verifySession, COOKIE_NAME } from './session.js';

/**
 * Verify that the request comes from an authenticated session.
 * Returns { wstoken, userid, fullname, error: null } on success,
 * or { error: NextResponse } on failure.
 */
export async function requireAuth(request) {
  if (!isAuthenticated()) {
    return { error: NextResponse.json({ error: 'Not authenticated' }, { status: 401 }) };
  }

  const cookie = request.cookies.get(COOKIE_NAME)?.value;
  if (!verifySession(cookie)) {
    return { error: NextResponse.json({ error: 'Invalid session' }, { status: 401 }) };
  }

  const tokenData = await getToken();
  return { ...tokenData, error: null };
}
