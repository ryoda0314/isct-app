import { NextResponse } from 'next/server';
import { getToken, invalidateToken } from '../../../../lib/auth/token-manager.js';
import { createSessionToken, sessionCookieOptions, COOKIE_NAME } from '../../../../lib/auth/session.js';

export async function POST() {
  try {
    invalidateToken();
    const { userid } = await getToken();

    // Issue session cookie
    const token = createSessionToken();
    const response = NextResponse.json({ success: true, moodleUserId: userid });
    response.cookies.set(COOKIE_NAME, token, sessionCookieOptions());
    return response;
  } catch (err) {
    return NextResponse.json({ error: 'Login failed' }, { status: 401 });
  }
}
