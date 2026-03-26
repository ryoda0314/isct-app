import { NextResponse } from 'next/server';
import { requireAuth } from '../../../lib/auth/require-auth.js';
import { getSupabaseAdmin } from '../../../lib/supabase/server.js';
import { isEnrolledInCourse } from '../../../lib/auth/course-enrollment.js';
import { notifyMentions } from '../../../lib/mentions.js';
import { checkNgWords } from '../../../lib/ng-filter.js';
import { getBlockedIds } from '../../../lib/blocks.js';

const MAX_TEXT_LENGTH = 2000;
const toMoodleId = (id) => id?.startsWith('mc_') ? id.slice(3) : id;

export async function GET(request) {
  try {
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;

    const { searchParams } = new URL(request.url);
    const postId = searchParams.get('post_id');
    if (!postId) return NextResponse.json({ error: 'post_id required' }, { status: 400 });

    const sb = getSupabaseAdmin();
    const { data, error } = await sb
      .from('comments')
      .select('*, profiles(name, avatar, color)')
      .eq('post_id', postId)
      .order('created_at', { ascending: true })
      .limit(100);

    if (error) {
      console.error('[Comments GET]', error.message);
      return NextResponse.json({ error: `DB query failed: ${error.message}` }, { status: 500 });
    }

    // Filter out comments from blocked users
    const blockedIds = await getBlockedIds(auth.userid);
    const filtered = blockedIds.size === 0 ? data : data.filter(c => !blockedIds.has(c.moodle_user_id));
    return NextResponse.json(filtered);
  } catch (err) {
    console.error('[Comments GET]', err);
    return NextResponse.json({ error: `Internal error: ${err.message}` }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;
    const { wstoken, userid, fullname } = auth;

    const { post_id, text } = await request.json();
    if (!post_id || !text?.trim()) {
      return NextResponse.json({ error: 'post_id and text required' }, { status: 400 });
    }
    if (text.length > MAX_TEXT_LENGTH) {
      return NextResponse.json({ error: 'Text too long' }, { status: 400 });
    }

    // NG word check
    const ngResult = await checkNgWords(text, { userId: userid, type: 'comment' });
    if (ngResult.blocked) {
      return NextResponse.json({ error: '禁止ワードが含まれています' }, { status: 400 });
    }

    const sb = getSupabaseAdmin();

    // Look up the post's course_id for enrollment check
    const { data: post, error: postErr } = await sb
      .from('posts')
      .select('course_id')
      .eq('id', post_id)
      .single();

    if (postErr || !post) {
      return NextResponse.json({ error: 'Post not found' }, { status: 404 });
    }

    let enrolled;
    try {
      enrolled = await isEnrolledInCourse(wstoken, userid, toMoodleId(post.course_id));
    } catch (e) {
      console.error('[Comments POST] enrollment check:', e.message);
      return NextResponse.json({ error: `Enrollment check failed: ${e.message}` }, { status: 500 });
    }
    if (!enrolled) {
      return NextResponse.json({ error: 'Not enrolled in this course' }, { status: 403 });
    }

    // Upsert profile
    await sb.from('profiles').upsert(
      { moodle_id: userid, name: fullname || `User ${userid}` },
      { onConflict: 'moodle_id', ignoreDuplicates: false }
    );

    const { data, error } = await sb
      .from('comments')
      .insert({ post_id, moodle_user_id: userid, text: text.trim() })
      .select('*, profiles(name, avatar, color)')
      .single();

    if (error) {
      console.error('[Comments POST]', error.message);
      return NextResponse.json({ error: `Insert failed: ${error.message}` }, { status: 500 });
    }

    // Notify mentioned users (non-blocking)
    try { await notifyMentions(text, userid, fullname, post.course_id, 'コメント'); } catch (e) { console.error('[Comments POST] mentions:', e); }

    return NextResponse.json(data);
  } catch (err) {
    console.error('[Comments POST]', err);
    return NextResponse.json({ error: `Internal error: ${err.message}` }, { status: 500 });
  }
}

export async function DELETE(request) {
  try {
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;
    const { userid } = auth;

    const { comment_id } = await request.json();
    if (!comment_id) {
      return NextResponse.json({ error: 'comment_id required' }, { status: 400 });
    }

    const sb = getSupabaseAdmin();

    const { data: comment, error: fetchErr } = await sb
      .from('comments')
      .select('moodle_user_id')
      .eq('id', comment_id)
      .single();

    if (fetchErr || !comment) {
      return NextResponse.json({ error: 'Comment not found' }, { status: 404 });
    }
    if (comment.moodle_user_id !== userid) {
      return NextResponse.json({ error: 'Not your comment' }, { status: 403 });
    }

    const { error } = await sb.from('comments').delete().eq('id', comment_id);
    if (error) {
      console.error('[Comments DELETE]', error.message);
      return NextResponse.json({ error: `Delete failed: ${error.message}` }, { status: 500 });
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[Comments DELETE]', err);
    return NextResponse.json({ error: `Internal error: ${err.message}` }, { status: 500 });
  }
}
