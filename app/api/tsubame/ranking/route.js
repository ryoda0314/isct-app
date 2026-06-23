import { NextResponse } from 'next/server';
import { requireAuth } from '../../../../lib/auth/require-auth.js';
import { getSupabaseAdmin } from '../../../../lib/supabase/server.js';

const TOP_N = 50;

// GET: 累計獲得(total_earned)の全学ランキング上位 TOP_N と、自分の順位。
//   表示用に profiles(name/avatar/color) を引き当てる。banned は除外。
export async function GET(request) {
  try {
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;
    const { userid } = auth;

    const sb = getSupabaseAdmin();

    // 上位 TOP_N（累計降順・同点は先到達=updated_at昇順）
    const { data: top, error } = await sb
      .from('tsubame_points')
      .select('moodle_user_id, total_earned, current_streak')
      .gt('total_earned', 0)
      .order('total_earned', { ascending: false })
      .order('updated_at', { ascending: true })
      .limit(TOP_N);
    if (error) {
      console.error('[Tsubame ranking] query error:', error.message);
      return NextResponse.json({ error: 'rank_failed' }, { status: 500 });
    }

    const rows = top || [];
    const ids = rows.map((r) => r.moodle_user_id);

    // 表示用プロフィール（BAN ユーザーはランキングから除外）
    const profMap = new Map();
    if (ids.length) {
      const { data: profs } = await sb
        .from('profiles')
        .select('moodle_id, name, avatar, color, banned')
        .in('moodle_id', ids);
      for (const p of profs || []) {
        if (!p.banned) profMap.set(p.moodle_id, p);
      }
    }

    const ranking = [];
    for (const r of rows) {
      const p = profMap.get(r.moodle_user_id);
      if (!p) continue; // banned / プロフィール無し は除外
      ranking.push({
        rank: ranking.length + 1,
        id: r.moodle_user_id,
        name: p.name,
        avatar: p.avatar || (p.name ? p.name[0] : '?'),
        color: p.color || '#888',
        totalEarned: r.total_earned,
        streak: r.current_streak,
        me: r.moodle_user_id === userid,
      });
    }

    // 自分の順位（上位圏外でも算出）: 自分より累計が多い人数 + 1
    let myRank = null;
    const { data: mine } = await sb
      .from('tsubame_points')
      .select('total_earned')
      .eq('moodle_user_id', userid)
      .maybeSingle();
    if (mine && mine.total_earned > 0) {
      const { count } = await sb
        .from('tsubame_points')
        .select('moodle_user_id', { count: 'exact', head: true })
        .gt('total_earned', mine.total_earned);
      myRank = (count || 0) + 1;
    }

    return NextResponse.json({ ranking, myRank });
  } catch (err) {
    console.error('[Tsubame ranking]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
