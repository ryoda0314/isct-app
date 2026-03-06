import { NextResponse } from 'next/server';
import { isAuthenticated } from '../../../../lib/auth/token-manager.js';
import { verifySession, COOKIE_NAME } from '../../../../lib/auth/session.js';

export async function GET(request) {
  try {
    const cookie = request.cookies.get(COOKIE_NAME)?.value;
    const session = verifySession(cookie);

    if (session) {
      return NextResponse.json({
        hasCredentials: true,
        isAuthenticated: isAuthenticated(session.loginId),
        loginId: session.loginId,
      });
    }

    return NextResponse.json({ hasCredentials: false, isAuthenticated: false });
  } catch (err) {
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
