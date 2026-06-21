import { NextResponse } from 'next/server';
import { requireAuth } from '../../../../lib/auth/require-auth.js';
import { getSupabaseAdmin } from '../../../../lib/supabase/server.js';

// GET: 現在人数（参考値）と自分の在館状態。
//   混雑度ラベルは人数しきい値からクライアントで算出する。
export async function GET(request) {
  try {
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;
    const { userid } = auth;

    const sb = getSupabaseAdmin();

    const [{ count }, { data: mine }] = await Promise.all([
      sb.from('gym_occupancy').select('moodle_user_id', { count: 'exact', head: true }),
      sb.from('gym_occupancy').select('checked_in_at').eq('moodle_user_id', userid).maybeSingle(),
    ]);

    return NextResponse.json({
      count: count || 0,
      myState: mine ? 'in' : 'out',
      myCheckedInAt: mine?.checked_in_at || null,
    });
  } catch (err) {
    console.error('[Gym state]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
