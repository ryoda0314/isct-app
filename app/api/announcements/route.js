import { NextResponse } from 'next/server';
import { publicGate, publicCache } from '../../../lib/public-api.js';
import { getSupabaseAdmin } from '../../../lib/supabase/server.js';

// GET /api/announcements — アクティブなお知らせ一覧（ユーザー向け）
async function handleGET(request) {
  try {

    const sb = getSupabaseAdmin();
    const { data, error } = await sb
      .from('announcements')
      .select('id, title, body, type, popup, image_url, link, created_at, updated_at')
      .eq('active', true)
      .order('created_at', { ascending: false })
      .limit(20);

    if (error) { console.error('[Announcements GET]', error.message); return NextResponse.json({ error: 'Internal error' }, { status: 500 }); }
    return NextResponse.json(data || []);
  } catch (e) {
    console.error('[Announcements GET]', e);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

// 未ログインにも公開（ログイン任意化）。誰が見ても同じ結果なので CDN に 60 秒キャッシュさせる。
// 入口の判定（guest_access の非常停止）と Cache-Control は lib/public-api.js。
export async function GET(request) {
  const gate = await publicGate(request);
  if (gate) return gate;
  return publicCache(await handleGET(request), 60);
}
