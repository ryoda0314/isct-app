import { NextResponse } from 'next/server';
import { fetchLibraryCalendar } from '../../../../lib/api/library-hours.js';

// TMDU(お茶の水・国府台)の月グリッドは Puppeteer で取得するため、キャッシュ未命中時は時間がかかる
export const maxDuration = 60;

/**
 * 附属図書館（大岡山 / すずかけ台 / お茶の水 / 国府台）の開館カレンダー。
 * 理工=公式印刷カレンダーfetch、医歯学系=Puppeteerで月グリッド取得。12hキャッシュ。
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
