import { NextResponse } from 'next/server';
import { COOKIE_NAME, sessionCookieOptions } from '../../../../lib/auth/session.js';
import { invalidateToken } from '../../../../lib/auth/token-manager.js';
import { verifySession } from '../../../../lib/auth/session.js';

/** Cookie deletion options — must match login attributes for browser to actually delete */
function deleteCookieOptions() {
  const opts = sessionCookieOptions();
  opts.maxAge = 0;
  return opts;
}

export async function POST(request) {
  try {
    const cookie = request.cookies.get(COOKIE_NAME)?.value;
    const session = verifySession(cookie);
    if (session?.loginId) {
      invalidateToken(session.loginId);
    }
    const response = NextResponse.json({ success: true });
    response.cookies.set(COOKIE_NAME, '', deleteCookieOptions());
    return response;
  } catch {
    const response = NextResponse.json({ success: true });
    response.cookies.set(COOKIE_NAME, '', deleteCookieOptions());
    return response;
  }
}
