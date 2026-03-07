import { NextResponse } from 'next/server';
import { COOKIE_NAME } from '../../../../lib/auth/session.js';
import { invalidateToken } from '../../../../lib/auth/token-manager.js';
import { verifySession } from '../../../../lib/auth/session.js';

export async function POST(request) {
  try {
    const cookie = request.cookies.get(COOKIE_NAME)?.value;
    const session = verifySession(cookie);
    if (session?.loginId) {
      invalidateToken(session.loginId);
    }
    const response = NextResponse.json({ success: true });
    response.cookies.set(COOKIE_NAME, '', { path: '/', maxAge: 0 });
    return response;
  } catch {
    const response = NextResponse.json({ success: true });
    response.cookies.set(COOKIE_NAME, '', { path: '/', maxAge: 0 });
    return response;
  }
}
