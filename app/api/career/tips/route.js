import { NextResponse } from 'next/server';
import { requireSession } from '../../../../lib/auth/require-auth.js';
import { getSupabaseAdmin } from '../../../../lib/supabase/server.js';
import { checkNgWords } from '../../../../lib/ng-filter.js';
import { consumeRateLimit } from '../../../../lib/rate-limit.js';

// POST /api/career/tips — 学生からの「こんな募集があった」（URL とひとこと）。運営者が公式ページを確かめてから掲載する。
// いたずら対策のためログインした人だけ。保留中は 1 人 3 件まで、1 日 10 件まで。
// 送った人の興味や閲覧の情報は受け取らない（URL とひとことだけ）。

const MAX_PENDING = 3;

export async function POST(request) {
  const auth = await requireSession(request);
  if (auth.error) return auth.error;
  const body = await request.json().catch(() => ({}));
  let url;
  try { url = new URL(String(body.url || '').trim()); } catch { url = null; }
  if (!url || (url.protocol !== 'http:' && url.protocol !== 'https:') || url.toString().length > 1000) {
    return NextResponse.json({ error: '募集ページの URL（http/https）を入れてください' }, { status: 400 });
  }
  const note = String(body.note || '').replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '').trim().slice(0, 300) || null;

  if (!(await consumeRateLimit(`career_tip:${auth.userid}`, { max: 10, windowSec: 86400 }))) {
    return NextResponse.json({ error: '今日はこれ以上送れません' }, { status: 429 });
  }
  const sb = getSupabaseAdmin();
  const { count, error: cErr } = await sb.from('career_tips').select('id', { count: 'exact', head: true }).eq('submitted_by', auth.userid).eq('status', 'pending');
  if (cErr) {
    if (cErr.code === '42P01' || cErr.code === 'PGRST205') return NextResponse.json({ error: 'まだ受け付けていません' }, { status: 503 });
    console.error('[career tips]', cErr.message);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
  if ((count || 0) >= MAX_PENDING) return NextResponse.json({ error: `確認待ちが ${MAX_PENDING} 件あります。確認が済むまでお待ちください` }, { status: 429 });

  if (note) {
    const ng = await checkNgWords(note, { userId: auth.userid, type: 'career_tip' });
    if (ng.blocked) return NextResponse.json({ error: '送れない言葉が含まれています' }, { status: 400 });
  }
  const { error } = await sb.from('career_tips').insert({ url: url.toString(), note, submitted_by: auth.userid });
  if (error) { console.error('[career tips]', error.message); return NextResponse.json({ error: 'Internal error' }, { status: 500 }); }
  return NextResponse.json({ ok: true });
}
