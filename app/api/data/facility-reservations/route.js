import { NextResponse } from 'next/server';
import { requireSession } from '../../../../lib/auth/require-auth.js';
import { readFacilityWeek } from '../../../../lib/api/facility-cache.js';

// Taki Plaza の予約状況（週ごと）。以前は開くたびにサーバーのヘッドレスブラウザで教務Webを読み取っていたが、
// 遅いので定期的に読み取って DB に保存したもの（lib/api/facility-cache.js）を返すだけにした。
// 予約には団体名などが入るので、公開はせずアカウントのときだけ（ポータルの資格情報は不要になった）。
// 応答: 保存データ（{ building, weekStart, weekEnd, days, spaces }）＋ fetchedAt。まだ無い週は notCached: true。

function todayJST() {
  const d = new Date(Date.now() + 9 * 3600e3);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

export async function GET(request) {
  const auth = await requireSession(request);
  if (auth.error) return auth.error;

  const { searchParams } = new URL(request.url);
  const raw = searchParams.get('date') || '';
  const date = /^\d{8}$/.test(raw) ? `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}` : todayJST();
  const rawB = searchParams.get('b');
  const building = /^\d+$/.test(rawB || '') ? rawB : '1';
  const headers = { 'Cache-Control': 'private, max-age=120' };

  try {
    const row = await readFacilityWeek({ date, building });
    if (!row) return NextResponse.json({ notCached: true, days: [], spaces: [], fetchedAt: null }, { headers });
    return NextResponse.json({ ...row.data, fetchedAt: row.fetched_at }, { headers });
  } catch (err) {
    // テーブル未作成（supabase/facility-reservations.sql 未実行）
    if (err.code === '42P01' || err.code === 'PGRST205') {
      return NextResponse.json({ notCached: true, days: [], spaces: [], fetchedAt: null }, { headers });
    }
    console.error('[FacilityReservations API] Error:', err.message);
    return NextResponse.json({ error: '予約状況の取得に失敗しました。' }, { status: 500 });
  }
}
