import { NextResponse } from 'next/server';
import { verifySession, COOKIE_NAME } from '../../../../../lib/auth/session.js';
import { getSupabaseAdmin } from '../../../../../lib/supabase/server.js';

const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000; // 15 minutes
const DELAY_PER_ATTEMPT = [0, 0, 1000, 2000, 4000]; // exponential backoff (ms)

/** POST: 確認コードを検証してメール連携を確定 */
export async function POST(request) {
  try {
    const cookie = request.cookies.get(COOKIE_NAME)?.value;
    const session = verifySession(cookie);
    if (!session) {
      return NextResponse.json({ error: 'ログインが必要です' }, { status: 401 });
    }

    const { email, code } = await request.json();
    if (!email || !code) {
      return NextResponse.json({ error: '確認コードを入力してください' }, { status: 400 });
    }

    const sb = getSupabaseAdmin();

    const { data: record, error } = await sb
      .from('email_verification')
      .select('*')
      .eq('email', email.toLowerCase())
      .eq('login_id', session.loginId)
      .single();

    if (error || !record) {
      return NextResponse.json({ error: '確認コードが見つかりません。再度メールアドレスを送信してください' }, { status: 400 });
    }

    // Expired check
    if (new Date(record.expires_at) < new Date()) {
      await sb.from('email_verification').delete().eq('email', email.toLowerCase());
      return NextResponse.json({ error: '確認コードの有効期限が切れました。再度送信してください' }, { status: 410 });
    }

    // Attempt limit with lockout
    if (record.attempts >= MAX_ATTEMPTS) {
      await sb.from('email_verification').delete().eq('email', email.toLowerCase());
      return NextResponse.json({ error: '試行回数の上限に達しました。15分後に再度お試しください' }, { status: 429 });
    }

    // Exponential backoff delay
    const delay = DELAY_PER_ATTEMPT[Math.min(record.attempts, DELAY_PER_ATTEMPT.length - 1)];
    if (delay > 0) await new Promise(r => setTimeout(r, delay));

    // Wrong code — increment attempts
    if (record.code !== code.trim()) {
      await sb.from('email_verification')
        .update({ attempts: record.attempts + 1 })
        .eq('email', email.toLowerCase());
      const remaining = MAX_ATTEMPTS - record.attempts - 1;
      return NextResponse.json({ error: `確認コードが正しくありません（残り${remaining}回）` }, { status: 400 });
    }

    // Code matches — move to email_auth
    await sb.from('email_auth').upsert({
      email: record.email,
      login_id: record.login_id,
      moodle_id: record.moodle_id,
      pw_hash: record.pw_hash,
      created_at: new Date().toISOString(),
    }, { onConflict: 'email' });

    // Clean up verification record
    await sb.from('email_verification').delete().eq('email', email.toLowerCase());

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[EmailVerify]', err.message);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
