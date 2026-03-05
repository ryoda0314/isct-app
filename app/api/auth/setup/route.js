import { NextResponse } from 'next/server';
import { saveCredentials, deleteCredentials, hasCredentials } from '../../../../lib/credentials.js';
import { getToken, invalidateToken, isAuthenticated } from '../../../../lib/auth/token-manager.js';
import { createSessionToken, sessionCookieOptions, COOKIE_NAME, verifySession } from '../../../../lib/auth/session.js';

export async function POST(request) {
  try {
    // Guard: only allow setup if no credentials exist yet, or if already authenticated
    const hasCreds = await hasCredentials();
    if (hasCreds) {
      const cookie = request.cookies.get(COOKIE_NAME)?.value;
      if (!isAuthenticated() || !verifySession(cookie)) {
        return NextResponse.json({ error: 'Already configured. Authenticate first to reconfigure.' }, { status: 403 });
      }
    }

    const { userId, password, totpSecret } = await request.json();
    if (!userId || !password || !totpSecret) {
      return NextResponse.json({ error: 'userId, password, totpSecret are required' }, { status: 400 });
    }

    await saveCredentials({ userId, password, totpSecret });
    invalidateToken();
    const { userid } = await getToken();

    // Issue session cookie
    const token = createSessionToken();
    const response = NextResponse.json({ success: true, moodleUserId: userid });
    response.cookies.set(COOKIE_NAME, token, sessionCookieOptions());
    return response;
  } catch (err) {
    await deleteCredentials();
    invalidateToken();
    return NextResponse.json({ error: 'Login failed' }, { status: 401 });
  }
}
