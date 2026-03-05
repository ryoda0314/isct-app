import { NextResponse } from 'next/server';
import { requireAuth } from '../../../../lib/auth/require-auth.js';
import { fetchCourseContents } from '../../../../lib/api/courses.js';
import { transformCourseMaterials } from '../../../../lib/transform/material-transform.js';

export async function GET(request) {
  try {
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;

    const { searchParams } = new URL(request.url);
    const courseid = searchParams.get('courseid');
    if (!courseid) {
      return NextResponse.json({ error: 'courseid required' }, { status: 400 });
    }

    const { wstoken } = auth;
    const raw = await fetchCourseContents(wstoken, Number(courseid));
    const { sections, totalFiles } = transformCourseMaterials(raw, wstoken);

    return NextResponse.json({ sections, totalFiles });
  } catch (err) {
    console.error('[materials]', err.message);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
