import { NextResponse } from 'next/server';
import { saveCredentials, deleteCredentials, hasCredentials } from '../../../../lib/credentials.js';
import { getToken, invalidateToken } from '../../../../lib/auth/token-manager.js';
import { createSessionToken, sessionCookieOptions, COOKIE_NAME, verifySession } from '../../../../lib/auth/session.js';
import { getSupabaseAdmin } from '../../../../lib/supabase/server.js';

export async function POST(request) {
  try {
    const { userId, password, totpSecret, portalUserId, portalPassword, matrix, isctValidated } = await request.json();

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

    // portalUserId (学籍番号) を profiles に保存
    const saveStudentId = async (moodleId) => {
      if (!portalUserId) return;
      try {
        const sb = getSupabaseAdmin();
        const m = portalUserId.match(/^(\d{2})([BMDR])(\d)/i);
        const updates = { student_id: portalUserId };
        if (m) updates.year_group = m[1] + m[2].toUpperCase();
        await sb.from('profiles').update(updates).eq('moodle_id', moodleId).is('student_id', null);
      } catch {}
    };

    if (hasIsct) {
      // If already validated in Step 0, use existing session instead of re-doing SSO
      const cookie = request.cookies.get(COOKIE_NAME)?.value;
      const existingSession = isctValidated ? verifySession(cookie) : null;

      if (existingSession?.loginId === loginId) {
        // Already authenticated — just save portal credentials and student_id
        saveStudentId(existingSession.moodleUserId);
        const response = NextResponse.json({ success: true, moodleUserId: existingSession.moodleUserId });
        return response;
      }

      // Full SSO login (not pre-validated)
      invalidateToken(loginId);
      try {
        const { userid, fullname } = await getToken(loginId);

        // Ensure profile exists in DB
        try {
          const sb = getSupabaseAdmin();
          await sb.from('profiles').upsert(
            { moodle_id: userid, name: fullname || `User ${userid}` },
            { onConflict: 'moodle_id', ignoreDuplicates: false }
          );
        } catch (e) {
          console.error('[AuthSetup] profile upsert:', e.message);
        }

        saveStudentId(userid);
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
    // 既存セッションがあれば student_id を保存
    const cookie = request.cookies.get(COOKIE_NAME)?.value;
    const session = verifySession(cookie);
    if (session?.moodleUserId) saveStudentId(session.moodleUserId);

    const response = NextResponse.json({ success: true, portalOnly: true });
    return response;
  } catch (err) {
    console.error('[AuthSetup] POST error:', err.message, err.stack);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
