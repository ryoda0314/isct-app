import { NextResponse } from 'next/server';
import { requireAuth } from '../../../../lib/auth/require-auth.js';
import { getSupabaseAdmin } from '../../../../lib/supabase/server.js';
import { checkInsideBuilding } from '../../../../campus-sns/hooks/useLocationSharing.js';

// 今日の JST 日付 'YYYY-MM-DD' を返す（サーバーは UTC のため +9h して切り出す）。
function todayJST() {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

// POST: ホームからの GPS チェックインによる出席ポイント付与。
//   出席ページの自由トグル（/api/attendance）はポイント対象外。ここだけが付与経路。
//   付与の前提（すべてサーバーで再検証）:
//     1) status は present 相当（このエンドポイント＝present チェックインのみ）
//     2) session_date == 今日(JST)        … 未来回の一括付与を防ぐ
//     3) 現在地が building のジオフェンス内 … 物理的に校舎にいることの証明
//   付与自体は award_attendance RPC が冪等(授業回ごと1回)＋日次上限で行う。
export async function POST(request) {
  try {
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;
    const { userid } = auth;

    const { course_key, session_key, session_date, building, lat, lng } = await request.json();
    if (!course_key || !session_key || !building) {
      return NextResponse.json({ error: 'invalid params' }, { status: 400 });
    }
    if (typeof lat !== 'number' || typeof lng !== 'number') {
      return NextResponse.json({ error: 'no_location' }, { status: 400 });
    }

    // 2) 今日(JST)の授業回でなければ付与しない（記録自体は別経路で済んでいる前提）
    if (session_date && session_date !== todayJST()) {
      return NextResponse.json({ awarded: 0, reason: 'not_today' });
    }

    // 3) サーバー側でジオフェンスを再検証（クライアントのフラグは信用しない）
    const { ok, distance } = checkInsideBuilding(lat, lng, building, 50);
    if (!ok) {
      return NextResponse.json({ awarded: 0, reason: 'outside', distance });
    }

    // 付与（冪等＋日次上限は RPC 内で担保）
    const sb = getSupabaseAdmin();
    const ref = `sci:${String(course_key)}:${String(session_key)}`;
    const { data, error } = await sb.rpc('award_attendance', { p_uid: userid, p_ref: ref });
    if (error) {
      console.error('[Attendance checkin] rpc error:', error.message);
      return NextResponse.json({ error: 'award_failed' }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (err) {
    console.error('[Attendance checkin]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
