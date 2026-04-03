import { getSupabaseAdmin } from '../../../../lib/supabase/server.js';

export async function GET(req) {
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

  if (quarter) query = query.ilike('quarter', `%${quarter}%`);

  // Search by name or code
  query = query.or(`name.ilike.%${q}%,code.ilike.%${q}%`);
  query = query.limit(30);

  const { data, error } = await query;
  if (error) {
    console.error('[syllabus-search]', error.message);
    return Response.json({ courses: [] });
  }

  return Response.json({ courses: data || [] });
}
