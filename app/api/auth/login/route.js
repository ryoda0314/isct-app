import { NextResponse } from 'next/server';
import { getToken, invalidateToken } from '../../../../lib/auth/token-manager.js';
import { createSessionToken, sessionCookieOptions, COOKIE_NAME, verifySession } from '../../../../lib/auth/session.js';

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

    invalidateToken(loginId);
    const { userid } = await getToken(loginId);

    const token = createSessionToken(loginId, userid);
    const response = NextResponse.json({ success: true, moodleUserId: userid });
    response.cookies.set(COOKIE_NAME, token, sessionCookieOptions());
    return response;
  } catch (err) {
    return NextResponse.json({ error: 'Login failed' }, { status: 401 });
  }
}
