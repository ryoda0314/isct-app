import { NextResponse } from 'next/server';
import { verifySession, COOKIE_NAME } from '../../../../lib/auth/session.js';
import { searchLibraryCatalog } from '../../../../lib/api/library-search.js';
import { publicGate, guestRateLimit } from '../../../../lib/public-api.js';

export const maxDuration = 30;

/**
 * 附属図書館 OPAC（蔵書検索）。以前は外部サイトへのオープンプロキシ化を防ぐためログイン必須だったが、
 * ログイン任意化で未ログインにも開放した。代わりに未ログインには IP ごとの回数制限をかけ、
 * 検索語の長さも制限する。結果は誰が見ても同じなので CDN に 10 分キャッシュさせる。
 */
export async function GET(request) {
  const cookie = request.cookies.get(COOKIE_NAME)?.value;
  const session = verifySession(cookie);
  if (!session) {
    // 未ログインにも開放（ログイン任意化）。外部サイト（附属図書館 OPAC）への中継なので、
    // 未ログインは IP ごとに 10 分 30 回まで。同じ検索は CDN キャッシュから返る（数えない）。
    const gate = await publicGate(request);
    if (gate) return gate;
    const limited = await guestRateLimit(request, 'libsearch', { max: 30, windowSec: 600 });
    if (limited) return limited;
  }

  const { searchParams } = new URL(request.url);
  const p = (k) => (searchParams.get(k) || '').slice(0, 200);
  const csv = (k) => p(k).split(',').map((s) => s.trim()).filter(Boolean).slice(0, 10);

  const headers = { 'Cache-Control': 'no-store' };
  const okHeaders = { 'Cache-Control': 'public, s-maxage=600, stale-while-revalidate=3000' };

  try {
    const data = await searchLibraryCatalog({
      q: p('q'),
      title: p('title'),
      author: p('author'),
      isbn: p('isbn'),
      publisher: p('publisher'),
      yearFrom: p('yearFrom'),
      yearTo: p('yearTo'),
      formats: csv('formats'),
      locations: csv('locations'),
      japaneseWestern: csv('japaneseWestern'),
      page: searchParams.get('page') || 0,
      rows: searchParams.get('rows') || 20,
    });
    if (data?.error) {
      return NextResponse.json(data, { status: 502, headers });
    }
    return NextResponse.json(data, { headers: okHeaders });
  } catch (err) {
    console.error('[BookSearch API] Error:', err.message);
    return NextResponse.json({ error: true }, { status: 502, headers });
  }
}
