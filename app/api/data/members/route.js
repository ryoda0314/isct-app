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

    const users = await fetchEnrolledUsers(wstoken, Number(courseid));

    const members = users.map(u => ({
      id: u.id,
      name: u.fullname || '',
      avatar: u.profileimageurl || '',
    }));

    return NextResponse.json({ members });
  } catch (err) {
    console.error('[members]', err.message);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
