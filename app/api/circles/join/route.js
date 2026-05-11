import { NextResponse } from 'next/server';
import { requireAuth } from '../../../../lib/auth/require-auth.js';
import { getSupabaseAdmin } from '../../../../lib/supabase/server.js';
import { hydrateCircles, newId } from '../../../../lib/circles.js';

export async function POST(request) {
  try {
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;
    const { userid, fullname } = auth;
    const { circle_id, message } = await request.json();
    if (!circle_id) return NextResponse.json({ error: 'circle_id required' }, { status: 400 });

    const sb = getSupabaseAdmin();
    await sb.from('profiles').upsert(
      { moodle_id: userid, name: fullname || `User ${userid}` },
      { onConflict: 'moodle_id', ignoreDuplicates: true }
    );

    const { data: circle } = await sb
      .from('circles')
      .select('id, owner_id, join_mode, is_public')
      .eq('id', circle_id)
      .maybeSingle();
    if (!circle) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    if (Number(circle.owner_id) === Number(userid)) {
      return NextResponse.json({ error: 'すでにオーナーです' }, { status: 400 });
    }

    const { data: existing } = await sb
      .from('circle_members')
      .select('id')
      .eq('circle_id', circle_id)
      .eq('user_id', userid)
      .maybeSingle();
    if (existing) return NextResponse.json({ error: 'すでに参加しています' }, { status: 400 });

    if (circle.join_mode === 'invite_only') {
      return NextResponse.json({ error: '招待制のサークルです' }, { status: 403 });
    }

    if (circle.join_mode === 'approval') {
      const { data: priorApp } = await sb
        .from('circle_join_applications')
        .select('id, status')
        .eq('circle_id', circle_id)
        .eq('user_id', userid)
        .eq('status', 'pending')
        .maybeSingle();
      if (priorApp) return NextResponse.json({ error: 'すでに申請中です' }, { status: 400 });

      const { error: aErr } = await sb.from('circle_join_applications').insert({
        id: newId('app'),
        circle_id,
        user_id: userid,
        message: (message || '').slice(0, 1000),
        status: 'pending',
      });
      if (aErr) throw aErr;
      return NextResponse.json({ ok: true, applied: true });
    }

    const { error: mErr } = await sb
      .from('circle_members')
      .insert({ circle_id, user_id: userid, role_id: null });
    if (mErr) throw mErr;

    const [hydrated] = await hydrateCircles(sb, [circle_id], userid);
    return NextResponse.json({ ok: true, joined: true, circle: hydrated });
  } catch (err) {
    console.error('[Circles/Join] POST error:', err.message, err.stack);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
