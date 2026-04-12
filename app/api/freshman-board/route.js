import { NextResponse } from 'next/server';
import { requireAuth } from '../../../lib/auth/require-auth.js';
import { getSupabaseAdmin } from '../../../lib/supabase/server.js';
import { checkNgWords } from '../../../lib/ng-filter.js';
import { getBlockedIds } from '../../../lib/blocks.js';
import { getMutedIds } from '../../../lib/mutes.js';

const MAX_TEXT_LENGTH = 5000;
const VALID_CATEGORIES = ['course_reg', 'circle', 'campus_life'];
const VALID_TYPES = ['discussion', 'question'];

export async function GET(request) {
  try {
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;
    const { userid } = auth;

    const { searchParams } = new URL(request.url);
    const category = searchParams.get('category');
    const limit = Math.min(parseInt(searchParams.get('limit')) || 30, 50);
    const before = searchParams.get('before');
    const search = searchParams.get('search');

    const sb = getSupabaseAdmin();

    // Pinned posts (initial load only)
    let pinnedPosts = [];
    if (!before) {
      let pinQ = sb
        .from('freshman_posts')
        .select('*, profiles(name, avatar, color), freshman_comments(count)')
        .eq('pinned', true)
        .order('created_at', { ascending: false })
        .limit(5);
      if (category) pinQ = pinQ.eq('category', category);
      const { data: pinned } = await pinQ;
      if (pinned) {
        pinnedPosts = pinned.map(p => ({
          ...p,
          comment_count: p.freshman_comments?.[0]?.count || 0,
          freshman_comments: undefined,
        }));
      }
    }

    let query = sb
      .from('freshman_posts')
      .select('*, profiles(name, avatar, color), freshman_comments(count)')
      .order('created_at', { ascending: false })
      .or('pinned.is.null,pinned.eq.false');

    if (category) query = query.eq('category', category);

    if (search) {
      const safeSearch = search.slice(0, 200);
      query = query.ilike('text', `%${safeSearch}%`);
      query = query.limit(50);
    } else {
      query = query.limit(limit + 1);
      if (before) query = query.lt('created_at', before);
    }

    const { data, error } = await query;
    if (error) {
      console.error('[FreshmanBoard GET]', error.message);
      return NextResponse.json({ error: 'Internal error' }, { status: 500 });
    }

    // Filter blocked/muted
    const [blockedIds, mutedIds] = await Promise.all([getBlockedIds(userid), getMutedIds(userid)]);
    const isHidden = (uid) => blockedIds.has(uid) || mutedIds.has(uid);
    const filterBlocked = (list) => (blockedIds.size === 0 && mutedIds.size === 0) ? list : list.filter(p => !isHidden(p.moodle_user_id));

    pinnedPosts = filterBlocked(pinnedPosts);

    if (search) {
      const posts = filterBlocked(data).map(p => ({
        ...p,
        comment_count: p.freshman_comments?.[0]?.count || 0,
        freshman_comments: undefined,
      }));
      return NextResponse.json({ posts, pinnedPosts: [], hasMore: false });
    }

    const filtered = filterBlocked(data);
    const hasMore = filtered.length > limit;
    const posts = (hasMore ? filtered.slice(0, limit) : filtered).map(p => ({
      ...p,
      comment_count: p.freshman_comments?.[0]?.count || 0,
      freshman_comments: undefined,
    }));

    return NextResponse.json({ posts, pinnedPosts, hasMore });
  } catch (err) {
    console.error('[FreshmanBoard GET]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;
    const { userid, fullname } = auth;

    const { category, text, type } = await request.json();
    if (!category || !text?.trim()) {
      return NextResponse.json({ error: 'category and text required' }, { status: 400 });
    }
    if (!VALID_CATEGORIES.includes(category)) {
      return NextResponse.json({ error: 'Invalid category' }, { status: 400 });
    }
    if (text.length > MAX_TEXT_LENGTH) {
      return NextResponse.json({ error: 'Text too long' }, { status: 400 });
    }
    const postType = VALID_TYPES.includes(type) ? type : 'discussion';

    // NG word check
    const ngResult = await checkNgWords(text, { userId: userid, type: 'freshman_post' });
    if (ngResult.blocked) {
      return NextResponse.json({ error: '禁止ワードが含まれています' }, { status: 400 });
    }

    const sb = getSupabaseAdmin();

    // Upsert profile
    await sb.from('profiles').upsert(
      { moodle_id: userid, name: fullname || `User ${userid}` },
      { onConflict: 'moodle_id', ignoreDuplicates: false }
    );

    // Fetch year_group for role badge
    const { data: profile } = await sb.from('profiles').select('year_group').eq('moodle_id', userid).single();
    const row = { category, moodle_user_id: userid, text: text.trim(), type: postType };
    if (profile?.year_group) row.year_group = profile.year_group;

    const { data, error } = await sb
      .from('freshman_posts')
      .insert(row)
      .select('*, profiles(name, avatar, color)')
      .single();

    if (error) {
      console.error('[FreshmanBoard POST]', error.message);
      return NextResponse.json({ error: 'Internal error' }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (err) {
    console.error('[FreshmanBoard POST]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

export async function PATCH(request) {
  try {
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;
    const { userid } = auth;

    const body = await request.json();
    const { post_id, action } = body;
    if (!post_id || !action) {
      return NextResponse.json({ error: 'post_id and action required' }, { status: 400 });
    }

    const sb = getSupabaseAdmin();

    // --- LIKE ---
    if (action === 'like') {
      // Use atomic RPC to prevent race conditions
      const { error: rpcErr } = await sb.rpc('toggle_freshman_like', {
        p_post_id: post_id,
        p_user_id: userid,
      });

      if (rpcErr) {
        // Fallback: non-atomic JS approach
        console.warn('[FreshmanBoard PATCH like] RPC failed, falling back:', rpcErr.message);
        const { data: post, error: fetchErr } = await sb
          .from('freshman_posts').select('likes').eq('id', post_id).single();
        if (fetchErr || !post) return NextResponse.json({ error: 'Post not found' }, { status: 404 });
        const likes = post.likes || [];
        const newLikes = likes.includes(userid)
          ? likes.filter(id => id !== userid)
          : [...likes, userid];
        await sb.from('freshman_posts').update({ likes: newLikes }).eq('id', post_id);
      }

      const { data, error } = await sb
        .from('freshman_posts')
        .select('*, profiles(name, avatar, color)')
        .eq('id', post_id)
        .single();
      if (error) return NextResponse.json({ error: 'Internal error' }, { status: 500 });
      return NextResponse.json(data);
    }

    // --- EDIT ---
    if (action === 'edit') {
      const { text } = body;
      if (!text?.trim()) return NextResponse.json({ error: 'text required' }, { status: 400 });
      if (text.length > MAX_TEXT_LENGTH) return NextResponse.json({ error: 'Text too long' }, { status: 400 });

      const { data: post } = await sb.from('freshman_posts').select('moodle_user_id').eq('id', post_id).single();
      if (!post) return NextResponse.json({ error: 'Post not found' }, { status: 404 });
      if (post.moodle_user_id !== userid) return NextResponse.json({ error: 'Not your post' }, { status: 403 });

      const { data, error } = await sb
        .from('freshman_posts')
        .update({ text: text.trim(), edited_at: new Date().toISOString() })
        .eq('id', post_id)
        .select('*, profiles(name, avatar, color)')
        .single();
      if (error) return NextResponse.json({ error: 'Internal error' }, { status: 500 });
      return NextResponse.json(data);
    }

    // --- PIN ---
    if (action === 'pin') {
      const { data: post } = await sb.from('freshman_posts').select('moodle_user_id, pinned').eq('id', post_id).single();
      if (!post) return NextResponse.json({ error: 'Post not found' }, { status: 404 });
      if (post.moodle_user_id !== userid) return NextResponse.json({ error: 'Not your post' }, { status: 403 });

      const { data, error } = await sb
        .from('freshman_posts')
        .update({ pinned: !post.pinned })
        .eq('id', post_id)
        .select('*, profiles(name, avatar, color)')
        .single();
      if (error) return NextResponse.json({ error: 'Internal error' }, { status: 500 });
      return NextResponse.json(data);
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (err) {
    console.error('[FreshmanBoard PATCH]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

export async function DELETE(request) {
  try {
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;
    const { userid } = auth;

    const { post_id } = await request.json();
    if (!post_id) return NextResponse.json({ error: 'post_id required' }, { status: 400 });

    const sb = getSupabaseAdmin();

    const { data: post } = await sb.from('freshman_posts').select('moodle_user_id').eq('id', post_id).single();
    if (!post) return NextResponse.json({ error: 'Post not found' }, { status: 404 });
    if (post.moodle_user_id !== userid) return NextResponse.json({ error: 'Not your post' }, { status: 403 });

    const { error } = await sb.from('freshman_posts').delete().eq('id', post_id);
    if (error) {
      console.error('[FreshmanBoard DELETE]', error.message);
      return NextResponse.json({ error: 'Internal error' }, { status: 500 });
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[FreshmanBoard DELETE]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
