import { NextResponse } from 'next/server';
import { requireAuth } from '../../../../lib/auth/require-auth.js';
import { getSupabaseAdmin } from '../../../../lib/supabase/server.js';

/**
 * Look up grading breakdown for the user's enrolled courses.
 *
 * Body (POST): { courses: [{ code, section?, name?, quarter? }], year? }
 *   - my-textbooks と同じ前提でクライアントから courses を受け取る
 *     (Moodle はサーバーから 403 を返すため)
 */
export async function POST(request) {
  try {
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;

    const body = await request.json().catch(() => ({}));
    const { searchParams } = new URL(request.url);
    const year = String(body.year || searchParams.get('year') || '2026');
    const courses = Array.isArray(body.courses) ? body.courses : [];

    if (courses.length === 0) {
      return NextResponse.json({ courses: [], summary: { total: 0, with_breakdown: 0 } });
    }

    // Lookup keys: `${code}:${section}` preferred, fallback to bare `code`
    const keysToCourse = new Map();
    for (const c of courses) {
      if (!c?.code || typeof c.code !== 'string') continue;
      const meta = {
        code: c.code,
        section: c.section || null,
        name: c.name || c.code,
        quarter: c.quarter || null,
      };
      if (meta.section) {
        const k = `${meta.code}:${meta.section}`;
        if (!keysToCourse.has(k)) keysToCourse.set(k, meta);
      }
      if (!keysToCourse.has(meta.code)) keysToCourse.set(meta.code, meta);
    }
    const allKeys = [...keysToCourse.keys()];
    if (allKeys.length === 0) {
      return NextResponse.json({ courses: [], summary: { total: 0, with_breakdown: 0 } });
    }

    const sb = getSupabaseAdmin();
    const { data, error } = await sb.from('course_grading')
      .select('course_code, raw_text, breakdown, total_percent, has_breakdown, source_url')
      .eq('syllabus_year', year)
      .in('course_code', allKeys);
    if (error) {
      console.error('[MyGrading] DB error:', error);
      return NextResponse.json({ error: 'DB error', detail: error.message }, { status: 500 });
    }

    // セクションありを優先(同じ code に対し `code:section` と `code` の両方が DB にある場合)
    const byBaseCode = new Map();
    for (const row of (data || [])) {
      const meta = keysToCourse.get(row.course_code);
      if (!meta) continue;
      const baseCode = meta.code;
      const existing = byBaseCode.get(baseCode);
      // 「code:section」のヒットを優先
      const isSpecific = row.course_code.includes(':');
      if (!existing || (isSpecific && !existing.specific)) {
        byBaseCode.set(baseCode, { row, meta, specific: isSpecific });
      }
    }

    const out = [...byBaseCode.values()].map(({ row, meta }) => ({
      course_code: meta.code,
      section: meta.section,
      name: meta.name,
      quarter: meta.quarter,
      raw_text: row.raw_text,
      breakdown: row.breakdown,
      total_percent: row.total_percent,
      has_breakdown: row.has_breakdown,
      source_url: row.source_url,
    })).sort((a, b) =>
      (a.quarter || 9) - (b.quarter || 9) ||
      (a.name || '').localeCompare(b.name || '', 'ja')
    );

    const summary = {
      total: out.length,
      with_breakdown: out.filter(c => c.has_breakdown).length,
    };

    return NextResponse.json({ courses: out, summary, year });
  } catch (err) {
    console.error('[MyGrading] POST error:', err.message, err.stack);
    return NextResponse.json({ error: 'Internal error', detail: err.message }, { status: 500 });
  }
}
