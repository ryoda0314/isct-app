import { NextResponse } from 'next/server';
import { requireAuth } from '../../../../lib/auth/require-auth.js';
import { getSupabaseAdmin } from '../../../../lib/supabase/server.js';

// 入口に貼った静的QRのペイロード（クライアント側 GYM_QR と一致させる）。
// 実ゲートとは連携しない参考値運用なので署名なしの固定文字列で十分。
const EXPECTED_QR = 'sciencetokyo-gym:ookayama';

// POST: QRを読み取って入退館をトグル。
//   gym_occupancy に自分の行があれば退館（行削除＋check_out ログ＋滞在時間算出）、
//   なければ入館（行 upsert＋check_in ログ）。
export async function POST(request) {
  try {
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;
    const { userid } = auth;

    const { qr } = await request.json().catch(() => ({}));
    if (qr !== EXPECTED_QR) {
      return NextResponse.json({ error: 'invalid_qr' }, { status: 400 });
    }

    const sb = getSupabaseAdmin();
    const nowISO = new Date().toISOString();

    // 現在の在館状態
    const { data: occ } = await sb
      .from('gym_occupancy')
      .select('moodle_user_id, checked_in_at')
      .eq('moodle_user_id', userid)
      .maybeSingle();

    let state, at, durationMin = null;

    if (occ) {
      // ── 退館 ──
      await sb.from('gym_occupancy').delete().eq('moodle_user_id', userid);
      await sb.from('gym_checkins').insert({ moodle_user_id: userid, action: 'check_out', at: nowISO });
      state = 'out';
      at = nowISO;
      if (occ.checked_in_at) {
        durationMin = Math.max(0, Math.round((Date.parse(nowISO) - Date.parse(occ.checked_in_at)) / 60000));
      }
    } else {
      // ── 入館 ──
      await sb.from('gym_occupancy').upsert(
        { moodle_user_id: userid, checked_in_at: nowISO },
        { onConflict: 'moodle_user_id' }
      );
      await sb.from('gym_checkins').insert({ moodle_user_id: userid, action: 'check_in', at: nowISO });
      state = 'in';
      at = nowISO;
    }

    const { count } = await sb
      .from('gym_occupancy')
      .select('moodle_user_id', { count: 'exact', head: true });

    return NextResponse.json({ state, at, durationMin, count: count || 0 });
  } catch (err) {
    console.error('[Gym checkin]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
