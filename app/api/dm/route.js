import { NextResponse } from 'next/server';
import { requireAuth } from '../../../lib/auth/require-auth.js';
import { getSupabaseAdmin } from '../../../lib/supabase/server.js';
import { checkNgWords } from '../../../lib/ng-filter.js';
import { getBlockedIds } from '../../../lib/blocks.js';

// GET: list DM conversations for current user
export async function GET(request) {
  try {
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;
    const { userid } = auth;
    const sb = getSupabaseAdmin();

    const { data, error } = await sb
      .from('dm_conversations')
      .select(`
        id, user1_id, user2_id, created_at, last_read,
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

    // Filter out conversations with blocked users
    const blockedIds = await getBlockedIds(userid);

    const convos = data
      .filter(c => {
        const otherId = c.user1_id === userid ? c.user2_id : c.user1_id;
        return !blockedIds.has(otherId);
      })
      .map(c => {
        const otherId = c.user1_id === userid ? c.user2_id : c.user1_id;
        const profile = profiles[otherId] || { name: `User ${otherId}`, avatar: '?', color: '#888' };
        const msgs = (c.dm_messages || []).sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
        const lastRead = c.last_read || {};
        return {
          id: c.id,
          withId: otherId,
          withName: profile.name,
          withAvatar: profile.avatar,
          withColor: profile.color,
          lastRead,
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
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

// PATCH: mark conversation as read
export async function PATCH(request) {
  try {
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;
    const { userid } = auth;

    const { conversation_id } = await request.json();
    if (!conversation_id) {
      return NextResponse.json({ error: 'conversation_id required' }, { status: 400 });
    }

    const sb = getSupabaseAdmin();

    // Verify user is a participant
    const { data: conv, error: fetchErr } = await sb
      .from('dm_conversations')
      .select('id, user1_id, user2_id, last_read')
      .eq('id', conversation_id)
      .single();

    if (fetchErr || !conv) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
    }
    if (conv.user1_id !== userid && conv.user2_id !== userid) {
      return NextResponse.json({ error: 'Not a participant' }, { status: 403 });
    }

    const lastRead = conv.last_read || {};
    lastRead[String(userid)] = new Date().toISOString();

    const { error } = await sb
      .from('dm_conversations')
      .update({ last_read: lastRead })
      .eq('id', conversation_id);

    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

// POST: send a DM
export async function POST(request) {
  try {
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;
    const { userid } = auth;

    const { to_user_id, text, conversation_id } = await request.json();
    if (!text?.trim()) {
      return NextResponse.json({ error: 'text required' }, { status: 400 });
    }
    if (text.length > 2000) {
      return NextResponse.json({ error: 'Text too long' }, { status: 400 });
    }

    // NG word check
    const ngResult = await checkNgWords(text, { userId: userid, type: 'dm' });
    if (ngResult.blocked) {
      return NextResponse.json({ error: '禁止ワードが含まれています' }, { status: 400 });
    }

    const sb = getSupabaseAdmin();

    // Check block status before allowing DM
    if (to_user_id) {
      const blockedIds = await getBlockedIds(userid);
      if (blockedIds.has(to_user_id)) {
        return NextResponse.json({ error: 'このユーザーにメッセージを送信できません' }, { status: 403 });
      }
    }

    await sb.from('profiles').upsert(
      { moodle_id: userid, name: `User ${userid}` },
      { onConflict: 'moodle_id', ignoreDuplicates: true }
    );

    let convId = conversation_id;

    // If conversation_id is provided, verify user is a participant
    if (convId) {
      const { data: conv } = await sb
        .from('dm_conversations')
        .select('id, user1_id, user2_id')
        .eq('id', convId)
        .single();
      if (!conv || (conv.user1_id !== userid && conv.user2_id !== userid)) {
        return NextResponse.json({ error: 'Not a participant' }, { status: 403 });
      }
    }

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
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
