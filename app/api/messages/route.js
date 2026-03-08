import { NextResponse } from 'next/server';
import { requireAuth } from '../../../lib/auth/require-auth.js';
import { getSupabaseAdmin } from '../../../lib/supabase/server.js';
import { isEnrolledInCourse } from '../../../lib/auth/course-enrollment.js';

const MAX_TEXT_LENGTH = 2000;
const toMoodleId = (id) => id?.startsWith('mc_') ? id.slice(3) : id;

export async function GET(request) {
  try {
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;
    const { wstoken, userid } = auth;

    const { searchParams } = new URL(request.url);
    const courseId = searchParams.get('course_id');
    if (!courseId) return NextResponse.json({ error: 'course_id required' }, { status: 400 });

    // H3: Verify course enrollment
    if (!await isEnrolledInCourse(wstoken, userid, toMoodleId(courseId))) {
      return NextResponse.json({ error: 'Not enrolled in this course' }, { status: 403 });
    }

    const sb = getSupabaseAdmin();
    const { data, error } = await sb
      .from('messages')
      .select('*, profiles(name, avatar, color)')
      .eq('course_id', courseId)
      .order('created_at', { ascending: true })
      .limit(200);

    if (error) throw error;
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;
    const { wstoken, userid } = auth;

    const { course_id, text } = await request.json();
    if (!course_id || !text?.trim()) {
      return NextResponse.json({ error: 'course_id and text required' }, { status: 400 });
    }

    // M8: Text length limit
    if (text.length > MAX_TEXT_LENGTH) {
      return NextResponse.json({ error: 'Text too long' }, { status: 400 });
    }

    // H3: Verify course enrollment
    if (!await isEnrolledInCourse(wstoken, userid, toMoodleId(course_id))) {
      return NextResponse.json({ error: 'Not enrolled in this course' }, { status: 403 });
    }

    const sb = getSupabaseAdmin();

    await sb.from('profiles').upsert(
      { moodle_id: userid, name: `User ${userid}` },
      { onConflict: 'moodle_id', ignoreDuplicates: true }
    );

    const { data, error } = await sb
      .from('messages')
      .insert({ course_id, moodle_user_id: userid, text: text.trim() })
      .select('*, profiles(name, avatar, color)')
      .single();

    if (error) throw error;
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
