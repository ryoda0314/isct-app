import { NextResponse } from 'next/server';
import { requireAuth } from '../../../../lib/auth/require-auth.js';
import { getSupabaseAdmin } from '../../../../lib/supabase/server.js';

// GET: 自分の入退館ログをセッション化して返す。
//   { sessions:[{in, out, durationMin}], monthCount, monthMin }
//   未退館（in だけ）も out:null のセッションとして返す。
export async function GET(request) {
  try {
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;
    const { userid } = auth;

    const sb = getSupabaseAdmin();
    const { data, error } = await sb
      .from('gym_checkins')
      .select('action, at')
      .eq('moodle_user_id', userid)
      .order('at', { ascending: false })
      .limit(500);

    // テーブル未作成（supabase/training-gym.sql 未実行）なら空扱い
    if (error?.code === '42P01') return NextResponse.json({ sessions: [], monthCount: 0, monthMin: 0 });
    if (error) throw error;

    // 新しい順のログ。check_out に直前(=時系列で1つ前)の check_in をペアリング。
    const rows = data || [];
    const sessions = [];
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      if (r.action === 'check_out') {
        const prev = rows[i + 1];
        if (prev && prev.action === 'check_in') {
          sessions.push({
            in: prev.at,
            out: r.at,
            durationMin: Math.max(0, Math.round((Date.parse(r.at) - Date.parse(prev.at)) / 60000)),
          });
          i++; // ペアにした check_in を消費
        } else {
          sessions.push({ in: null, out: r.at, durationMin: null });
        }
      } else if (r.action === 'check_in') {
        // 直後（時系列で後）に check_out が無い＝在館中
        sessions.push({ in: r.at, out: null, durationMin: null });
      }
    }

    // 今月の集計
    const now = new Date();
    const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    let monthCount = 0, monthMin = 0;
    for (const s of sessions) {
      const ref = s.in || s.out;
      if (ref && ref.slice(0, 7) === ym) {
        monthCount++;
        if (s.durationMin) monthMin += s.durationMin;
      }
    }

    return NextResponse.json({ sessions, monthCount, monthMin });
  } catch (err) {
    console.error('[Gym history]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
