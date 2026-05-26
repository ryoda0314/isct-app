import { NextResponse } from 'next/server';
import { requireAuth } from '../../../../lib/auth/require-auth.js';
import { getSupabaseAdmin } from '../../../../lib/supabase/server.js';
import { getDeptList } from '../../../../lib/api/syllabus-bulk.js';

const PAGE_SIZE = 60;

/**
 * 全科目から成績割合データを検索/絞り込み。
 *
 * Query params:
 *   year       — シラバス年度 (default 2026)
 *   dept       — 学系/系コード (e.g. "MEC", "CSC")
 *   quarter    — "1Q" | "2Q" | "1-2Q" | "3-4Q" | "1・3Q" 等
 *   day        — 月/火/水/木/金/土/日
 *   search     — 科目コード/名/raw_text の部分一致
 *   only_parsed — "1" の場合 has_breakdown=true のみ
 *   category   — 任意カテゴリ ("exam","report",...) が breakdown に含まれる科目のみ
 *   min_percent / max_percent — そのカテゴリの合算割合フィルタ (category 指定時のみ有効)
 *   page       — 0始まり
 */
export async function GET(request) {
  try {
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;

    const { searchParams } = new URL(request.url);

    // Meta mode: return distinct depts/years/quarters available in DB
    if (searchParams.get('meta') === '1') {
      const sb = getSupabaseAdmin();
      const PAGE = 1000;
      let from = 0;
      const deptSet = new Set();
      const yearSet = new Set();
      const quarterSet = new Set();
      const schoolByDept = {};
      while (true) {
        const { data, error } = await sb.from('syllabus_courses')
          .select('dept, year, quarter, school')
          .range(from, from + PAGE - 1);
        if (error) {
          console.error('[grading-search][meta] error:', error.message);
          return NextResponse.json({ error: 'DB error' }, { status: 500 });
        }
        if (!data || data.length === 0) break;
        for (const r of data) {
          if (r.dept) deptSet.add(r.dept);
          if (r.year) yearSet.add(r.year);
          if (r.quarter) quarterSet.add(r.quarter);
          if (r.dept && r.school) schoolByDept[r.dept] = r.school;
        }
        if (data.length < PAGE) break;
        from += PAGE;
      }
      // 学系コード→日本語名のマッピング (getDeptList が学院/コース名を持つ)
      const deptDict = {};
      try {
        const list = getDeptList();
        for (const d of list.departments) {
          deptDict[d.key] = { label: d.label, school: d.school };
        }
      } catch {}

      return NextResponse.json({
        years: [...yearSet].sort().reverse(),
        depts: [...deptSet].sort().map(d => ({
          key: d,
          // DB から school を引いて優先、無ければ buildDeptPaths 由来
          school: schoolByDept[d] || deptDict[d]?.school || '',
          label: deptDict[d]?.label || '',
        })),
        quarters: [...quarterSet].sort(),
      });
    }

    const year = String(searchParams.get('year') || '2026');
    const dept = searchParams.get('dept') || '';
    const quarter = searchParams.get('quarter') || '';
    const day = searchParams.get('day') || '';
    const search = (searchParams.get('search') || '').slice(0, 100).replace(/[,%()]/g, '');
    const onlyParsed = searchParams.get('only_parsed') === '1';
    const category = searchParams.get('category') || '';
    const minPercent = parseInt(searchParams.get('min_percent') || '0', 10);
    const maxPercent = parseInt(searchParams.get('max_percent') || '100', 10);
    const page = Math.max(0, parseInt(searchParams.get('page') || '0', 10));

    const sb = getSupabaseAdmin();

    // syllabus_courses 側で dept/quarter/day を絞り、ヒットしたコース集合と JOIN する。
    let courseQuery = sb.from('syllabus_courses')
      .select('code, section, name, dept, quarter, day, per, room, building, school')
      .eq('year', year);
    if (dept) courseQuery = courseQuery.eq('dept', dept);
    if (quarter) {
      // "1Q" を指定したら "1Q"/"1-2Q"/"1-4Q"/"1・3Q"/"2・1Q" 等すべて一致させる。
      // quarter 列の値に「単独の数字 N」が含まれているか OR で判定。
      const digit = quarter.replace(/[Qq]/, '');
      // 数値 1-4 のみ受け付ける
      if (/^[1-4]$/.test(digit)) {
        courseQuery = courseQuery.or([
          `quarter.eq.${digit}Q`,
          `quarter.like.${digit}-%`,
          `quarter.like.%-${digit}Q`,
          `quarter.like.${digit}・%`,
          `quarter.like.%・${digit}Q`,
        ].join(','));
      }
    }
    if (day) courseQuery = courseQuery.eq('day', day);
    if (search) courseQuery = courseQuery.or(`code.ilike.%${search}%,name.ilike.%${search}%`);

    const { data: courseRows, error: courseErr } = await courseQuery.limit(4000);
    if (courseErr) {
      console.error('[grading-search] syllabus query error:', courseErr.message);
      return NextResponse.json({ error: 'DB error' }, { status: 500 });
    }

    // 「code:section」と「code」の両方を引けるようにキー集合を作成
    const courseMeta = new Map();
    const lookupKeys = new Set();
    for (const c of (courseRows || [])) {
      const sectionKey = c.section ? `${c.code}:${c.section}` : null;
      const meta = {
        code: c.code, section: c.section || null, name: c.name,
        dept: c.dept, quarter: c.quarter, day: c.day, per: c.per,
        room: c.room, building: c.building, school: c.school,
      };
      if (sectionKey) {
        if (!courseMeta.has(sectionKey)) courseMeta.set(sectionKey, meta);
        lookupKeys.add(sectionKey);
      }
      if (!courseMeta.has(c.code)) courseMeta.set(c.code, meta);
      lookupKeys.add(c.code);
    }

    if (lookupKeys.size === 0) {
      return NextResponse.json({ rows: [], total: 0, page, pageSize: PAGE_SIZE });
    }

    // course_grading から該当キーを取る
    // in() に渡せる上限があるのでチャンク分割
    const keysArr = [...lookupKeys];
    const CHUNK = 300;
    let allGrading = [];
    for (let i = 0; i < keysArr.length; i += CHUNK) {
      const chunk = keysArr.slice(i, i + CHUNK);
      let q = sb.from('course_grading')
        .select('course_code, raw_text, breakdown, total_percent, has_breakdown, is_pass_fail, source_url')
        .eq('syllabus_year', year)
        .in('course_code', chunk);
      if (onlyParsed) q = q.eq('has_breakdown', true);
      const { data, error } = await q;
      if (error) {
        console.error('[grading-search] grading query error:', error.message);
        return NextResponse.json({ error: 'DB error' }, { status: 500 });
      }
      if (data) allGrading = allGrading.concat(data);
    }

    // base code 単位で section 指定優先しつつマージ
    const byBaseCode = new Map();
    for (const row of allGrading) {
      const meta = courseMeta.get(row.course_code);
      if (!meta) continue;
      const baseCode = meta.code;
      const existing = byBaseCode.get(baseCode);
      const isSpecific = row.course_code.includes(':');
      if (!existing || (isSpecific && !existing.specific)) {
        byBaseCode.set(baseCode, { row, meta, specific: isSpecific });
      }
    }

    let rows = [...byBaseCode.values()].map(({ row, meta }) => ({
      course_code: meta.code,
      section: meta.section,
      name: meta.name,
      dept: meta.dept,
      school: meta.school,
      quarter: meta.quarter,
      day: meta.day,
      per: meta.per,
      room: meta.room,
      raw_text: row.raw_text,
      breakdown: row.breakdown,
      total_percent: row.total_percent,
      has_breakdown: row.has_breakdown,
      is_pass_fail: !!row.is_pass_fail,
      source_url: row.source_url,
    }));

    // raw_text 部分一致 (search を grading にも適用)
    if (search) {
      const lower = search.toLowerCase();
      rows = rows.filter(r =>
        (r.course_code || '').toLowerCase().includes(lower) ||
        (r.name || '').toLowerCase().includes(lower) ||
        (r.raw_text || '').toLowerCase().includes(lower)
      );
    }

    // カテゴリフィルタ
    if (category) {
      rows = rows.filter(r => {
        if (!r.breakdown) return false;
        const sumPct = r.breakdown
          .filter(b => b.category === category)
          .reduce((s, b) => s + (b.percent || 0), 0);
        return sumPct >= minPercent && sumPct <= maxPercent && sumPct > 0;
      });
    }

    // ソート: dept → quarter → code
    rows.sort((a, b) =>
      (a.dept || '').localeCompare(b.dept || '') ||
      (a.quarter || '').localeCompare(b.quarter || '') ||
      (a.course_code || '').localeCompare(b.course_code || '')
    );

    const total = rows.length;
    const start = page * PAGE_SIZE;
    const paged = rows.slice(start, start + PAGE_SIZE);

    return NextResponse.json({
      rows: paged,
      total,
      page,
      pageSize: PAGE_SIZE,
      hasMore: start + PAGE_SIZE < total,
    });
  } catch (err) {
    console.error('[grading-search] GET error:', err.message, err.stack);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
