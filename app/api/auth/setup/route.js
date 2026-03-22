import { NextResponse } from 'next/server';
import { saveCredentials, deleteCredentials, hasCredentials } from '../../../../lib/credentials.js';
import { getToken, invalidateToken } from '../../../../lib/auth/token-manager.js';
import { createSessionToken, sessionCookieOptions, COOKIE_NAME } from '../../../../lib/auth/session.js';

export async function POST(request) {
  try {
    const { userId, password, totpSecret, portalUserId, portalPassword, matrix } = await request.json();

    // Need at least ISCT or Portal credentials
    const hasIsct = userId && password && totpSecret;
    const hasPortal = portalUserId && portalPassword && matrix;

    if (!hasIsct && !hasPortal) {
      return NextResponse.json({ error: 'ISCT または Portal の認証情報が必要です' }, { status: 400 });
    }

    const loginId = userId || portalUserId;

    const hadCreds = await hasCredentials(loginId);

    // Build credential object
    const credData = {};
    if (totpSecret) credData.totpSecret = totpSecret;
    if (hasPortal) {
      credData.portalUserId = portalUserId;
      credData.portalPassword = portalPassword;
      credData.matrix = matrix;
    }

    await saveCredentials(loginId, {
      password: password || portalPassword,
      ...credData,
    });

    if (hasIsct) {
      invalidateToken(loginId);
      try {
        const { userid } = await getToken(loginId);
        const token = createSessionToken(loginId, userid);
        const response = NextResponse.json({ success: true, moodleUserId: userid });
        response.cookies.set(COOKIE_NAME, token, sessionCookieOptions());
        return response;
      } catch (loginErr) {
        if (!hadCreds) await deleteCredentials(loginId);
        invalidateToken(loginId);
        return NextResponse.json({ error: 'LMS login failed' }, { status: 401 });
      }
    }

    // Portal only — save credentials but skip LMS login
    const response = NextResponse.json({ success: true, portalOnly: true });
    return response;
  } catch (err) {
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
