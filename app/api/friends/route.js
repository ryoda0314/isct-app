import { NextResponse } from 'next/server';
import { requireAuth } from '../../../lib/auth/require-auth.js';
import { getSupabaseAdmin } from '../../../lib/supabase/server.js';
import { getBlockedIds } from '../../../lib/blocks.js';
import { sendPushToUser } from '../../../lib/push.js';

// GET: list friends, pending requests, sent requests, or search users
export async function GET(request) {
  try {
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;
    const { userid } = auth;
    const sb = getSupabaseAdmin();
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type') || 'friends';

    if (type === 'friends') {
      const { data, error } = await sb
        .from('friendships')
        .select('*')
        .eq('status', 'accepted')
        .or(`requester_id.eq.${userid},addressee_id.eq.${userid}`);
      if (error) throw error;

      const friendIds = data.map(f => f.requester_id === userid ? f.addressee_id : f.requester_id);
      let profiles = {};
      if (friendIds.length > 0) {
        const { data: pData } = await sb.from('profiles').select('*').in('moodle_id', friendIds);
        if (pData) pData.forEach(p => { profiles[p.moodle_id] = p; });
      }

      const friends = data.map(f => {
        const fid = f.requester_id === userid ? f.addressee_id : f.requester_id;
        const p = profiles[fid] || { name: `User ${fid}`, avatar: '?', color: '#888' };
        return {
          id: f.id,
          friendId: fid,
          name: p.name,
          avatar: p.avatar,
          color: p.color,
          dept: p.dept,
          since: f.updated_at,
        };
      });
      return NextResponse.json(friends);
    }

    if (type === 'pending') {
      const { data, error } = await sb
        .from('friendships')
        .select('*')
        .eq('addressee_id', userid)
        .eq('status', 'pending');
      if (error) throw error;

      const ids = data.map(f => f.requester_id);
      let profiles = {};
      if (ids.length > 0) {
        const { data: pData } = await sb.from('profiles').select('*').in('moodle_id', ids);
        if (pData) pData.forEach(p => { profiles[p.moodle_id] = p; });
      }

      const pending = data.map(f => {
        const p = profiles[f.requester_id] || { name: `User ${f.requester_id}`, avatar: '?', color: '#888' };
        return {
          id: f.id,
          fromId: f.requester_id,
          fromName: p.name,
          fromAvatar: p.avatar,
          fromColor: p.color,
          fromDept: p.dept,
          requestedAt: f.created_at,
        };
      });
      return NextResponse.json(pending);
    }

    if (type === 'sent') {
      const { data, error } = await sb
        .from('friendships')
        .select('*')
        .eq('requester_id', userid)
        .eq('status', 'pending');
      if (error) throw error;

      const ids = data.map(f => f.addressee_id);
      let profiles = {};
      if (ids.length > 0) {
        const { data: pData } = await sb.from('profiles').select('*').in('moodle_id', ids);
        if (pData) pData.forEach(p => { profiles[p.moodle_id] = p; });
      }

      const sent = data.map(f => {
        const p = profiles[f.addressee_id] || { name: `User ${f.addressee_id}`, avatar: '?', color: '#888' };
        return {
          id: f.id,
          toId: f.addressee_id,
          toName: p.name,
          toAvatar: p.avatar,
          toColor: p.color,
          toDept: p.dept,
          requestedAt: f.created_at,
        };
      });
      return NextResponse.json(sent);
    }

    if (type === 'search') {
      const q = (searchParams.get('q') || '').slice(0, 100);
      if (!q.trim()) return NextResponse.json([]);

      const { data: pData, error } = await sb
        .from('profiles')
        .select('*')
        .neq('moodle_id', userid)
        .ilike('name', `%${q.trim()}%`)
        .limit(20);
      if (error) throw error;

      // Filter out blocked users from search results
      const blockedIds = await getBlockedIds(userid);

      // Get friendship statuses for results
      const resultIds = (pData || []).map(p => p.moodle_id);
      let friendshipMap = {};
      if (resultIds.length > 0) {
        const { data: fData } = await sb
          .from('friendships')
          .select('*')
          .or(
            resultIds.map(rid =>
              `and(requester_id.eq.${userid},addressee_id.eq.${rid}),and(requester_id.eq.${rid},addressee_id.eq.${userid})`
            ).join(',')
          );
        if (fData) {
          fData.forEach(f => {
            const otherId = f.requester_id === userid ? f.addressee_id : f.requester_id;
            friendshipMap[otherId] = { status: f.status, id: f.id, isSender: f.requester_id === userid };
          });
        }
      }

      const results = (pData || [])
        .filter(p => !blockedIds.has(p.moodle_id))
        .map(p => ({
          moodleId: p.moodle_id,
          name: p.name,
          avatar: p.avatar,
          color: p.color,
          dept: p.dept,
          friendship: friendshipMap[p.moodle_id] || null,
        }));
      return NextResponse.json(results);
    }

    if (type === 'lookup') {
      const id = searchParams.get('id');
      if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
      const numId = Number(id);
      if (!numId || numId === userid) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

      const { data: profile } = await sb
        .from('profiles')
        .select('*')
        .eq('moodle_id', numId)
        .single();

      if (!profile) return NextResponse.json({ error: 'User not found' }, { status: 404 });

      const { data: fData } = await sb
        .from('friendships')
        .select('*')
        .or(
          `and(requester_id.eq.${userid},addressee_id.eq.${numId}),and(requester_id.eq.${numId},addressee_id.eq.${userid})`
        );

      const f = fData?.[0];
      const friendship = f ? { status: f.status, id: f.id, isSender: f.requester_id === userid } : null;

      return NextResponse.json({
        moodleId: profile.moodle_id,
        name: profile.name,
        avatar: profile.avatar,
        color: profile.color,
        dept: profile.dept,
        friendship,
      });
    }

    return NextResponse.json({ error: 'Invalid type' }, { status: 400 });
  } catch (err) {
    console.error('[Friends] GET error:', err.message, err.stack);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

// POST: send friend request
export async function POST(request) {
  try {
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;
    const { userid, fullname } = auth;
    const { to_user_id } = await request.json();

    const numTo = Number(to_user_id);
    if (!to_user_id || !Number.isFinite(numTo) || numTo === userid) {
      return NextResponse.json({ error: 'Invalid user' }, { status: 400 });
    }

    const sb = getSupabaseAdmin();

    // Check block status before allowing friend request
    const blockedIds = await getBlockedIds(userid);
    if (blockedIds.has(numTo)) {
      return NextResponse.json({ error: 'Cannot send request' }, { status: 403 });
    }

    // Ensure own profile exists
    await sb.from('profiles').upsert(
      { moodle_id: userid, name: fullname || `User ${userid}` },
      { onConflict: 'moodle_id', ignoreDuplicates: true }
    );

    // Check existing in both directions
    const { data: existing } = await sb
      .from('friendships')
      .select('*')
      .or(
        `and(requester_id.eq.${userid},addressee_id.eq.${numTo}),and(requester_id.eq.${numTo},addressee_id.eq.${userid})`
      );

    if (existing && existing.length > 0) {
      const row = existing[0];
      if (row.status === 'accepted') {
        return NextResponse.json({ error: 'Already friends' }, { status: 409 });
      }
      if (row.status === 'blocked') {
        return NextResponse.json({ error: 'Cannot send request' }, { status: 403 });
      }
      // Other user sent pending request to us -> auto-accept
      if (row.status === 'pending' && row.addressee_id === userid) {
        const { error } = await sb
          .from('friendships')
          .update({ status: 'accepted', updated_at: new Date().toISOString() })
          .eq('id', row.id);
        if (error) throw error;

        // Get own profile name
        const { data: myProfile } = await sb.from('profiles').select('name').eq('moodle_id', userid).single();
        const myName = myProfile?.name || `User ${userid}`;

        const acceptText = `${myName}さんがフレンド申請を承認しました`;
        await sb.from('notifications').insert({
          moodle_user_id: numTo,
          type: 'friend_request',
          text: acceptText,
        });
        sendPushToUser(numTo, { title: '友達', body: acceptText }).catch(() => {});
        return NextResponse.json({ ok: true, status: 'accepted' });
      }
      // We already sent a pending request
      if (row.status === 'pending' && row.requester_id === userid) {
        return NextResponse.json({ error: 'Already sent' }, { status: 409 });
      }
      // Rejected -> update to pending again
      if (row.status === 'rejected') {
        const { error } = await sb
          .from('friendships')
          .update({ status: 'pending', requester_id: userid, addressee_id: numTo, updated_at: new Date().toISOString() })
          .eq('id', row.id);
        if (error) throw error;
      }
    } else {
      // New request
      const { error } = await sb
        .from('friendships')
        .insert({ requester_id: userid, addressee_id: numTo, status: 'pending' });
      if (error) throw error;
    }

    // Send notification
    const { data: myProfile } = await sb.from('profiles').select('name').eq('moodle_id', userid).single();
    const myName = myProfile?.name || `User ${userid}`;
    const reqText = `${myName}さんから友達申請が届きました`;
    await sb.from('notifications').insert({
      moodle_user_id: numTo,
      type: 'friend_request',
      text: reqText,
    });
    sendPushToUser(numTo, { title: '友達申請', body: reqText }).catch(() => {});

    return NextResponse.json({ ok: true, status: 'pending' });
  } catch (err) {
    console.error('[Friends] POST error:', err.message, err.stack);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

// PATCH: accept or reject friend request
export async function PATCH(request) {
  try {
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;
    const { userid } = auth;
    const { friendship_id, action } = await request.json();

    if (!friendship_id || !['accept', 'reject'].includes(action)) {
      return NextResponse.json({ error: 'Invalid params' }, { status: 400 });
    }

    const sb = getSupabaseAdmin();

    // Verify: must be the addressee
    const { data: row, error: fetchErr } = await sb
      .from('friendships')
      .select('*')
      .eq('id', friendship_id)
      .eq('addressee_id', userid)
      .eq('status', 'pending')
      .single();

    if (fetchErr || !row) {
      return NextResponse.json({ error: 'Request not found' }, { status: 404 });
    }

    const newStatus = action === 'accept' ? 'accepted' : 'rejected';
    const { error } = await sb
      .from('friendships')
      .update({ status: newStatus, updated_at: new Date().toISOString() })
      .eq('id', friendship_id);
    if (error) throw error;

    // Notify requester on accept
    if (action === 'accept') {
      const { data: myProfile } = await sb.from('profiles').select('name').eq('moodle_id', userid).single();
      const myName = myProfile?.name || `User ${userid}`;
      const patchText = `${myName}さんがフレンド申請を承認しました`;
      await sb.from('notifications').insert({
        moodle_user_id: row.requester_id,
        type: 'friend_request',
        text: patchText,
      });
      sendPushToUser(row.requester_id, { title: '友達', body: patchText }).catch(() => {});
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[Friends] PATCH error:', err.message, err.stack);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

// DELETE: unfriend
export async function DELETE(request) {
  try {
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;
    const { userid } = auth;
    const { friend_id } = await request.json();

    const numFriend = Number(friend_id);
    if (!friend_id || !Number.isFinite(numFriend)) {
      return NextResponse.json({ error: 'friend_id required' }, { status: 400 });
    }

    const sb = getSupabaseAdmin();

    const { error } = await sb
      .from('friendships')
      .delete()
      .eq('status', 'accepted')
      .or(
        `and(requester_id.eq.${userid},addressee_id.eq.${numFriend}),and(requester_id.eq.${numFriend},addressee_id.eq.${userid})`
      );
    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[Friends] DELETE error:', err.message, err.stack);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
