import { NextResponse } from 'next/server';
import { verifySession, COOKIE_NAME } from '../../../../lib/auth/session.js';
import { searchMedCatalog } from '../../../../lib/api/library-search-med.js';
import { publicGate, guestRateLimit } from '../../../../lib/public-api.js';

// 医歯学系（お茶の水・国府台）OPAC は JS 駆動のためヘッドレスブラウザで取得 → 時間がかかる。
export const maxDuration = 60;

export async function GET(request) {
  const cookie = request.cookies.get(COOKIE_NAME)?.value;
  const session = verifySession(cookie);
  if (!session) {
    // 未ログインにも開放（ログイン任意化）。ヘッドレスブラウザを使う重い処理なので、
    // 未ログインは IP ごとに 10 分 10 回まで。同じ検索は CDN キャッシュ（1 時間）から返る。
    const gate = await publicGate(request);
    if (gate) return gate;
    const limited = await guestRateLimit(request, 'libsearch-med', { max: 10, windowSec: 600 });
    if (limited) return limited;
  }

  const { searchParams } = new URL(request.url);
  const q = (searchParams.get('q') || '').slice(0, 200);

  const headers = { 'Cache-Control': 'no-store' };
  const okHeaders = { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=18000' };

  try {
    const data = await searchMedCatalog({ q });
    if (data?.error) {
      return NextResponse.json(data, { status: 502, headers });
    }
    return NextResponse.json(data, { headers: okHeaders });
  } catch (err) {
    console.error('[BookSearchMed API] Error:', err.message);
    return NextResponse.json({ error: true }, { status: 502, headers });
  }
}
