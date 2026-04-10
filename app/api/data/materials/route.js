import { NextResponse } from 'next/server';
import { requireAuth } from '../../../../lib/auth/require-auth.js';
import { fetchCourseContents } from '../../../../lib/api/courses.js';
import { transformCourseMaterials } from '../../../../lib/transform/material-transform.js';

export async function GET(request) {
  try {
    const auth = await requireAuth(request);
    if (auth.error) {
      console.error('[materials] auth failed');
      return auth.error;
    }

    const { searchParams } = new URL(request.url);
    const courseid = searchParams.get('courseid');
    if (!courseid) {
      return NextResponse.json({ error: 'courseid required' }, { status: 400 });
    }

    const { wstoken } = auth;
    console.log('[materials] fetching courseContents for courseid=', courseid);
    const raw = await fetchCourseContents(wstoken, Number(courseid));
    console.log('[materials] raw response type=%s length=%s', typeof raw, Array.isArray(raw) ? raw.length : 'N/A', Array.isArray(raw) ? '' : JSON.stringify(raw).slice(0, 200));
    const { sections, totalFiles } = transformCourseMaterials(raw, wstoken);
    console.log('[materials] transformed: sections=%d totalFiles=%d', sections.length, totalFiles);

    return NextResponse.json({ sections, totalFiles });
  } catch (err) {
    console.error('[materials] ERROR:', err.message, err.code || '');
    if (err.code === 'MOODLE_HTML_RESPONSE') {
      return NextResponse.json(
        { error: 'LMS_UNAVAILABLE', sections: [], totalFiles: 0 },
        { status: 200 },
      );
    }
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
