import { NextResponse } from 'next/server';
import { requireAuth } from '../../../lib/auth/require-auth.js';
import { getSupabaseAdmin } from '../../../lib/supabase/server.js';
import { checkNgWords } from '../../../lib/ng-filter.js';
import { getBlockedIds } from '../../../lib/blocks.js';
import { getMutedIds } from '../../../lib/mutes.js';
import { requireTelecomAllowed } from '../../../lib/telecom-restriction.js';
import { createNotification } from '../../../lib/notify.js';
import { broadcast, dmListTopic, dmUnreadTopic } from '../../../lib/realtime.js';

// Server-side allowlist for stamp IDs. Must match public/stamps/manifest.json.
// Stored as plain text in dm_messages.stamp_id; client maps id -> /stamps/<id>.webp.
const ALLOWED_STAMP_IDS = new Set([
  // Set 1: imoticon/1 (kawaii character)
  'ryokai', 'arigatou', 'otsukare', 'gomenne', 'ok', 'matane',
  // Set 2: imoticon/2 (campus life chibi)
  'now_ookayama', 'near_yushima', 'engr_face', 'med_face',
  'togo_topic', 'today_suzu', 'lost_tamachi', 'summon_ooka',
  'experimenting', 'kadai_oware', 'med_eng', 'kokuritsu_kyu',
  'back_to_lab', 'mood_yushima', 'mem_tokyotech', 'mem_idaishika',
]);

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
        dm_messages(id, sender_id, text, stamp_id, created_at)
      `)
      .or(`user1_id.eq.${userid},user2_id.eq.${userid}`)
      .order('created_at', { referencedTable: 'dm_messages', ascending: false })
      .limit(50, { referencedTable: 'dm_messages' });

    if (error) throw error;

    // Collect other user IDs and fetch profiles
    const otherIds = [...new Set(data.map(c => c.user1_id === userid ? c.user2_id : c.user1_id))];
    let profiles = {};
    if (otherIds.length > 0) {
      const { data: pData } = await sb.from('profiles').select('*').in('moodle_id', otherIds);
      if (pData) pData.forEach(p => { profiles[p.moodle_id] = p; });
    }

    // Filter out conversations with blocked/muted users
    const [blockedIds, mutedIds] = await Promise.all([getBlockedIds(userid), getMutedIds(userid)]);

    const convos = data
      .filter(c => {
        const otherId = c.user1_id === userid ? c.user2_id : c.user1_id;
        return !blockedIds.has(otherId) && !mutedIds.has(otherId);
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
            stamp_id: m.stamp_id || null,
            ts: m.created_at,
          })),
        };
      });

    return NextResponse.json(convos);
  } catch (err) {
    console.error('[DM] GET error:', err.message, err.stack);
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
    console.error('[DM] PATCH error:', err.message, err.stack);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

// POST: send a DM
export async function POST(request) {
  try {
    const blocked = await requireTelecomAllowed();
    if (blocked) return blocked;

    const auth = await requireAuth(request);
    if (auth.error) return auth.error;
    const { userid, fullname } = auth;

    const { to_user_id, text, stamp_id, conversation_id } = await request.json();
    const hasText = !!text?.trim();
    const hasStamp = !!stamp_id;
    if (!hasText && !hasStamp) {
      return NextResponse.json({ error: 'text or stamp_id required' }, { status: 400 });
    }
    if (hasText && text.length > 2000) {
      return NextResponse.json({ error: 'Text too long' }, { status: 400 });
    }
    if (hasStamp && !ALLOWED_STAMP_IDS.has(stamp_id)) {
      return NextResponse.json({ error: 'Unknown stamp' }, { status: 400 });
    }

    // NG word check (text only — stamps bypass NG filter)
    if (hasText) {
      const ngResult = await checkNgWords(text, { userId: userid, type: 'dm' });
      if (ngResult.blocked) {
        return NextResponse.json({ error: '禁止ワードが含まれています' }, { status: 400 });
      }
    }

    const sb = getSupabaseAdmin();

    await sb.from('profiles').upsert(
      { moodle_id: userid, name: `User ${userid}` },
      { onConflict: 'moodle_id', ignoreDuplicates: true }
    );

    let convId = conversation_id;
    let targetUserId = to_user_id;

    // If conversation_id is provided, verify user is a participant and resolve target
    if (convId) {
      const { data: conv } = await sb
        .from('dm_conversations')
        .select('id, user1_id, user2_id')
        .eq('id', convId)
        .single();
      if (!conv || (conv.user1_id !== userid && conv.user2_id !== userid)) {
        return NextResponse.json({ error: 'Not a participant' }, { status: 403 });
      }
      targetUserId = conv.user1_id === userid ? conv.user2_id : conv.user1_id;
    }

    // Block check: single pass for both directions (cached, so only 2 queries max)
    if (targetUserId) {
      const [blockedIds, blockedByIds] = await Promise.all([
        getBlockedIds(userid),
        getBlockedIds(targetUserId),
      ]);
      if (blockedIds.has(targetUserId) || blockedByIds.has(userid)) {
        return NextResponse.json({ error: 'このユーザーにメッセージを送信できません' }, { status: 403 });
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
      .insert({
        conversation_id: convId,
        sender_id: userid,
        text: hasText ? text.trim() : '',
        stamp_id: hasStamp ? stamp_id : null,
      })
      .select()
      .single();

    if (error) throw error;

    // Realtime ping (content-free). Wakes the recipient's + sender's DM list
    // (which also drives the open conversation view) and unread badge to
    // re-fetch via the authorized /api/dm endpoint.
    await broadcast([
      dmListTopic(userid),
      dmUnreadTopic(userid),
      targetUserId ? dmListTopic(targetUserId) : null,
      targetUserId ? dmUnreadTopic(targetUserId) : null,
    ]);

    // Notify the recipient (best-effort). Awaited so the row is written before
    // the serverless function freezes; skip if the recipient muted the sender.
    if (targetUserId) {
      try {
        const targetMuted = await getMutedIds(targetUserId);
        if (!targetMuted.has(userid)) {
          const senderName = fullname || `User ${userid}`;
          const preview = hasText ? text.trim().slice(0, 60) : 'スタンプを送信しました';
          await createNotification({
            userId: targetUserId,
            type: 'dm',
            text: `${senderName}さんからメッセージ: ${preview}`,
            pushTitle: senderName,
          });
        }
      } catch (e) { console.error('[DM] notify:', e.message); }
    }

    return NextResponse.json({ ...data, conversation_id: convId });
  } catch (err) {
    console.error('[DM] POST error:', err.message, err.stack);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
