import { NextResponse } from 'next/server';
import { verifySession, COOKIE_NAME } from '../../../../lib/auth/session.js';
import { searchMedCatalog } from '../../../../lib/api/library-search-med.js';

// 医歯学系（お茶の水・国府台）OPAC は JS 駆動のためヘッドレスブラウザで取得 → 時間がかかる。
export const maxDuration = 60;

export async function GET(request) {
  const cookie = request.cookies.get(COOKIE_NAME)?.value;
  const session = verifySession(cookie);
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const q = searchParams.get('q') || '';

  const headers = { 'Cache-Control': 'private, max-age=300' };

  try {
    const data = await searchMedCatalog({ q });
    if (data?.error) {
      return NextResponse.json(data, { status: 502, headers });
    }
    return NextResponse.json(data, { headers });
  } catch (err) {
    console.error('[BookSearchMed API] Error:', err.message);
    return NextResponse.json({ error: true }, { status: 502, headers });
  }
}
