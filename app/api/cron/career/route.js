import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '../../../../lib/supabase/server.js';
import { CAREER_TABLE, isActiveListing } from '../../../../lib/career.js';
import { safeFetch, robotsAllows } from '../../../../lib/career-fetch.js';

// キャリアの掲載の週 1 回の見直し。supabase/career.sql の pg_cron が `Authorization: Bearer <CRON_SECRET>` で呼ぶ。
//   1. 締切を過ぎた・開催が終わった掲載を「終了」にする（公開 API はもともと出さないが、管理画面の状態も合わせる）
//   2. 掲載中のものの応募先リンクを確かめる（robots.txt が許すものだけ。404/410・名前解決できない = 切れている）
//   3. 終了から 90 日たった掲載と、処理済みから 90 日たった情報提供を消す
// 「最終確認から 60 日（随時募集は 30 日）」の要確認は、管理画面がその場で出す（ここでは何もしない）。

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const LINK_BATCH = 40;      // 1 回で確かめるリンクの数（古い順）
const CONCURRENCY = 4;
const DAY = 86400e3;

function authorized(request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return request.headers.get('authorization') === `Bearer ${secret}`;
}

async function checkLink(url) {
  try {
    if (!(await robotsAllows(url))) return 'unknown';
    let r = await safeFetch(url, { method: 'HEAD', timeoutMs: 10000 });
    if ([403, 405, 501].includes(r.status)) r = await safeFetch(url, { method: 'GET', timeoutMs: 10000, maxBytes: 64_000 });
    if (r.status === 404 || r.status === 410) return 'broken';
    if (r.status >= 200 && r.status < 400) return 'ok';
    return 'unknown'; // 403 / 429 / 5xx などはボット避けや一時的な不調のことが多い
  } catch (e) {
    return /ENOTFOUND|EAI_AGAIN|getaddrinfo/.test(String(e?.cause?.code || e?.code || e?.message)) ? 'broken' : 'unknown';
  }
}

export async function GET(request) {
  if (!authorized(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const sb = getSupabaseAdmin();
  const now = Date.now();
  const nowIso = new Date(now).toISOString();
  const result = { closed: 0, checked: 0, broken: 0, deleted: 0, tipsDeleted: 0 };
  try {
    const { data: rows, error } = await sb.from(CAREER_TABLE)
      .select('id, status, deadline, starts_at, ends_at, apply_url, link_checked_at')
      .eq('status', 'published').limit(2000);
    if (error) throw error;

    // 1. 終わったものを終了に
    const ended = (rows || []).filter((r) => !isActiveListing(r, now)).map((r) => r.id);
    if (ended.length) {
      const { error: e } = await sb.from(CAREER_TABLE).update({ status: 'closed', updated_at: nowIso }).in('id', ended);
      if (e) throw e;
      result.closed = ended.length;
    }

    // 2. 応募先リンク（確かめた時刻が古いものから）
    const live = (rows || []).filter((r) => !ended.includes(r.id))
      .sort((a, b) => (Date.parse(a.link_checked_at || 0) || 0) - (Date.parse(b.link_checked_at || 0) || 0))
      .slice(0, LINK_BATCH);
    for (let i = 0; i < live.length; i += CONCURRENCY) {
      const batch = live.slice(i, i + CONCURRENCY);
      const statuses = await Promise.all(batch.map((r) => checkLink(r.apply_url)));
      for (let j = 0; j < batch.length; j++) {
        await sb.from(CAREER_TABLE).update({ link_status: statuses[j], link_checked_at: nowIso }).eq('id', batch[j].id);
        result.checked++;
        if (statuses[j] === 'broken') result.broken++;
      }
    }

    // 3. 古いものを消す
    const cutoff = new Date(now - 90 * DAY).toISOString();
    const { data: del } = await sb.from(CAREER_TABLE).delete().eq('status', 'closed').lt('updated_at', cutoff).select('id');
    result.deleted = (del || []).length;
    const { data: tdel } = await sb.from('career_tips').delete().neq('status', 'pending').lt('reviewed_at', cutoff).select('id');
    result.tipsDeleted = (tdel || []).length;

    console.log('[cron/career]', JSON.stringify(result));
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    if (err?.code === '42P01' || err?.code === 'PGRST205') return NextResponse.json({ ok: true, skipped: 'table missing' });
    console.error('[cron/career]', err?.message || err);
    return NextResponse.json({ ok: false, error: String(err?.message || err), ...result }, { status: 500 });
  }
}
