import { NextResponse } from 'next/server';
import { fetchLibraryCalendar } from '../../../../lib/api/library-hours.js';

export const maxDuration = 30;

/**
 * 附属図書館（大岡山 / すずかけ台）の開館カレンダー。
 * 公式の印刷用カレンダーをスクレイピングして返す公開データ（認証不要）。
 */
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const force = searchParams.get('force') === '1';

  const headers = { 'Cache-Control': 'public, max-age=1800' };

  try {
    const data = await fetchLibraryCalendar({ force });
    if (data?.error) {
      return NextResponse.json(data, { status: 502, headers });
    }
    return NextResponse.json(data, { headers });
  } catch (err) {
    console.error('[LibraryHours API] Error:', err.message);
    return NextResponse.json({ error: true }, { status: 502, headers });
  }
}
