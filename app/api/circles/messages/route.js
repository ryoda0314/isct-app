import { NextResponse } from 'next/server';
import { requireAuth } from '../../../../lib/auth/require-auth.js';
import { getSupabaseAdmin } from '../../../../lib/supabase/server.js';
import { checkNgWords } from '../../../../lib/ng-filter.js';
import { getCircleAuthz } from '../../../../lib/circles.js';

async function channelCircle(sb, channelId) {
  const { data } = await sb.from('circle_channels').select('circle_id').eq('id', channelId).maybeSingle();
  return data?.circle_id || null;
}

export async function GET(request) {
  try {
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;
    const { userid } = auth;
    const sb = getSupabaseAdmin();
    const { searchParams } = new URL(request.url);
    const channelId = searchParams.get('channel_id');
    if (!channelId) return NextResponse.json({ error: 'channel_id required' }, { status: 400 });

    const circleId = await channelCircle(sb, channelId);
    if (!circleId) return NextResponse.json({ error: 'Channel not found' }, { status: 404 });
    const authz = await getCircleAuthz(sb, circleId, userid);
    if (!authz.isMember) return NextResponse.json({ error: 'Not a member' }, { status: 403 });

    const { data: rows, error } = await sb
      .from('circle_messages')
      .select('*')
      .eq('channel_id', channelId)
      .order('created_at', { ascending: true })
      .limit(200);
    if (error) throw error;

    const senderIds = [...new Set((rows || []).map(r => r.sender_id))];
    let profiles = {};
    if (senderIds.length > 0) {
      const { data: pData } = await sb.from('profiles').select('moodle_id, name, avatar, color').in('moodle_id', senderIds);
      (pData || []).forEach(p => { profiles[p.moodle_id] = p; });
    }

    const messages = (rows || []).map(m => {
      const p = profiles[m.sender_id] || { name: `User ${m.sender_id}`, avatar: '?', color: '#888' };
      return {
        id: m.id,
        uid: Number(m.sender_id),
        text: m.text,
        ts: m.created_at,
        name: p.name,
        avatar: p.avatar,
        color: p.color,
        pinned: !!m.pinned,
      };
    });
    return NextResponse.json(messages);
  } catch (err) {
    console.error('[CircleMessages] GET error:', err.message, err.stack);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;
    const { userid, fullname } = auth;
    const { channel_id, text } = await request.json();
    if (!channel_id || !text?.trim()) return NextResponse.json({ error: 'channel_id and text required' }, { status: 400 });
    if (text.length > 2000) return NextResponse.json({ error: 'Text too long' }, { status: 400 });

    const ng = await checkNgWords(text, { userId: userid, type: 'circle_message' });
    if (ng.blocked) return NextResponse.json({ error: '禁止ワードが含まれています' }, { status: 400 });

    const sb = getSupabaseAdmin();
    const circleId = await channelCircle(sb, channel_id);
    if (!circleId) return NextResponse.json({ error: 'Channel not found' }, { status: 404 });
    const authz = await getCircleAuthz(sb, circleId, userid);
    if (!authz.isMember) return NextResponse.json({ error: 'Not a member' }, { status: 403 });

    await sb.from('profiles').upsert(
      { moodle_id: userid, name: fullname || `User ${userid}` },
      { onConflict: 'moodle_id', ignoreDuplicates: true }
    );

    const { data, error } = await sb
      .from('circle_messages')
      .insert({ channel_id, sender_id: userid, text: text.trim() })
      .select()
      .single();
    if (error) throw error;
    return NextResponse.json(data);
  } catch (err) {
    console.error('[CircleMessages] POST error:', err.message, err.stack);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

export async function PATCH(request) {
  try {
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;
    const { userid } = auth;
    const { message_id, channel_id, pinned } = await request.json();
    if (!message_id || !channel_id) return NextResponse.json({ error: 'message_id and channel_id required' }, { status: 400 });

    const sb = getSupabaseAdmin();
    const circleId = await channelCircle(sb, channel_id);
    if (!circleId) return NextResponse.json({ error: 'Channel not found' }, { status: 404 });
    const authz = await getCircleAuthz(sb, circleId, userid);
    if (!authz.isAdmin) return NextResponse.json({ error: '管理権限が必要です' }, { status: 403 });

    const { data: current } = await sb.from('circle_messages').select('pinned').eq('id', message_id).maybeSingle();
    const next = typeof pinned === 'boolean' ? pinned : !current?.pinned;
    const { error } = await sb.from('circle_messages').update({ pinned: next }).eq('id', message_id);
    if (error) throw error;
    return NextResponse.json({ ok: true, pinned: next });
  } catch (err) {
    console.error('[CircleMessages] PATCH error:', err.message, err.stack);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
