import { NextResponse } from 'next/server';
import { performPortalLogin } from '../../../../../lib/auth/portal-login.js';

export async function POST(request) {
  try {
    const { portalUserId, portalPassword, matrix } = await request.json();

    if (!portalUserId || !portalPassword || !matrix) {
      return NextResponse.json(
        { valid: false, error: 'すべての項目を入力してください' },
        { status: 400 }
      );
    }

    try {
      await performPortalLogin({
        userId: portalUserId,
        password: portalPassword,
        matrix,
      });
      return NextResponse.json({ valid: true });
    } catch (loginErr) {
      console.error('[ValidatePortal] login failed:', loginErr.message);
      return NextResponse.json(
        { valid: false, error: 'ポータル認証に失敗しました。アカウント・パスワード・マトリクスカードを確認してください' },
        { status: 401 }
      );
    }
  } catch (err) {
    console.error('[ValidatePortal] error:', err.message);
    return NextResponse.json({ valid: false, error: 'Internal error' }, { status: 500 });
  }
}
