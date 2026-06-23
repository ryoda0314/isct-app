import { NextResponse } from 'next/server';
import { requireAuth } from '../../../../lib/auth/require-auth.js';
import { getSupabaseAdmin } from '../../../../lib/supabase/server.js';

// GET: 自分のツバメポイント状態（残高・累計・ストリーク・最近の履歴）と、
//      今日デイリーを受け取り済みかどうか。
//   レベルは total_earned からクライアントで算出する（tsubamePoints.js）。
export async function GET(request) {
  try {
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;
    const { userid } = auth;

    const sb = getSupabaseAdmin();

    const [{ data: pts }, { data: ledger }] = await Promise.all([
      sb.from('tsubame_points')
        .select('balance, total_earned, current_streak, longest_streak, last_login_date')
        .eq('moodle_user_id', userid)
        .maybeSingle(),
      sb.from('tsubame_ledger')
        .select('id, amount, reason, meta, created_at')
        .eq('moodle_user_id', userid)
        .order('created_at', { ascending: false })
        .limit(30),
    ]);

    // JST の今日（サーバーは UTC のため変換）
    const todayJST = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
    const claimedToday = pts?.last_login_date === todayJST;

    return NextResponse.json({
      balance: pts?.balance || 0,
      totalEarned: pts?.total_earned || 0,
      currentStreak: pts?.current_streak || 0,
      longestStreak: pts?.longest_streak || 0,
      claimedToday,
      ledger: ledger || [],
    });
  } catch (err) {
    console.error('[Tsubame state]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
