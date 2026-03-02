import { NextResponse } from 'next/server';
import { getToken, isAuthenticated } from '../../../lib/auth/token-manager.js';
import { getSupabaseAdmin } from '../../../lib/supabase/server.js';

// GET: list DM conversations for current user
export async function GET() {
  try {
    if (!isAuthenticated()) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }
    const { userid } = await getToken();
    const sb = getSupabaseAdmin();

    const { data, error } = await sb
      .from('dm_conversations')
      .select(`
        id, user1_id, user2_id, created_at,
        dm_messages(id, sender_id, text, created_at)
      `)
      .or(`user1_id.eq.${userid},user2_id.eq.${userid}`)
      .order('created_at', { referencedTable: 'dm_messages', ascending: false });

    if (error) throw error;

    // Collect other user IDs and fetch profiles
    const otherIds = [...new Set(data.map(c => c.user1_id === userid ? c.user2_id : c.user1_id))];
    let profiles = {};
    if (otherIds.length > 0) {
      const { data: pData } = await sb.from('profiles').select('*').in('moodle_id', otherIds);
      if (pData) pData.forEach(p => { profiles[p.moodle_id] = p; });
    }

    const convos = data.map(c => {
      const otherId = c.user1_id === userid ? c.user2_id : c.user1_id;
      const profile = profiles[otherId] || { name: `User ${otherId}`, avatar: '?', color: '#888' };
      const msgs = (c.dm_messages || []).sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
      return {
        id: c.id,
        withId: otherId,
        withName: profile.name,
        withAvatar: profile.avatar,
        withColor: profile.color,
        msgs: msgs.map(m => ({
          id: m.id,
          uid: m.sender_id,
          text: m.text,
          ts: m.created_at,
        })),
      };
    });

    return NextResponse.json(convos);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// POST: send a DM
export async function POST(request) {
  try {
    if (!isAuthenticated()) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }
    const { userid } = await getToken();
    const { to_user_id, text, conversation_id } = await request.json();
    if (!text?.trim()) {
      return NextResponse.json({ error: 'text required' }, { status: 400 });
    }

    const sb = getSupabaseAdmin();

    // Ensure profile exists
    await sb.from('profiles').upsert(
      { moodle_id: userid, name: `User ${userid}` },
      { onConflict: 'moodle_id', ignoreDuplicates: true }
    );

    let convId = conversation_id;

    // Find or create conversation
    if (!convId && to_user_id) {
      const u1 = Math.min(userid, to_user_id);
      const u2 = Math.max(userid, to_user_id);

      const { data: existing } = await sb
        .from('dm_conversations')
        .select('id')
        .eq('user1_id', u1)
        .eq('user2_id', u2)
        .single();

      if (existing) {
        convId = existing.id;
      } else {
        const { data: created, error } = await sb
          .from('dm_conversations')
          .insert({ user1_id: u1, user2_id: u2 })
          .select('id')
          .single();
        if (error) throw error;
        convId = created.id;
      }
    }

    if (!convId) {
      return NextResponse.json({ error: 'conversation_id or to_user_id required' }, { status: 400 });
    }

    const { data, error } = await sb
      .from('dm_messages')
      .insert({ conversation_id: convId, sender_id: userid, text: text.trim() })
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ ...data, conversation_id: convId });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
