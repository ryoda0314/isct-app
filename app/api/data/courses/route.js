import { NextResponse } from 'next/server';
import { getToken } from '../../../../lib/auth/token-manager.js';
import { fetchUserCourses } from '../../../../lib/api/courses.js';
import { transformCourses } from '../../../../lib/transform/course-transform.js';

export async function GET() {
  try {
    const { wstoken, userid } = await getToken();
    const raw = await fetchUserCourses(wstoken, userid);
    return NextResponse.json({ courses: transformCourses(raw) });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
