import { NextResponse } from 'next/server';
import { requireAuth } from '../../../lib/auth/require-auth.js';
import { getSupabaseAdmin } from '../../../lib/supabase/server.js';

// GET /api/exams?year=2025&quarter=2Q
export async function GET(request) {
  try {
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;

    const { searchParams } = new URL(request.url);
    const year = searchParams.get('year') || '';
    const quarter = searchParams.get('quarter') || '';

    const sb = getSupabaseAdmin();

    // クォーター一覧を取得
    const { data: qList } = await sb
      .from('exam_schedules')
      .select('year, quarter');
    const quarters = [...new Set((qList || []).map(r => `${r.year}_${r.quarter}`))].sort().reverse()
      .map(s => { const [y, q] = s.split('_'); return { year: y, quarter: q }; });

    // 試験データ取得
    let query = sb.from('exam_schedules')
      .select('id, code, code_raw, name, date, day, period, room, instructor, year, quarter')
      .order('date').order('period');
    if (year) query = query.eq('year', year);
    if (quarter) query = query.eq('quarter', quarter);
    const { data, error } = await query;
    if (error) { console.error('[Exams]', error.message); return NextResponse.json({ error: 'Internal error' }, { status: 500 }); }

    return NextResponse.json({ exams: data || [], quarters });
  } catch (e) {
    console.error('[Exams GET]', e);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}