import { NextResponse } from 'next/server';
import { requireAuth } from '../../../lib/auth/require-auth.js';
import { getSupabaseAdmin } from '../../../lib/supabase/server.js';
import { invalidateBlockCache } from '../../../lib/blocks.js';

// GET: list blocked users
export async function GET(request) {
  try {
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;
    const { userid } = auth;
    const sb = getSupabaseAdmin();

    const { data, error } = await sb
      .from('user_blocks')
      .select('id, blocked_id, created_at')
      .eq('blocker_id', userid)
      .order('created_at', { ascending: false });

    if (error) throw error;

    // Fetch profiles for blocked users
    const blockedIds = data.map(b => b.blocked_id);
    let profiles = {};
    if (blockedIds.length > 0) {
      const { data: pData } = await sb.from('profiles').select('moodle_id, name, avatar, color, dept').in('moodle_id', blockedIds);
      if (pData) pData.forEach(p => { profiles[p.moodle_id] = p; });
    }

    const blocks = data.map(b => {
      const p = profiles[b.blocked_id] || { name: `User ${b.blocked_id}`, avatar: '?', color: '#888' };
      return {
        id: b.id,
        blockedId: b.blocked_id,
        name: p.name,
        avatar: p.avatar,
        color: p.color,
        dept: p.dept,
        blockedAt: b.created_at,
      };
    });

    return NextResponse.json(blocks);
  } catch (err) {
    console.error('[Blocks GET]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

// POST: block a user
export async function POST(request) {
  try {
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;
    const { userid } = auth;
    const { user_id } = await request.json();

    const numBlock = Number(user_id);
    if (!user_id || !Number.isFinite(numBlock) || numBlock === userid) {
      return NextResponse.json({ error: 'Invalid user' }, { status: 400 });
    }

    const sb = getSupabaseAdmin();

    // Insert block record
    const { error } = await sb
      .from('user_blocks')
      .insert({ blocker_id: userid, blocked_id: numBlock });

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: 'Already blocked' }, { status: 409 });
      }
      throw error;
    }

    // Also remove any friendship between the two users
    await sb
      .from('friendships')
      .delete()
      .or(
        `and(requester_id.eq.${userid},addressee_id.eq.${numBlock}),and(requester_id.eq.${numBlock},addressee_id.eq.${userid})`
      );

    invalidateBlockCache(userid);
    invalidateBlockCache(numBlock);

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[Blocks POST]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

// DELETE: unblock a user
export async function DELETE(request) {
  try {
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;
    const { userid } = auth;
    const { user_id } = await request.json();

    const numUnblock = Number(user_id);
    if (!user_id || !Number.isFinite(numUnblock)) {
      return NextResponse.json({ error: 'user_id required' }, { status: 400 });
    }

    const sb = getSupabaseAdmin();

    const { error } = await sb
      .from('user_blocks')
      .delete()
      .eq('blocker_id', userid)
      .eq('blocked_id', numUnblock);

    if (error) throw error;
    invalidateBlockCache(userid);
    invalidateBlockCache(numUnblock);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[Blocks DELETE]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
