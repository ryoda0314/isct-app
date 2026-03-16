import { NextResponse } from 'next/server';
import fs from 'node:fs/promises';
import { isAuthenticated, getToken } from '../../../../lib/auth/token-manager.js';
import { verifySession, createSessionToken, sessionCookieOptions, COOKIE_NAME } from '../../../../lib/auth/session.js';
import { loadCredentials } from '../../../../lib/credentials.js';
import { DATA_DIR } from '../../../../lib/config.js';

/** Find loginId from credential files on disk */
async function findStoredLoginId() {
  try {
    const files = await fs.readdir(DATA_DIR);
    const cred = files.find(f => f.startsWith('cred-') && f.endsWith('.enc'));
    if (!cred) return null;
    return cred.slice(5, -4); // cred-{loginId}.enc → loginId
  } catch { return null; }
}

export async function GET(request) {
  try {
    const cookie = request.cookies.get(COOKIE_NAME)?.value;
    const session = verifySession(cookie);

    if (session) {
      let hasPortal = false;
      try {
        const creds = await loadCredentials(session.loginId);
        hasPortal = !!(creds.portalUserId && creds.portalPassword && creds.matrix);
      } catch {}
      return NextResponse.json({
        hasCredentials: true,
        isAuthenticated: isAuthenticated(session.loginId),
        loginId: session.loginId,
        hasPortal,
      });
    }

    // Session cookie missing/invalid — check if credentials exist on disk
    const loginId = await findStoredLoginId();
    if (loginId) {
      try {
        const { userid } = await getToken(loginId);
        const token = createSessionToken(loginId, userid);
        const response = NextResponse.json({
          hasCredentials: true,
          isAuthenticated: true,
          loginId,
        });
        response.cookies.set(COOKIE_NAME, token, sessionCookieOptions());
        return response;
      } catch {
        // Credentials exist but login failed — still report hasCredentials
        // so the app can show a re-auth prompt instead of full setup
        return NextResponse.json({ hasCredentials: true, isAuthenticated: false, loginId });
      }
    }

    return NextResponse.json({ hasCredentials: false, isAuthenticated: false });
  } catch (err) {
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
