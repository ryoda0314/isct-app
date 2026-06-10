import { NextResponse } from 'next/server';
import { verifySession, COOKIE_NAME } from '../../../../lib/auth/session.js';
import { searchLibraryCatalog } from '../../../../lib/api/library-search.js';

export const maxDuration = 30;

/**
 * 附属図書館 OPAC（蔵書検索）。外部サイトへのオープンプロキシ化を防ぐため
 * ログイン必須（syllabus-search / grading-search と同方針）。
 */
export async function GET(request) {
  const cookie = request.cookies.get(COOKIE_NAME)?.value;
  const session = verifySession(cookie);
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const csv = (k) => (searchParams.get(k) || '').split(',').map((s) => s.trim()).filter(Boolean);

  const headers = { 'Cache-Control': 'private, max-age=120' };

  try {
    const data = await searchLibraryCatalog({
      q: searchParams.get('q') || '',
      title: searchParams.get('title') || '',
      author: searchParams.get('author') || '',
      isbn: searchParams.get('isbn') || '',
      publisher: searchParams.get('publisher') || '',
      yearFrom: searchParams.get('yearFrom') || '',
      yearTo: searchParams.get('yearTo') || '',
      formats: csv('formats'),
      locations: csv('locations'),
      japaneseWestern: csv('japaneseWestern'),
      page: searchParams.get('page') || 0,
      rows: searchParams.get('rows') || 20,
    });
    if (data?.error) {
      return NextResponse.json(data, { status: 502, headers });
    }
    return NextResponse.json(data, { headers });
  } catch (err) {
    console.error('[BookSearch API] Error:', err.message);
    return NextResponse.json({ error: true }, { status: 502, headers });
  }
}
