import { NextResponse } from 'next/server';
import { saveCredentials } from '../../../../../lib/credentials.js';
import { loginWithCredentials } from '../../../../../lib/auth/token-manager.js';
import { createSessionToken, sessionCookieOptions, COOKIE_NAME } from '../../../../../lib/auth/session.js';
import { getSupabaseAdmin } from '../../../../../lib/supabase/server.js';
import { consumeRateLimit, clientIp } from '../../../../../lib/rate-limit.js';

export const maxDuration = 60;

// This endpoint is unauthenticated (first-time setup) and launches Puppeteer,
// so it is limited per account AND per IP. Counters live in Supabase
// (supabase/rate-limits.sql) so they hold across serverless instances.
const PER_ACCOUNT = { max: 3, windowSec: 15 * 60 };
const PER_IP = { max: 10, windowSec: 60 * 60 };

const STEP_MESSAGES = {
  connect:  'ISCTの認証サーバーに接続できませんでした。時間をおいて再度お試しください。',
  password: 'ISCTアカウントまたはパスワードが正しくありません。',
  totp:     'ワンタイムパスワード(TOTP)の認証に失敗しました。TOTPシークレットを確認してください。',
  network:  '通信がタイムアウトしました。通信環境を確認して再度お試しください。',
  unknown:  '認証に失敗しました。ID・パスワード・TOTPシークレットが正しいか確認してから再度お試しください。',
};

export async function POST(request) {
  try {
    const { userId, password, totpSecret } = await request.json();

    if (!userId || !password || !totpSecret) {
      return NextResponse.json(
        { valid: false, error: 'すべての項目を入力してください', code: 'missing_fields' },
        { status: 400 }
      );
    }

    const ipOk = await consumeRateLimit(`validate-isct:ip:${clientIp(request)}`, PER_IP);
    const accountOk = ipOk && await consumeRateLimit(`validate-isct:id:${userId}`, PER_ACCOUNT);
    if (!ipOk || !accountOk) {
      return NextResponse.json(
        { valid: false, error: '検証の試行回数が上限に達しました。しばらく待ってから再試行してください', code: 'rate_limited' },
        { status: 429 }
      );
    }

    // Verify the submitted credentials with a fresh SSO login. Stored
    // credentials are NOT touched until this succeeds, so a failed attempt
    // (or someone typing another student's ID) can't overwrite or delete them.
    const MAX_ATTEMPTS = 2;
    let lastErr;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        const { userid, fullname } = await loginWithCredentials(userId, { password, totpSecret });

        // Verified — persist (merges with any existing portal credentials)
        await saveCredentials(userId, { password, totpSecret });

        try {
          const sb = getSupabaseAdmin();
          await sb.from('profiles').upsert(
            { moodle_id: userid, name: fullname || `User ${userid}` },
            { onConflict: 'moodle_id', ignoreDuplicates: false }
          );
        } catch (e) {
          console.error('[ValidateISCT] profile upsert:', e.message);
        }

        console.log(`[ValidateISCT] success for ${userId} (moodle_id=${userid})`);

        // Create session so setup can skip SSO later
        const token = createSessionToken(userId, userid);
        const response = NextResponse.json({ valid: true, moodleUserId: userid });
        response.cookies.set(COOKIE_NAME, token, sessionCookieOptions());
        return response;
      } catch (loginErr) {
        lastErr = loginErr;
        console.error(`[ValidateISCT] SSO attempt ${attempt}/${MAX_ATTEMPTS} failed:`, loginErr.message);
        // Wrong password / TOTP won't fix itself — don't burn another Puppeteer run
        if (loginErr.failedStep === 'password' || loginErr.failedStep === 'totp') break;
        if (attempt < MAX_ATTEMPTS) {
          await new Promise(r => setTimeout(r, 1500));
        }
      }
    }

    const failedStep = STEP_MESSAGES[lastErr?.failedStep] ? lastErr.failedStep : 'unknown';
    return NextResponse.json(
      { valid: false, error: STEP_MESSAGES[failedStep], code: `isct_${failedStep}`, failedStep },
      { status: 401 }
    );
  } catch (err) {
    console.error('[ValidateISCT] error:', err.message);
    return NextResponse.json({ valid: false, error: 'Internal error', code: 'internal' }, { status: 500 });
  }
}
