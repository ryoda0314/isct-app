import { NextResponse } from 'next/server';
import { requireAuth } from '../../../../lib/auth/require-auth.js';
import { getSupabaseAdmin } from '../../../../lib/supabase/server.js';
import { checkNgWords } from '../../../../lib/ng-filter.js';
import { getBlockedIds } from '../../../../lib/blocks.js';
import { getMutedIds } from '../../../../lib/mutes.js';

const MAX_TEXT_LENGTH = 2000;

export async function GET(request) {
  try {
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;
    const { userid } = auth;

    const { searchParams } = new URL(request.url);
    const postId = searchParams.get('post_id');
    if (!postId) return NextResponse.json({ error: 'post_id required' }, { status: 400 });

    const sb = getSupabaseAdmin();

    const { data, error } = await sb
      .from('freshman_comments')
      .select('*, profiles(name, avatar, color)')
      .eq('post_id', postId)
      .order('created_at', { ascending: true })
      .limit(100);

    if (error) {
      console.error('[FreshmanComments GET]', error.message);
      return NextResponse.json({ error: 'Internal error' }, { status: 500 });
    }

    const [blockedIds, mutedIds] = await Promise.all([getBlockedIds(userid), getMutedIds(userid)]);
    const isHidden = (uid) => blockedIds.has(uid) || mutedIds.has(uid);
    const filtered = (blockedIds.size === 0 && mutedIds.size === 0) ? data : data.filter(c => !isHidden(c.moodle_user_id));
    return NextResponse.json(filtered);
  } catch (err) {
    console.error('[FreshmanComments GET]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;
    const { userid, fullname } = auth;

    const { post_id, text } = await request.json();
    if (!post_id || !text?.trim()) {
      return NextResponse.json({ error: 'post_id and text required' }, { status: 400 });
    }
    if (text.length > MAX_TEXT_LENGTH) {
      return NextResponse.json({ error: 'Text too long' }, { status: 400 });
    }

    const ngResult = await checkNgWords(text, { userId: userid, type: 'freshman_comment' });
    if (ngResult.blocked) {
      return NextResponse.json({ error: '禁止ワードが含まれています' }, { status: 400 });
    }

    const sb = getSupabaseAdmin();

    // Verify post exists
    const { data: post } = await sb.from('freshman_posts').select('id').eq('id', post_id).single();
    if (!post) return NextResponse.json({ error: 'Post not found' }, { status: 404 });

    // Upsert profile
    await sb.from('profiles').upsert(
      { moodle_id: userid, name: fullname || `User ${userid}` },
      { onConflict: 'moodle_id', ignoreDuplicates: false }
    );

    const { data, error } = await sb
      .from('freshman_comments')
      .insert({ post_id, moodle_user_id: userid, text: text.trim() })
      .select('*, profiles(name, avatar, color)')
      .single();

    if (error) {
      console.error('[FreshmanComments POST]', error.message);
      return NextResponse.json({ error: 'Internal error' }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (err) {
    console.error('[FreshmanComments POST]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

export async function DELETE(request) {
  try {
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;
    const { userid } = auth;

    const { comment_id } = await request.json();
    if (!comment_id) return NextResponse.json({ error: 'comment_id required' }, { status: 400 });

    const sb = getSupabaseAdmin();

    const { data: comment } = await sb.from('freshman_comments').select('moodle_user_id').eq('id', comment_id).single();
    if (!comment) return NextResponse.json({ error: 'Comment not found' }, { status: 404 });
    if (comment.moodle_user_id !== userid) return NextResponse.json({ error: 'Not your comment' }, { status: 403 });

    const { error } = await sb.from('freshman_comments').delete().eq('id', comment_id);
    if (error) {
      console.error('[FreshmanComments DELETE]', error.message);
      return NextResponse.json({ error: 'Internal error' }, { status: 500 });
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[FreshmanComments DELETE]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
