import { NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { promisify } from 'node:util';
import { createSessionToken, sessionCookieOptions, COOKIE_NAME } from '../../../../../lib/auth/session.js';
import { getSupabaseAdmin } from '../../../../../lib/supabase/server.js';
import { resetCircuitBreaker } from '../../../../../lib/auth/token-manager.js';

const scrypt = promisify(crypto.scrypt);

// Brute force protection (mirrors auth/login pattern)
// WARNING: In-memory — resets on serverless cold starts. See auth/login for details.
const loginAttempts = new Map();
const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000;
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of loginAttempts) {
    if (now - v.first > LOCKOUT_MS) loginAttempts.delete(k);
  }
}, 5 * 60 * 1000);

function checkLoginRate(email) {
  const now = Date.now();
  const rec = loginAttempts.get(email);
  if (!rec) return true;
  if (now - rec.first > LOCKOUT_MS) { loginAttempts.delete(email); return true; }
  return rec.count < MAX_ATTEMPTS;
}
function recordFailed(email) {
  const now = Date.now();
  const rec = loginAttempts.get(email);
  if (!rec || now - rec.first > LOCKOUT_MS) {
    loginAttempts.set(email, { count: 1, first: now });
  } else { rec.count++; }
}

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
    if (!checkLoginRate(normalizedEmail)) {
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
      recordFailed(normalizedEmail);
      return NextResponse.json({ error: 'メールアドレスまたはパスワードが正しくありません' }, { status: 401 });
    }

    const valid = await verifyPassword(password, auth.pw_hash);
    if (!valid) {
      recordFailed(normalizedEmail);
      return NextResponse.json({ error: 'メールアドレスまたはパスワードが正しくありません' }, { status: 401 });
    }

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
