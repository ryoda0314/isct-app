import { NextResponse } from 'next/server';
import { verifySession, COOKIE_NAME } from '../../../../lib/auth/session.js';
import { loadCredentials } from '../../../../lib/credentials.js';
import { generateTOTP } from '../../../../lib/auth/totp.js';
import { authenticator } from 'otplib';

/**
 * GET /api/auth/totp-code
 * Returns the current TOTP 6-digit code and seconds remaining.
 * Uses server-stored credentials — the secret never leaves the server.
 *
 * 認証はセッションCookieのみで判定する。requireAuth()(=getToken=LMS SSO) には
 * 依存させない: このコードビューアは「SSOが失敗した時に手入力で復旧する」ための
 * 機能であり、SSO成功を要求すると "SSOにTOTPが要る → そのTOTPを見るのにSSO成功が
 * 要る" という循環依存に陥り、SSOが401で落ちている間は永久に読込中になる。
 * TOTP生成に必要なのはセッション(loginId)と保存済みtotpSecretだけで、LMSトークンは不要。
 */
export async function GET(request) {
  const cookie = request.cookies.get(COOKIE_NAME)?.value;
  const session = verifySession(cookie);
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  try {
    const creds = await loadCredentials(session.loginId);
    if (!creds?.totpSecret) {
      return NextResponse.json({ error: 'TOTP not configured' }, { status: 400 });
    }

    const code = generateTOTP(creds.totpSecret);
    const remaining = authenticator.timeRemaining();
    return NextResponse.json({ code, remaining });
  } catch {
    return NextResponse.json({ error: 'Failed to load credentials' }, { status: 500 });
  }
}
