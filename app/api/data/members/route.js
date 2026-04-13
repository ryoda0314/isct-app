import { NextResponse } from 'next/server';
import { requireAuth } from '../../../../lib/auth/require-auth.js';
import { getSupabaseAdmin } from '../../../../lib/supabase/server.js';
import { isEnrolledInCourse } from '../../../../lib/auth/course-enrollment.js';

export async function GET(request) {
  try {
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;

    const { searchParams } = new URL(request.url);
    const courseid = searchParams.get('courseid');
    if (!courseid) {
      return NextResponse.json({ error: 'courseid required' }, { status: 400 });
    }

    const { wstoken, userid } = auth;

    // Verify course enrollment
    if (!await isEnrolledInCourse(wstoken, userid, courseid)) {
      return NextResponse.json({ error: 'Not enrolled in this course' }, { status: 403 });
    }

    // Use admin client (service_role) to bypass RLS on course_enrollments
    const sb = getSupabaseAdmin();
    const { data: enrollments, error: enrollErr } = await sb
      .from('course_enrollments')
      .select('moodle_user_id')
      .eq('course_moodle_id', Number(courseid));

    if (enrollErr || !enrollments || enrollments.length === 0) {
      return NextResponse.json({ members: [] });
    }

    const userIds = enrollments.map(e => e.moodle_user_id);
    const { data: profiles, error: profileErr } = await sb
      .from('profiles')
      .select('moodle_id, name, color')
      .in('moodle_id', userIds);

    if (profileErr || !profiles) {
      return NextResponse.json({ members: [] });
    }

    const members = profiles.map(p => ({
      id: p.moodle_id,
      name: p.name,
      col: p.color,
    }));

    return NextResponse.json({ members });
  } catch (err) {
    console.error('[Members] GET error:', err.message, err.stack);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
