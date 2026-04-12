import { NextResponse } from 'next/server';
import { performPortalLogin } from '../../../../../lib/auth/portal-login.js';
import { verifySession, COOKIE_NAME } from '../../../../../lib/auth/session.js';

export async function POST(request) {
  try {
    // Require a valid session — prevents unauthenticated abuse of Puppeteer resources
    const cookie = request.cookies.get(COOKIE_NAME)?.value;
    const session = verifySession(cookie);
    if (!session) {
      return NextResponse.json({ valid: false, error: 'ログインが必要です' }, { status: 401 });
    }

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

    // All attempts exhausted — return step-specific error
    const failedStep = lastErr?.failedStep || 'unknown';
    const stepMessages = {
      connect:  'ポータルサイトに接続できませんでした。時間をおいて再度お試しください。',
      password: 'アカウントまたはパスワードが正しくありません。入力内容を確認してください。',
      matrix:   'マトリクス認証に失敗しました。マトリクスカードの内容を確認してください。',
      network:  'ページの読み込みがタイムアウトしました。通信環境を確認して再度お試しください。',
      unknown:  '認証に失敗しました。入力内容を確認してから再度お試しください。',
    };
    return NextResponse.json(
      { valid: false, error: stepMessages[failedStep], failedStep },
      { status: 401 }
    );
  } catch (err) {
    console.error('[ValidatePortal] error:', err.message);
    return NextResponse.json({ valid: false, error: 'Internal error' }, { status: 500 });
  }
}
