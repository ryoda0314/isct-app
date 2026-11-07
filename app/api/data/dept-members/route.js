import { NextResponse } from 'next/server';
import { requireAuth } from '../../../../lib/auth/require-auth.js';
import { getSupabaseAdmin } from '../../../../lib/supabase/server.js';
import { DEPTS } from '../../../../campus-sns/data.js';

// Member list for a dept / school / unit / sandbox room.
// Replaces the browser's direct anon-key query on `profiles`, which required
// anon SELECT on the whole table (security report F-1). Only the three columns
// the member panel needs leave the server.
//   ?prefix=CSC                 → profiles.dept = 'CSC'
//   ?prefix=school:engineering  → profiles.dept in that school's depts
//   ?prefix=unit:25B-7          → profiles.unit = '25B-7'
//   ?prefix=global:sandbox      → everyone
export async function GET(request) {
  try {
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;

    const prefix = new URL(request.url).searchParams.get('prefix') || '';
    const sb = getSupabaseAdmin();
    let query = sb.from('profiles').select('moodle_id, name, color');

    if (prefix === 'global:sandbox') {
      // all users
    } else if (prefix.startsWith('school:')) {
      const schoolKey = prefix.slice('school:'.length);
      const deptCodes = Object.entries(DEPTS).filter(([, d]) => d.school === schoolKey).map(([code]) => code);
      if (deptCodes.length === 0) return NextResponse.json({ error: 'Unknown school' }, { status: 400 });
      query = query.in('dept', deptCodes);
    } else if (prefix.startsWith('unit:')) {
      const unitId = prefix.slice('unit:'.length);
      if (!unitId || unitId.length > 32) return NextResponse.json({ error: 'Bad unit' }, { status: 400 });
      query = query.eq('unit', unitId);
    } else if (DEPTS[prefix]) {
      query = query.eq('dept', prefix);
    } else {
      return NextResponse.json({ error: 'Bad prefix' }, { status: 400 });
    }

    const { data, error } = await query;
    if (error) {
      console.error('[DeptMembers GET]', error.message);
      return NextResponse.json({ error: 'Internal error' }, { status: 500 });
    }
    const members = (data || []).map(p => ({ id: p.moodle_id, name: p.name, col: p.color }));
    return NextResponse.json({ members });
  } catch (err) {
    console.error('[DeptMembers GET]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
