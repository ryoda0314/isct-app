import { NextResponse } from 'next/server';
import { getToken, isAuthenticated } from '../../../lib/auth/token-manager.js';
import { getSupabaseAdmin } from '../../../lib/supabase/server.js';

// GET: list groups for current user
export async function GET() {
  try {
    if (!isAuthenticated()) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }
    const { userid } = await getToken();
    const sb = getSupabaseAdmin();

    // Get group IDs where user is a member
    const { data: memberships, error: mErr } = await sb
      .from('group_members')
      .select('group_id')
      .eq('user_id', userid);
    if (mErr) throw mErr;

    const groupIds = (memberships || []).map(m => m.group_id);
    if (groupIds.length === 0) return NextResponse.json([]);

    // Get groups
    const { data: groups, error: gErr } = await sb
      .from('groups')
      .select('*')
      .in('id', groupIds)
      .order('created_at', { ascending: false });
    if (gErr) throw gErr;

    // Get all members for these groups
    const { data: allMembers } = await sb
      .from('group_members')
      .select('group_id, user_id')
      .in('group_id', groupIds);

    // Get profiles for all members
    const allUserIds = [...new Set((allMembers || []).map(m => m.user_id))];
    let profiles = {};
    if (allUserIds.length > 0) {
      const { data: pData } = await sb.from('profiles').select('*').in('moodle_id', allUserIds);
      if (pData) pData.forEach(p => { profiles[p.moodle_id] = p; });
    }

    // Get last message for each group
    const lastMsgs = {};
    for (const gid of groupIds) {
      const { data: msgs } = await sb
        .from('group_messages')
        .select('text, sender_id, created_at')
        .eq('group_id', gid)
        .order('created_at', { ascending: false })
        .limit(1);
      if (msgs && msgs[0]) lastMsgs[gid] = msgs[0];
    }

    const result = (groups || []).map(g => {
      const members = (allMembers || [])
        .filter(m => m.group_id === g.id)
        .map(m => {
          const p = profiles[m.user_id] || { name: `User ${m.user_id}`, avatar: '?', color: '#888' };
          return { id: m.user_id, name: p.name, avatar: p.avatar, color: p.color };
        });
      const last = lastMsgs[g.id];
      return {
        id: g.id,
        name: g.name,
        avatar: g.avatar,
        color: g.color,
        creatorId: g.creator_id,
        members,
        memberCount: members.length,
        lastMessage: last ? { text: last.text, senderId: last.sender_id, senderName: profiles[last.sender_id]?.name, ts: last.created_at } : null,
        createdAt: g.created_at,
      };
    });

    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// POST: create a group
export async function POST(request) {
  try {
    if (!isAuthenticated()) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }
    const { userid } = await getToken();
    const { name, member_ids } = await request.json();

    if (!name?.trim()) {
      return NextResponse.json({ error: 'name required' }, { status: 400 });
    }
    if (!member_ids || !Array.isArray(member_ids) || member_ids.length === 0) {
      return NextResponse.json({ error: 'member_ids required' }, { status: 400 });
    }

    const sb = getSupabaseAdmin();

    // Ensure own profile exists
    await sb.from('profiles').upsert(
      { moodle_id: userid, name: `User ${userid}` },
      { onConflict: 'moodle_id', ignoreDuplicates: true }
    );

    // Generate a color for the group
    const colors = ['#6375f0', '#3dae72', '#e5534b', '#d4843e', '#c6a236', '#8b5cf6', '#ec4899', '#14b8a6'];
    const color = colors[Math.floor(Math.random() * colors.length)];
    const avatar = name.trim().charAt(0);

    // Create group
    const { data: group, error: gErr } = await sb
      .from('groups')
      .insert({ name: name.trim(), avatar, color, creator_id: userid })
      .select()
      .single();
    if (gErr) throw gErr;

    // Add members (creator + selected friends)
    const uniqueIds = [...new Set([userid, ...member_ids])];
    const memberRows = uniqueIds.map(uid => ({ group_id: group.id, user_id: uid }));
    const { error: mErr } = await sb.from('group_members').insert(memberRows);
    if (mErr) throw mErr;

    return NextResponse.json({ ok: true, group_id: group.id });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// DELETE: leave group
export async function DELETE(request) {
  try {
    if (!isAuthenticated()) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }
    const { userid } = await getToken();
    const { group_id } = await request.json();

    if (!group_id) {
      return NextResponse.json({ error: 'group_id required' }, { status: 400 });
    }

    const sb = getSupabaseAdmin();

    // Remove user from group
    await sb.from('group_members').delete().eq('group_id', group_id).eq('user_id', userid);

    // If no members left, delete the group
    const { data: remaining } = await sb.from('group_members').select('id').eq('group_id', group_id).limit(1);
    if (!remaining || remaining.length === 0) {
      await sb.from('groups').delete().eq('id', group_id);
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
