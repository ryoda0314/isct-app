import { NextResponse } from 'next/server';
import { requireAuth } from '../../../lib/auth/require-auth.js';
import { getSupabaseAdmin } from '../../../lib/supabase/server.js';

const VALID_CATEGORIES = ['bug', 'feature', 'question', 'account', 'other'];

// 端末情報（診断用）はクライアントから渡された値を信用しすぎず、
// 必要なキーだけ拾って長さを制限する。
function sanitizeDiagnostics(d) {
  if (!d || typeof d !== 'object') return null;
  const pick = (v, max = 200) => (typeof v === 'string' ? v.slice(0, max) : (typeof v === 'number' ? v : undefined));
  const out = {
    appVersion: pick(d.appVersion, 40),
    platform: pick(d.platform, 40),
    userAgent: pick(d.userAgent, 400),
    screen: pick(d.screen, 40),
    lang: pick(d.lang, 16),
    view: pick(d.view, 60),
  };
  // 空のキーを除去
  for (const k of Object.keys(out)) if (out[k] === undefined) delete out[k];
  return Object.keys(out).length ? out : null;
}

// POST /api/feedback — ユーザーが不具合報告・お問い合わせを送信
export async function POST(request) {
  try {
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;

    const { category, subject, body, contact, diagnostics } = await request.json();

    if (!body || !body.trim()) {
      return NextResponse.json({ error: '内容を入力してください' }, { status: 400 });
    }
    const cat = VALID_CATEGORIES.includes(category) ? category : 'other';

    const sb = getSupabaseAdmin();

    // 簡易レート制限: 直近1時間に5件まで（連投・誤送信の抑制）
    const hourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count } = await sb
      .from('feedback')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', auth.userid)
      .gte('created_at', hourAgo);
    if ((count || 0) >= 5) {
      return NextResponse.json({ error: '送信が多すぎます。しばらくしてからお試しください' }, { status: 429 });
    }

    const { error } = await sb.from('feedback').insert({
      user_id: auth.userid,
      category: cat,
      subject: subject?.trim()?.slice(0, 120) || null,
      body: body.trim().slice(0, 4000),
      contact: contact?.trim()?.slice(0, 200) || null,
      diagnostics: sanitizeDiagnostics(diagnostics),
    });

    if (error) {
      console.error('[Feedback POST]', error.message);
      return NextResponse.json({ error: 'Internal error' }, { status: 500 });
    }

    // 運営への通知（任意・ベストエフォート）。FEEDBACK_NOTIFY_EMAIL と RESEND が
    // 設定されている場合のみ送信し、失敗してもユーザー送信は成功扱いにする。
    notifyOps({ category: cat, subject, body, contact, name: auth.fullname, userid: auth.userid }).catch(() => {});

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('[Feedback POST]', e);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

async function notifyOps({ category, subject, body, contact, name, userid }) {
  const to = process.env.FEEDBACK_NOTIFY_EMAIL;
  if (!to || !process.env.RESEND_API_KEY) return;
  const { Resend } = await import('resend');
  const resend = new Resend(process.env.RESEND_API_KEY);
  const from = process.env.EMAIL_FROM || 'ScienceTokyo App <noreply@sciencetokyo.app>';
  const esc = (s) => String(s || '').replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]));
  await resend.emails.send({
    from,
    to,
    subject: `[Feedback/${category}] ${subject ? esc(subject).slice(0, 80) : '(件名なし)'}`,
    html: `
      <div style="font-family:system-ui,sans-serif;max-width:560px;line-height:1.7">
        <p style="margin:0 0 4px"><b>カテゴリ:</b> ${esc(category)}</p>
        <p style="margin:0 0 4px"><b>送信者:</b> ${esc(name)} (moodle_id: ${esc(userid)})</p>
        ${contact ? `<p style="margin:0 0 4px"><b>連絡先:</b> ${esc(contact)}</p>` : ''}
        ${subject ? `<p style="margin:0 0 4px"><b>件名:</b> ${esc(subject)}</p>` : ''}
        <hr style="border:none;border-top:1px solid #eee;margin:12px 0"/>
        <pre style="white-space:pre-wrap;word-break:break-word;font-family:inherit;margin:0">${esc(body)}</pre>
      </div>
    `,
  });
}
