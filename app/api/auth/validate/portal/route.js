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

    // Auto-retry up to 2 times before returning failure
    const MAX_ATTEMPTS = 2;
    let lastErr;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        await performPortalLogin({
          userId: portalUserId,
          password: portalPassword,
          matrix,
        });
        console.log(`[ValidatePortal] success for ${portalUserId}`);
        return NextResponse.json({ valid: true });
      } catch (loginErr) {
        lastErr = loginErr;
        console.error(`[ValidatePortal] attempt ${attempt}/${MAX_ATTEMPTS} failed:`, loginErr.message);
        if (attempt < MAX_ATTEMPTS) {
          await new Promise(r => setTimeout(r, 1500));
        }
      }
    }

    // All attempts exhausted
    return NextResponse.json(
      { valid: false, error: '認証に複数回失敗しました。アカウント・パスワード・マトリクスカードが正しいか確認してから再度お試しください' },
      { status: 401 }
    );
  } catch (err) {
    console.error('[ValidatePortal] error:', err.message);
    return NextResponse.json({ valid: false, error: 'Internal error' }, { status: 500 });
  }
}
