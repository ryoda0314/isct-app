import { NextResponse } from 'next/server';
import { requireAuth } from '../../../lib/auth/require-auth.js';
import { getSupabaseAdmin } from '../../../lib/supabase/server.js';
import { isEnrolledInCourse } from '../../../lib/auth/course-enrollment.js';

const MAX_TEXT_LENGTH = 5000;
const VALID_TYPES = ['question', 'material', 'info', 'discussion', 'poll', 'anon'];
const toMoodleId = (id) => id?.startsWith('mc_') ? id.slice(3) : id;

export async function GET(request) {
  try {
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;
    const { wstoken, userid } = auth;

    const { searchParams } = new URL(request.url);
    const courseId = searchParams.get('course_id');
    if (!courseId) return NextResponse.json({ error: 'course_id required' }, { status: 400 });

    let enrolled;
    try {
      enrolled = await isEnrolledInCourse(wstoken, userid, toMoodleId(courseId));
    } catch (e) {
      console.error('[Posts GET] enrollment check failed:', e.message);
      return NextResponse.json({ error: `Enrollment check failed: ${e.message}` }, { status: 500 });
    }
    if (!enrolled) {
      return NextResponse.json({ error: 'Not enrolled in this course' }, { status: 403 });
    }

    const sb = getSupabaseAdmin();
    const { data, error } = await sb
      .from('posts')
      .select('*, profiles(name, avatar, color)')
      .eq('course_id', courseId)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) {
      console.error('[Posts GET] query:', error.message, error.details, error.hint);
      return NextResponse.json({ error: `DB query failed: ${error.message}` }, { status: 500 });
    }
    return NextResponse.json(data);
  } catch (err) {
    console.error('[Posts GET]', err);
    return NextResponse.json({ error: `Internal error: ${err.message}` }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;
    const { wstoken, userid } = auth;

    const { course_id, text, type = 'discussion', year_group = null } = await request.json();
    if (!course_id || !text?.trim()) {
      return NextResponse.json({ error: 'course_id and text required' }, { status: 400 });
    }
    if (text.length > MAX_TEXT_LENGTH) {
      return NextResponse.json({ error: 'Text too long' }, { status: 400 });
    }
    if (!VALID_TYPES.includes(type)) {
      return NextResponse.json({ error: 'Invalid type' }, { status: 400 });
    }

    let enrolled;
    try {
      enrolled = await isEnrolledInCourse(wstoken, userid, toMoodleId(course_id));
    } catch (e) {
      console.error('[Posts POST] enrollment check failed:', e.message);
      return NextResponse.json({ error: `Enrollment check failed: ${e.message}` }, { status: 500 });
    }
    if (!enrolled) {
      return NextResponse.json({ error: 'Not enrolled in this course' }, { status: 403 });
    }

    const sb = getSupabaseAdmin();

    const { error: profileErr } = await sb.from('profiles').upsert(
      { moodle_id: userid, name: `User ${userid}` },
      { onConflict: 'moodle_id', ignoreDuplicates: true }
    );
    if (profileErr) console.error('[Posts POST] profile upsert:', profileErr.message);

    const row = { course_id, moodle_user_id: userid, text: text.trim(), type };
    if (year_group) row.year_group = year_group;

    let { data, error } = await sb
      .from('posts')
      .insert(row)
      .select('*, profiles(name, avatar, color)')
      .single();

    // Retry without year_group if column doesn't exist yet
    if (error?.message?.includes('year_group') && year_group) {
      delete row.year_group;
      ({ data, error } = await sb
        .from('posts')
        .insert(row)
        .select('*, profiles(name, avatar, color)')
        .single());
    }

    if (error) {
      console.error('[Posts POST] insert:', error.message, error.details, error.hint);
      return NextResponse.json({ error: `Insert failed: ${error.message}` }, { status: 500 });
    }
    return NextResponse.json(data);
  } catch (err) {
    console.error('[Posts POST]', err);
    return NextResponse.json({ error: `Internal error: ${err.message}` }, { status: 500 });
  }
}

export async function PATCH(request) {
  try {
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;
    const { userid } = auth;

    const { post_id, action } = await request.json();
    if (!post_id || action !== 'like') {
      return NextResponse.json({ error: 'post_id and action="like" required' }, { status: 400 });
    }

    const sb = getSupabaseAdmin();
    const { data: post, error: fetchErr } = await sb
      .from('posts')
      .select('likes')
      .eq('id', post_id)
      .single();

    if (fetchErr) {
      console.error('[Posts PATCH] fetch:', fetchErr.message);
      return NextResponse.json({ error: `Fetch failed: ${fetchErr.message}` }, { status: 500 });
    }

    const likes = post.likes || [];
    const already = likes.includes(userid);
    const newLikes = already
      ? likes.filter(id => id !== userid)
      : [...likes, userid];

    const { data, error } = await sb
      .from('posts')
      .update({ likes: newLikes })
      .eq('id', post_id)
      .select('*, profiles(name, avatar, color)')
      .single();

    if (error) {
      console.error('[Posts PATCH] update:', error.message);
      return NextResponse.json({ error: `Update failed: ${error.message}` }, { status: 500 });
    }
    return NextResponse.json(data);
  } catch (err) {
    console.error('[Posts PATCH]', err);
    return NextResponse.json({ error: `Internal error: ${err.message}` }, { status: 500 });
  }
}
