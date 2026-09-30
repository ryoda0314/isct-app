import { NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { promisify } from 'node:util';
import { createSessionToken, sessionCookieOptions, COOKIE_NAME } from '../../../../../lib/auth/session.js';
import { getSupabaseAdmin } from '../../../../../lib/supabase/server.js';
import { resetCircuitBreaker } from '../../../../../lib/auth/token-manager.js';
import { isRateLimited, recordAttempt, clearRateLimit, clientIp } from '../../../../../lib/rate-limit.js';

const scrypt = promisify(crypto.scrypt);

// Brute force protection — failed attempts are counted per email and per IP
// in Supabase (supabase/rate-limits.sql) so limits hold across instances.
const PER_EMAIL = { max: 5, windowSec: 15 * 60 };
const PER_IP = { max: 30, windowSec: 60 * 60 };

async function verifyPassword(password, hash) {
  const [salt, key] = hash.split(':');
  const derived = await scrypt(password, salt, 64);
  return crypto.timingSafeEqual(Buffer.from(key, 'hex'), derived);
}

/** POST: メールアドレス+パスワードでログイン */
export async function POST(request) {
  try {
    const { email, password } = await request.json();

    if (!email || !password) {
      return NextResponse.json({ error: 'メールアドレスとパスワードを入力してください' }, { status: 400 });
    }

    const normalizedEmail = email.toLowerCase();

    // Brute force protection
    const emailKey = `email-login:${normalizedEmail}`;
    const ipKey = `email-login:ip:${clientIp(request)}`;
    const recordFailed = () => Promise.all([
      recordAttempt(emailKey, PER_EMAIL),
      recordAttempt(ipKey, PER_IP),
    ]);
    const [emailLimited, ipLimited] = await Promise.all([
      isRateLimited(emailKey, PER_EMAIL),
      isRateLimited(ipKey, PER_IP),
    ]);
    if (emailLimited || ipLimited) {
      return NextResponse.json(
        { error: 'ログイン試行回数が上限に達しました。しばらく待ってから再試行してください' },
        { status: 429 }
      );
    }

    const sb = getSupabaseAdmin();
    const { data: auth, error } = await sb
      .from('email_auth')
      .select('login_id, moodle_id, pw_hash')
      .eq('email', normalizedEmail)
      .single();

    if (error || !auth) {
      await recordFailed();
      return NextResponse.json({ error: 'メールアドレスまたはパスワードが正しくありません' }, { status: 401 });
    }

    const valid = await verifyPassword(password, auth.pw_hash);
    if (!valid) {
      await recordFailed();
      return NextResponse.json({ error: 'メールアドレスまたはパスワードが正しくありません' }, { status: 401 });
    }

    await clearRateLimit(emailKey);

    // Upsert profile name (in case it's missing)
    try {
      const { data: profile } = await sb
        .from('profiles')
        .select('name')
        .eq('moodle_id', auth.moodle_id)
        .single();

      if (!profile) {
        await sb.from('profiles').upsert(
          { moodle_id: auth.moodle_id, name: `User ${auth.moodle_id}` },
          { onConflict: 'moodle_id', ignoreDuplicates: true }
        );
      }
    } catch {}

    // Reset circuit breaker so getToken can re-attempt SSO after login
    // (don't invalidateToken — preserve existing DB token for fast re-auth)
    resetCircuitBreaker(auth.login_id);

    const token = createSessionToken(auth.login_id, auth.moodle_id);
    const response = NextResponse.json({ success: true, moodleUserId: auth.moodle_id });
    response.cookies.set(COOKIE_NAME, token, sessionCookieOptions());
    return response;
  } catch (err) {
    console.error('[EmailLogin]', err.message);
    return NextResponse.json({ error: 'Login failed' }, { status: 401 });
  }
}
