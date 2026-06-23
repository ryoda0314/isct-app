import { NextResponse } from 'next/server';
import { requireAuth } from '../../../../lib/auth/require-auth.js';
import { searchStaticDestinations } from '../../../../lib/api/static-timetables.js';

// 目的地検索: 出発駅(大岡山など)から到達可能な目的地駅を駅名で検索する。
// GET ?q=目黒&lang=ja → { results: [{ origin, originTitle, dest, destTitle }] }
// ※ 現状は静的同梱(東急)のみ。ODPT 対応路線の目的地選択は将来拡張。

export async function GET(request) {
  try {
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;

    const { searchParams } = new URL(request.url);
    const q = (searchParams.get('q') || '').trim();
    const lang = searchParams.get('lang') || 'ja';
    if (!q) return NextResponse.json({ results: [] });

    return NextResponse.json({ results: searchStaticDestinations(q, lang) });
  } catch (err) {
    console.error('[Train search]', err);
    return NextResponse.json({ error: 'Internal error', results: [] }, { status: 500 });
  }
}
