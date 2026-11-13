import { NextResponse } from 'next/server';
import { refreshFacilityReservations } from '../../../../lib/api/facility-cache.js';

// Taki Plaza の予約状況を数週分まとめて読み取り、DB に保存する（lib/api/facility-cache.js）。
// supabase/facility-reservations.sql の pg_cron が月 1 回ほど `Authorization: Bearer <CRON_SECRET>` で呼ぶ。
// 手動で今すぐ更新したいときも同じ URL を同じヘッダーで呼ぶ。?weeks=1〜8（既定 6）。

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

function authorized(request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return request.headers.get('authorization') === `Bearer ${secret}`;
}

export async function GET(request) {
  if (!authorized(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const n = Number(new URL(request.url).searchParams.get('weeks'));
  const weeks = Number.isFinite(n) && n >= 1 ? Math.min(8, Math.floor(n)) : 6;
  try {
    const result = await refreshFacilityReservations({ weeks });
    console.log('[cron/facility-reservations]', JSON.stringify(result));
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error('[cron/facility-reservations]', err.message);
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
