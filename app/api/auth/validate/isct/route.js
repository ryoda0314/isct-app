import { NextResponse } from 'next/server';
import { saveCredentials, deleteCredentials } from '../../../../../lib/credentials.js';
import { getToken, invalidateToken } from '../../../../../lib/auth/token-manager.js';
import { createSessionToken, sessionCookieOptions, COOKIE_NAME } from '../../../../../lib/auth/session.js';
import { getSupabaseAdmin } from '../../../../../lib/supabase/server.js';

export async function POST(request) {
  try {
    const { userId, password, totpSecret } = await request.json();

    if (!userId || !password || !totpSecret) {
      return NextResponse.json(
        { valid: false, error: 'すべての項目を入力してください' },
        { status: 400 }
      );
    }

    // Save credentials so getToken/SSO can load them
    await saveCredentials(userId, { password, totpSecret });

    invalidateToken(userId);
    try {
      const { userid, fullname } = await getToken(userId);

      // Ensure profile exists
      try {
        const sb = getSupabaseAdmin();
        await sb.from('profiles').upsert(
          { moodle_id: userid, name: fullname || `User ${userid}` },
          { onConflict: 'moodle_id', ignoreDuplicates: false }
        );
      } catch (e) {
        console.error('[ValidateISCT] profile upsert:', e.message);
      }

      // Create session so setup can skip SSO later
      const token = createSessionToken(userId, userid);
      const response = NextResponse.json({ valid: true, moodleUserId: userid });
      response.cookies.set(COOKIE_NAME, token, sessionCookieOptions());
      return response;
    } catch (loginErr) {
      console.error('[ValidateISCT] SSO failed:', loginErr.message);
      await deleteCredentials(userId);
      invalidateToken(userId);
      return NextResponse.json(
        { valid: false, error: 'LMS認証に失敗しました。ID・パスワード・TOTPシークレットを確認してください' },
        { status: 401 }
      );
    }
  } catch (err) {
    console.error('[ValidateISCT] error:', err.message);
    return NextResponse.json({ valid: false, error: 'Internal error' }, { status: 500 });
  }
}
