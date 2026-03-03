import { NextResponse } from 'next/server';
import { getToken } from '../../../../lib/auth/token-manager.js';
import { fetchCourseContents } from '../../../../lib/api/courses.js';
import { transformCourseMaterials } from '../../../../lib/transform/material-transform.js';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const courseid = searchParams.get('courseid');
    if (!courseid) {
      return NextResponse.json({ error: 'courseid required' }, { status: 400 });
    }

    const { wstoken } = await getToken();
    const raw = await fetchCourseContents(wstoken, Number(courseid));
    const { sections, totalFiles } = transformCourseMaterials(raw, wstoken);

    return NextResponse.json({ sections, totalFiles });
  } catch (err) {
    console.error('[materials]', err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
