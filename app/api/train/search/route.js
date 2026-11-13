import { NextResponse } from 'next/server';
import { publicGate, publicCache } from '../../../../lib/public-api.js';
import { searchStaticDestinations } from '../../../../lib/api/static-timetables.js';

// 目的地検索: 出発駅(大岡山など)から到達可能な目的地駅を駅名で検索する。
// GET ?q=目黒&lang=ja → { results: [{ origin, originTitle, dest, destTitle }] }
// ※ 現状は静的同梱(東急)のみ。ODPT 対応路線の目的地選択は将来拡張。

async function handleGET(request) {
  try {

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

// 未ログインにも公開（ログイン任意化）。誰が見ても同じ結果なので CDN に 600 秒キャッシュさせる。
// 入口の判定（guest_access の非常停止）と Cache-Control は lib/public-api.js。
export async function GET(request) {
  const gate = await publicGate(request);
  if (gate) return gate;
  return publicCache(await handleGET(request), 600);
}
