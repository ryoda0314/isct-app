import { NextResponse } from 'next/server';
import { requireAuth } from '../../../../lib/auth/require-auth.js';
import { fetchEnrolledUsers } from '../../../../lib/api/courses.js';
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

    // H3: Verify course enrollment
    if (!await isEnrolledInCourse(wstoken, userid, courseid)) {
      return NextResponse.json({ error: 'Not enrolled in this course' }, { status: 403 });
    }

    let users;
    try {
      users = await fetchEnrolledUsers(wstoken, Number(courseid));
    } catch (e) {
      console.error(`[Members] fetchEnrolledUsers failed for course ${courseid}:`, e.message);
      // Moodle may deny access (missing capability) — return empty list instead of 500
      return NextResponse.json({ members: [] });
    }

    const members = (users || []).map(u => ({
      id: u.id,
      name: u.fullname || '',
      avatar: u.profileimageurl || '',
    }));

    return NextResponse.json({ members });
  } catch (err) {
    console.error('[Members] GET error:', err.message, err.stack);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
