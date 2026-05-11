import { NextResponse } from 'next/server';
import { requireAuth } from '../../../lib/auth/require-auth.js';
import { getSupabaseAdmin } from '../../../lib/supabase/server.js';
import { hydrateCircles, applyCirclePatch, ensureAdminRole, getCircleAuthz, newId } from '../../../lib/circles.js';

export async function GET(request) {
  try {
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;
    const { userid } = auth;
    const sb = getSupabaseAdmin();

    const { data: ownerCircles } = await sb.from('circles').select('id').eq('owner_id', userid);
    const { data: memberships } = await sb.from('circle_members').select('circle_id').eq('user_id', userid);
    const ids = [...new Set([
      ...(ownerCircles || []).map(c => c.id),
      ...(memberships || []).map(m => m.circle_id),
    ])];

    const circles = await hydrateCircles(sb, ids, userid);
    circles.sort((a, b) => a.name.localeCompare(b.name, 'ja'));
    return NextResponse.json(circles);
  } catch (err) {
    console.error('[Circles] GET error:', err.message, err.stack);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;
    const { userid, fullname } = auth;
    const body = await request.json();
    const { name, desc, color, icon, tags, joinMode } = body;

    if (!name?.trim()) return NextResponse.json({ error: 'name required' }, { status: 400 });
    if (name.trim().length > 80) return NextResponse.json({ error: 'name too long' }, { status: 400 });

    const sb = getSupabaseAdmin();
    await sb.from('profiles').upsert(
      { moodle_id: userid, name: fullname || `User ${userid}` },
      { onConflict: 'moodle_id', ignoreDuplicates: true }
    );

    const id = newId('cir');
    const { error: cErr } = await sb.from('circles').insert({
      id,
      name: name.trim(),
      icon: icon || name.trim()[0],
      color: color || '#6375f0',
      description: desc || '',
      tags: Array.isArray(tags) ? tags : [],
      join_mode: joinMode || 'open',
      owner_id: userid,
    });
    if (cErr) throw cErr;

    await ensureAdminRole(sb, id);

    const defaultChannels = [
      { name: 'general', sort_order: 0 },
      { name: 'announcements', sort_order: 1 },
      { name: 'random', sort_order: 2 },
    ];
    await sb.from('circle_channels').insert(defaultChannels.map(c => ({
      id: newId('ch'),
      circle_id: id,
      name: c.name,
      type: 'text',
      sort_order: c.sort_order,
    })));

    const [hydrated] = await hydrateCircles(sb, [id], userid);
    return NextResponse.json(hydrated);
  } catch (err) {
    console.error('[Circles] POST error:', err.message, err.stack);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

export async function DELETE(request) {
  try {
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;
    const { userid } = auth;
    const { searchParams } = new URL(request.url);
    const circleId = searchParams.get('id');
    if (!circleId) return NextResponse.json({ error: 'id required' }, { status: 400 });

    const sb = getSupabaseAdmin();
    const authz = await getCircleAuthz(sb, circleId, userid);
    if (!authz.exists) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    if (authz.isOwner) {
      const { data: others } = await sb
        .from('circle_members')
        .select('user_id')
        .eq('circle_id', circleId)
        .neq('user_id', userid)
        .limit(1);
      if (others && others.length > 0) {
        return NextResponse.json({ error: 'オーナーは他メンバーに譲渡してから退出してください' }, { status: 400 });
      }
      const { error } = await sb.from('circles').delete().eq('id', circleId);
      if (error) throw error;
      return NextResponse.json({ ok: true, deleted: true });
    }

    await sb.from('circle_members').delete().eq('circle_id', circleId).eq('user_id', userid);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[Circles] DELETE error:', err.message, err.stack);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

export async function PATCH(request) {
  try {
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;
    const { userid, fullname } = auth;
    const body = await request.json();
    const { id: circleId, patch } = body;
    if (!circleId || !patch) return NextResponse.json({ error: 'id and patch required' }, { status: 400 });

    const sb = getSupabaseAdmin();
    const authz = await getCircleAuthz(sb, circleId, userid);
    if (!authz.exists) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    if (!authz.isAdmin) return NextResponse.json({ error: '管理権限が必要です' }, { status: 403 });

    await applyCirclePatch(sb, circleId, patch, { userid, userName: fullname || `User ${userid}` });
    const [hydrated] = await hydrateCircles(sb, [circleId], userid);
    return NextResponse.json(hydrated);
  } catch (err) {
    console.error('[Circles] PATCH error:', err.message, err.stack);
    return NextResponse.json({ error: 'Internal error', detail: err.message }, { status: 500 });
  }
}
