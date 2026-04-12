import { getSupabaseAdmin } from '../../../../lib/supabase/server.js';
import { requireAuth } from '../../../../lib/auth/require-auth.js';

export async function GET(req) {
  // Require authentication
  const auth = await requireAuth(req);
  if (auth.error) return auth.error;

  const { searchParams } = new URL(req.url);
  const q = searchParams.get('q') || '';
  const year = searchParams.get('year') || '2026';
  const quarter = searchParams.get('quarter') || '';

  if (!q || q.length < 2) {
    return Response.json({ courses: [] });
  }

  const sb = getSupabaseAdmin();
  let query = sb.from('syllabus_courses')
    .select('code,name,teacher,day,per,period_start,period_end,room,quarter,syllabus_url,school,requirement')
    .eq('year', year);

  if (quarter) {
    // Sanitize: escape PostgREST special characters to prevent filter injection
    const safeQuarter = quarter.slice(0, 20).replace(/[,%()]/g, '');
    query = query.ilike('quarter', `%${safeQuarter}%`);
  }

  // Sanitize search query: escape PostgREST filter injection characters
  // The .or() method interpolates strings directly into PostgREST filter syntax,
  // so commas and parentheses can inject additional filter conditions.
  const safeQ = q.slice(0, 100).replace(/[,%()]/g, '');
  if (!safeQ) return Response.json({ courses: [] });

  query = query.or(`name.ilike.%${safeQ}%,code.ilike.%${safeQ}%`);
  query = query.limit(30);

  const { data, error } = await query;
  if (error) {
    console.error('[syllabus-search]', error.message);
    return Response.json({ courses: [] });
  }

  return Response.json({ courses: data || [] });
}
