import { NextResponse } from 'next/server';
import { requireAuth } from '../../../../lib/auth/require-auth.js';
import { getSupabaseAdmin } from '../../../../lib/supabase/server.js';

// GET: get messages for a group
export async function GET(request) {
  try {
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;
    const { userid } = auth;
    const sb = getSupabaseAdmin();
    const { searchParams } = new URL(request.url);
    const groupId = searchParams.get('group_id');

    if (!groupId) {
      return NextResponse.json({ error: 'group_id required' }, { status: 400 });
    }

    // Verify membership
    const { data: membership } = await sb
      .from('group_members')
      .select('id')
      .eq('group_id', groupId)
      .eq('user_id', userid)
      .single();
    if (!membership) {
      return NextResponse.json({ error: 'Not a member' }, { status: 403 });
    }

    const { data, error } = await sb
      .from('group_messages')
      .select('*')
      .eq('group_id', groupId)
      .order('created_at', { ascending: true })
      .limit(200);
    if (error) throw error;

    const senderIds = [...new Set((data || []).map(m => m.sender_id))];
    let profiles = {};
    if (senderIds.length > 0) {
      const { data: pData } = await sb.from('profiles').select('*').in('moodle_id', senderIds);
      if (pData) pData.forEach(p => { profiles[p.moodle_id] = p; });
    }

    const messages = (data || []).map(m => {
      const p = profiles[m.sender_id] || { name: `User ${m.sender_id}`, avatar: '?', color: '#888' };
      return {
        id: m.id,
        uid: m.sender_id,
        text: m.text,
        ts: m.created_at,
        name: p.name,
        avatar: p.avatar,
        color: p.color,
      };
    });

    return NextResponse.json(messages);
  } catch (err) {
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

// POST: send message to group
export async function POST(request) {
  try {
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;
    const { userid } = auth;

    const { group_id, text } = await request.json();

    if (!group_id || !text?.trim()) {
      return NextResponse.json({ error: 'group_id and text required' }, { status: 400 });
    }
    if (text.length > 2000) {
      return NextResponse.json({ error: 'Text too long' }, { status: 400 });
    }

    const sb = getSupabaseAdmin();

    // Verify membership
    const { data: membership } = await sb
      .from('group_members')
      .select('id')
      .eq('group_id', group_id)
      .eq('user_id', userid)
      .single();
    if (!membership) {
      return NextResponse.json({ error: 'Not a member' }, { status: 403 });
    }

    await sb.from('profiles').upsert(
      { moodle_id: userid, name: `User ${userid}` },
      { onConflict: 'moodle_id', ignoreDuplicates: true }
    );

    const { data, error } = await sb
      .from('group_messages')
      .insert({ group_id, sender_id: userid, text: text.trim() })
      .select()
      .single();
    if (error) throw error;

    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
