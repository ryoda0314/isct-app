import { NextResponse } from 'next/server';
import { saveCredentials } from '../../../../lib/credentials.js';
import { loginWithCredentials } from '../../../../lib/auth/token-manager.js';
import { createSessionToken, sessionCookieOptions, COOKIE_NAME, verifySession } from '../../../../lib/auth/session.js';
import { getSupabaseAdmin } from '../../../../lib/supabase/server.js';
import { consumeRateLimit, clientIp } from '../../../../lib/rate-limit.js';

export const maxDuration = 60;

export async function POST(request) {
  try {
    const { userId, password, totpSecret, portalUserId, portalPassword, matrix, isctValidated, studentId } = await request.json();

    // Need at least ISCT or Portal credentials
    const hasIsct = userId && password && totpSecret;
    const hasPortal = portalUserId && portalPassword && matrix;

    if (!hasIsct && !hasPortal) {
      return NextResponse.json({ error: 'ISCT または Portal の認証情報が必要です' }, { status: 400 });
    }

    const cookie = request.cookies.get(COOKIE_NAME)?.value;
    const session = verifySession(cookie);

    // Which account the credentials belong to:
    //  - ISCT credentials present → that ISCT account (a stale session for a
    //    different account must not receive them)
    //  - Portal only → only allowed on top of an existing session, so nobody can
    //    attach / overwrite portal credentials on an account they don't own
    if (!hasIsct && !session) {
      return NextResponse.json({ error: 'ログインが必要です', code: 'not_authenticated' }, { status: 401 });
    }
    const loginId = hasIsct ? userId : session.loginId;
    const sessionOwnsAccount = session?.loginId === loginId;

    const portalData = hasPortal ? { portalUserId, portalPassword, matrix } : {};

    // portalUserId or studentId (学籍番号) を profiles に保存
    const saveStudentId = async (moodleId) => {
      const sid = portalUserId || studentId;
      if (!sid) return;
      try {
        const sb = getSupabaseAdmin();
        const updates = { student_id: sid };
        // 新形式: ○○B○○○○○
        const m = sid.match(/^(\d{2})([BMDR])(\d)(\d)?/i);
        if (m) updates.year_group = m[1] + m[2].toUpperCase();
        // 旧医歯学系: 8桁数字
        if (!m) {
          const mL = sid.match(/^(\d{2})(\d{2})\d{4}$/);
          if (mL && /^(11|21|22|31|32|39)$/.test(mL[1])) updates.year_group = mL[2] + "B";
        }
        await sb.from('profiles').update(updates).eq('moodle_id', moodleId).is('student_id', null);
      } catch {}
    };

    if (hasIsct) {
      // Already validated in Step 0 (validate/isct saved the verified ISCT
      // credentials and issued this session) — only add portal data / student_id.
      if (isctValidated && sessionOwnsAccount) {
        if (hasPortal) await saveCredentials(loginId, portalData);
        saveStudentId(session.moodleUserId);
        return NextResponse.json({ success: true, moodleUserId: session.moodleUserId });
      }

      const ipOk = await consumeRateLimit(`setup:ip:${clientIp(request)}`, { max: 10, windowSec: 60 * 60 });
      const accountOk = ipOk && await consumeRateLimit(`setup:id:${loginId}`, { max: 3, windowSec: 15 * 60 });
      if (!ipOk || !accountOk) {
        return NextResponse.json(
          { error: '試行回数が上限に達しました。しばらく待ってから再試行してください', code: 'rate_limited' },
          { status: 429 }
        );
      }

      // Verify with a fresh SSO login BEFORE touching stored credentials
      let userid, fullname;
      try {
        ({ userid, fullname } = await loginWithCredentials(loginId, { password, totpSecret }));
      } catch (loginErr) {
        console.error('[AuthSetup] SSO failed:', loginErr.message);
        const step = loginErr.failedStep || 'unknown';
        return NextResponse.json({ error: 'LMS login failed', code: `isct_${step}`, failedStep: step }, { status: 401 });
      }

      await saveCredentials(loginId, { password, totpSecret, ...portalData });

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
    }

    // Portal only (authenticated): add portal credentials to the session's account
    await saveCredentials(loginId, portalData);
    if (session.moodleUserId) saveStudentId(session.moodleUserId);

    return NextResponse.json({ success: true, portalOnly: true });
  } catch (err) {
    console.error('[AuthSetup] POST error:', err.message, err.stack);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
