import { NextResponse } from 'next/server';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const deep = searchParams.get('deep');

  if (deep) {
    try {
      // Test same imports as /api/data/all
      const { requireAuth } = await import('../../../../lib/auth/require-auth.js');
      const { fetchUserCourses } = await import('../../../../lib/api/courses.js');
      const { fetchScheduleForCourses } = await import('../../../../lib/api/syllabus-scraper.js');
      const { fetchAssignments } = await import('../../../../lib/api/assignments.js');
      const { transformCourses } = await import('../../../../lib/transform/course-transform.js');
      const { getSupabaseAdmin } = await import('../../../../lib/supabase/server.js');
      const sb = getSupabaseAdmin();
      const { data, error } = await sb.from('profiles').select('count').limit(1);
      return NextResponse.json({
        status: 'ok',
        imports: 'all loaded',
        supabase: error ? `error: ${error.message}` : 'connected',
        env: {
          SUPABASE_URL: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
          SERVICE_KEY: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
          CRED_SECRET: !!process.env.CRED_SECRET,
        },
      });
    } catch (e) {
      return NextResponse.json({
        status: 'error',
        message: e.message,
        stack: e.stack?.split('\n').slice(0, 5),
      }, { status: 500 });
    }
  }

  return NextResponse.json({ status: 'ok' });
}
