import { NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { promisify } from 'node:util';
import { verifySession, COOKIE_NAME } from '../../../../../lib/auth/session.js';
import { getSupabaseAdmin } from '../../../../../lib/supabase/server.js';
import { sendVerificationCode } from '../../../../../lib/email.js';

const scrypt = promisify(crypto.scrypt);

async function hashPassword(password) {
  const salt = crypto.randomBytes(32).toString('hex');
  const derived = await scrypt(password, salt, 64);
  return `${salt}:${derived.toString('hex')}`;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CODE_TTL = 10 * 60 * 1000; // 10分

function generateCode() {
  return crypto.randomInt(100000, 999999).toString();
}

/** POST: 確認コードをメール送信 */
export async function POST(request) {
  try {
    const cookie = request.cookies.get(COOKIE_NAME)?.value;
    const session = verifySession(cookie);
    if (!session) {
      return NextResponse.json({ error: 'ログインが必要です' }, { status: 401 });
    }

    const { email, password } = await request.json();

    if (!email || !EMAIL_RE.test(email)) {
      return NextResponse.json({ error: '有効なメールアドレスを入力してください' }, { status: 400 });
    }
    if (!password || password.length < 8) {
      return NextResponse.json({ error: 'パスワードは8文字以上にしてください' }, { status: 400 });
    }

    const sb = getSupabaseAdmin();

    // Check if email is already linked to another account
    const { data: existing } = await sb
      .from('email_auth')
      .select('login_id')
      .eq('email', email.toLowerCase())
      .single();

    if (existing && existing.login_id !== session.loginId) {
      return NextResponse.json({ error: 'このメールアドレスは既に別のアカウントに連携されています' }, { status: 409 });
    }

    const pwHash = await hashPassword(password);
    const code = generateCode();
    const expiresAt = new Date(Date.now() + CODE_TTL).toISOString();

    // Save verification record (upsert — resend overwrites previous code)
    await sb.from('email_verification').upsert({
      email: email.toLowerCase(),
      login_id: session.loginId,
      moodle_id: session.moodleUserId,
      pw_hash: pwHash,
      code,
      expires_at: expiresAt,
      attempts: 0,
      created_at: new Date().toISOString(),
    }, { onConflict: 'email' });

    // Send verification email
    await sendVerificationCode(email.toLowerCase(), code);

    return NextResponse.json({ success: true, needsVerification: true });
  } catch (err) {
    console.error('[EmailLink]', err.message);
    return NextResponse.json({ error: 'メール送信に失敗しました' }, { status: 500 });
  }
}

/** DELETE: メールアドレス連携を解除 */
export async function DELETE(request) {
  try {
    const cookie = request.cookies.get(COOKIE_NAME)?.value;
    const session = verifySession(cookie);
    if (!session) {
      return NextResponse.json({ error: 'ログインが必要です' }, { status: 401 });
    }

    const sb = getSupabaseAdmin();
    await sb.from('email_auth').delete().eq('login_id', session.loginId);

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[EmailUnlink]', err.message);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
