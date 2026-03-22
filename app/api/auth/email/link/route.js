import { NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { promisify } from 'node:util';
import { verifySession, COOKIE_NAME } from '../../../../../lib/auth/session.js';
import { getSupabaseAdmin } from '../../../../../lib/supabase/server.js';

const scrypt = promisify(crypto.scrypt);

async function hashPassword(password) {
  const salt = crypto.randomBytes(32).toString('hex');
  const derived = await scrypt(password, salt, 64);
  return `${salt}:${derived.toString('hex')}`;
}

async function verifyPassword(password, hash) {
  const [salt, key] = hash.split(':');
  const derived = await scrypt(password, salt, 64);
  return crypto.timingSafeEqual(Buffer.from(key, 'hex'), derived);
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** POST: メールアドレス+パスワードを現在のアカウントに連携 */
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

    await sb.from('email_auth').upsert({
      email: email.toLowerCase(),
      login_id: session.loginId,
      moodle_id: session.moodleUserId,
      pw_hash: pwHash,
      created_at: new Date().toISOString(),
    }, { onConflict: 'email' });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[EmailLink]', err.message);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
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
