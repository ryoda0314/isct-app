import { NextResponse } from 'next/server';
import { requireAuth } from '../../../../lib/auth/require-auth.js';
import { fetchUserCourses } from '../../../../lib/api/courses.js';
import { transformCourses } from '../../../../lib/transform/course-transform.js';

export async function GET(request) {
  try {
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;
    const { wstoken, userid } = auth;
    const raw = await fetchUserCourses(wstoken, userid);
    return NextResponse.json({ courses: transformCourses(raw) });
  } catch (err) {
    console.error('[Courses] GET error:', err.message, err.stack);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
