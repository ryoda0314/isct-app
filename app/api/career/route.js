import { NextResponse } from 'next/server';
import { publicGate, publicCache } from '../../../lib/public-api.js';
import { getSupabaseAdmin } from '../../../lib/supabase/server.js';
import { CAREER_TABLE, PUBLIC_COLUMNS, isActiveListing, toPublic } from '../../../lib/career.js';

// GET /api/career — 掲載中のインターン・就職・イベントをまとめて返す（数百件までの想定）。
// 絞り込みのパラメータは受け取らない: 興味での照合は端末の中だけで行い、利用者の興味をサーバーに送らない
// （職業安定法の「特定募集情報等提供」にあたらないようにするため。計画書 2 章）。
// 誰が見ても同じ結果なので CDN に 300 秒キャッシュさせる（middleware の PUBLIC_CACHEABLE）。
async function handleGET() {
  try {
    const sb = getSupabaseAdmin();
    const { data, error } = await sb.from(CAREER_TABLE)
      .select(PUBLIC_COLUMNS.join(',') + ',status')
      .eq('status', 'published')
      .order('created_at', { ascending: false })
      .limit(1000);
    if (error) {
      // 表がまだ無い（supabase/career.sql 未実行）
      if (error.code === '42P01' || error.code === 'PGRST205') return NextResponse.json({ items: [], generatedAt: new Date().toISOString() });
      console.error('[Career GET]', error.message);
      return NextResponse.json({ error: 'Internal error' }, { status: 500 });
    }
    const now = Date.now();
    const items = (data || []).filter((r) => isActiveListing(r, now)).map(toPublic);
    return NextResponse.json({ items, generatedAt: new Date(now).toISOString() });
  } catch (e) {
    console.error('[Career GET]', e);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

export async function GET(request) {
  const gate = await publicGate(request);
  if (gate) return gate;
  return publicCache(await handleGET(), 300);
}
