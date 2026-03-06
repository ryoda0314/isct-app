import { NextResponse } from 'next/server';
import { saveCredentials, deleteCredentials, hasCredentials } from '../../../../lib/credentials.js';
import { getToken, invalidateToken } from '../../../../lib/auth/token-manager.js';
import { createSessionToken, sessionCookieOptions, COOKIE_NAME, verifySession } from '../../../../lib/auth/session.js';

export async function POST(request) {
  try {
    const { userId, password, totpSecret } = await request.json();
    if (!userId || !password || !totpSecret) {
      return NextResponse.json({ error: 'userId, password, totpSecret are required' }, { status: 400 });
    }

    // Guard: if this user already has credentials, require their session
    const hadCreds = await hasCredentials(userId);
    if (hadCreds) {
      const cookie = request.cookies.get(COOKIE_NAME)?.value;
      const session = verifySession(cookie);
      if (!session || session.loginId !== userId) {
        return NextResponse.json({ error: 'Already configured. Authenticate first to reconfigure.' }, { status: 403 });
      }
    }

    await saveCredentials(userId, { password, totpSecret });
    invalidateToken(userId);

    try {
      const { userid } = await getToken(userId);
      const token = createSessionToken(userId, userid);
      const response = NextResponse.json({ success: true, moodleUserId: userid });
      response.cookies.set(COOKIE_NAME, token, sessionCookieOptions());
      return response;
    } catch (loginErr) {
      // Clean up only if this was a fresh setup
      if (!hadCreds) await deleteCredentials(userId);
      invalidateToken(userId);
      return NextResponse.json({ error: 'Login failed' }, { status: 401 });
    }
  } catch (err) {
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
