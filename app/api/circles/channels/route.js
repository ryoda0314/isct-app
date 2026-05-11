import { NextResponse } from 'next/server';
import { requireAuth } from '../../../../lib/auth/require-auth.js';
import { getSupabaseAdmin } from '../../../../lib/supabase/server.js';
import { getCircleAuthz, newId } from '../../../../lib/circles.js';

export async function POST(request) {
  try {
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;
    const { userid } = auth;
    const { circle_id, name, category_id } = await request.json();
    if (!circle_id || !name?.trim()) return NextResponse.json({ error: 'circle_id and name required' }, { status: 400 });

    const sb = getSupabaseAdmin();
    const authz = await getCircleAuthz(sb, circle_id, userid);
    if (!authz.isAdmin) return NextResponse.json({ error: '管理権限が必要です' }, { status: 403 });

    const { count } = await sb
      .from('circle_channels')
      .select('id', { count: 'exact', head: true })
      .eq('circle_id', circle_id);

    const slug = name.trim().toLowerCase().replace(/\s+/g, '-').slice(0, 50);
    const id = newId('ch');
    const { error } = await sb.from('circle_channels').insert({
      id,
      circle_id,
      category_id: category_id || null,
      name: slug,
      type: 'text',
      sort_order: count || 0,
    });
    if (error) throw error;
    return NextResponse.json({ id, name: slug, type: 'text', categoryId: category_id || undefined });
  } catch (err) {
    console.error('[CircleChannels] POST error:', err.message, err.stack);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

export async function DELETE(request) {
  try {
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;
    const { userid } = auth;
    const { searchParams } = new URL(request.url);
    const channelId = searchParams.get('id');
    const circleId = searchParams.get('circle_id');
    if (!channelId || !circleId) return NextResponse.json({ error: 'id and circle_id required' }, { status: 400 });

    const sb = getSupabaseAdmin();
    const authz = await getCircleAuthz(sb, circleId, userid);
    if (!authz.isAdmin) return NextResponse.json({ error: '管理権限が必要です' }, { status: 403 });

    const { error } = await sb.from('circle_channels').delete().eq('id', channelId).eq('circle_id', circleId);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[CircleChannels] DELETE error:', err.message, err.stack);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
