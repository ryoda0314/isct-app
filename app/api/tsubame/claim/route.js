import { NextResponse } from 'next/server';
import { requireAuth } from '../../../../lib/auth/require-auth.js';
import { getSupabaseAdmin } from '../../../../lib/supabase/server.js';

// POST: デイリーログインのツバメポイントを受け取る（JST で 1 日 1 回・冪等）。
//   付与/ストリーク計算は claim_tsubame_daily RPC が原子的に行う。
//   2回目以降は { claimed:false } で現状値が返る（エラーにしない）。
export async function POST(request) {
  try {
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;
    const { userid } = auth;

    const sb = getSupabaseAdmin();
    const { data, error } = await sb.rpc('claim_tsubame_daily', { p_uid: userid });
    if (error) {
      console.error('[Tsubame claim] rpc error:', error.message);
      return NextResponse.json({ error: 'claim_failed' }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (err) {
    console.error('[Tsubame claim]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
