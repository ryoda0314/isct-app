import { NextResponse } from 'next/server';
import { publicGate, publicCache } from '../../../lib/public-api.js';
import { getSupabaseAdmin } from '../../../lib/supabase/server.js';
import { classesKey } from '../../../lib/exam-import/keys.js';

// PostgREST は 1 回で最大 1000 行しか返さない。試験は 1 クォーター約 200 行ずつ増えるので、
// 1000 行ずつ区切って全部取る（以前は 1000 行で黙って切れ、最新クォーターの最後の試験が落ちていた）。
async function selectAll(build) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await build().range(from, from + 999);
    if (error) return { data: null, error };
    out.push(...(data || []));
    if (!data || data.length < 1000) return { data: out, error: null };
  }
}

// GET /api/exams?year=2025&quarter=2Q[&classes=1]
// year・quarter を省くと直近 400 日ぶん（ホーム・カレンダー・ICS 書き出し用）。
// classes=1 で、そのクォーター（省いたときは最新のクォーター）の試験期間中の授業・補講も返す。
async function handleGET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const year = searchParams.get('year') || '';
    const quarter = searchParams.get('quarter') || '';
    const wantClasses = searchParams.get('classes') === '1';

    const sb = getSupabaseAdmin();

    // クォーター一覧
    const { data: qList, error: qErr } = await selectAll(() => sb.from('exam_schedules').select('year, quarter').order('id'));
    if (qErr) { console.error('[Exams]', qErr.message); return NextResponse.json({ error: 'Internal error' }, { status: 500 }); }
    const quarters = [...new Set((qList || []).map(r => `${r.year}_${r.quarter}`))].sort().reverse()
      .map(s => { const [y, q] = s.split('_'); return { year: y, quarter: q }; });

    // 試験データ
    const { data, error } = await selectAll(() => {
      let query = sb.from('exam_schedules')
        .select('id, code, code_raw, name, date, day, period, room, instructor, year, quarter')
        .order('date').order('period').order('id');
      if (year) query = query.eq('year', year);
      if (quarter) query = query.eq('quarter', quarter);
      if (!year && !quarter) query = query.gte('date', new Date(Date.now() - 400 * 864e5).toISOString().slice(0, 10));
      return query;
    });
    if (error) { console.error('[Exams]', error.message); return NextResponse.json({ error: 'Internal error' }, { status: 500 }); }

    const body = { exams: data || [], quarters };
    if (wantClasses) {
      const cy = year || quarters[0]?.year, cq = quarter || quarters[0]?.quarter;
      body.examWeekClasses = null;
      if (cy && cq) {
        const { data: row } = await sb.from('site_settings').select('value').eq('key', classesKey(cy, cq)).maybeSingle();
        if (row?.value) body.examWeekClasses = row.value;
      }
    }
    return NextResponse.json(body);
  } catch (e) {
    console.error('[Exams GET]', e);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

// 未ログインにも公開（ログイン任意化）。誰が見ても同じ結果なので CDN に 300 秒キャッシュさせる。
// 入口の判定（guest_access の非常停止）と Cache-Control は lib/public-api.js。
export async function GET(request) {
  const gate = await publicGate(request);
  if (gate) return gate;
  return publicCache(await handleGET(request), 300);
}
