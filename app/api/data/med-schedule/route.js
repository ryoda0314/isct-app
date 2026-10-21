import { NextResponse } from 'next/server';
import { requireAuth } from '../../../../lib/auth/require-auth.js';
import { lookupMedSessionsFromDB } from '../../../../lib/api/syllabus-med.js';

/**
 * Fetch medical/dental session schedules from DB (pre-scraped by admin).
 *
 * POST body: { courses: [{ code, lctCd, name, year? }] }
 *   year: 年度。LMS の短縮名 "011001[2026]" の [2026]。無ければ code から読み、それも無ければ今の年度。
 * Returns:   { sessions: [...], courseMeta: {...} }
 */
export async function POST(request) {
  try {
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;

    const { courses } = await request.json();
    if (!Array.isArray(courses) || courses.length === 0) {
      return NextResponse.json({ error: 'courses array required' }, { status: 400 });
    }

    const toFetch = courses.slice(0, 50).filter(c => c.lctCd);
    const jst = new Date(Date.now() + 9 * 3600000);
    const currentAY = String(jst.getUTCMonth() >= 3 ? jst.getUTCFullYear() : jst.getUTCFullYear() - 1);
    const yearOf = (c) => (/^\d{4}$/.test(String(c.year)) ? String(c.year) : String(c.code || '').match(/\[(\d{4})\]/)?.[1] || currentAY);
    const lctCdsByYear = {};
    const codeByYearLctCd = {};
    for (const c of toFetch) {
      const y = yearOf(c);
      (lctCdsByYear[y] ||= []).push(c.lctCd);
      codeByYearLctCd[`${y}|${c.lctCd}`] = c.code;
    }
    const years = Object.keys(lctCdsByYear).sort();
    console.log(`[MedSchedule] user=${auth.userid} coursesIn=${courses.length} lctCds=${toFetch.length} years=${years.join(',')} sample=${toFetch.slice(0,5).map(c => c.lctCd).join(',')}`);

    // Read from DB (one query per year; years ascending keeps the date+time order)
    const dbRows = (await Promise.all(years.map(y => lookupMedSessionsFromDB(lctCdsByYear[y], y)))).flat();
    console.log(`[MedSchedule] dbRows=${dbRows.length} years=${years.join(',')}`);
    if (dbRows.length === 0 && toFetch.length > 0) {
      console.warn(`[MedSchedule] DB empty for years=${years.join(',')} lctCds=${toFetch.slice(0,10).map(c => c.lctCd).join(',')} — scrape_med_syllabus may not have been run for that year yet`);
    }

    const allSessions = [];
    const courseMeta = {};

    for (const row of dbRows) {
      const code = codeByYearLctCd[`${row.year}|${row.lct_cd}`] || row.lct_cd;

      if (!courseMeta[code]) {
        courseMeta[code] = {
          name: row.name,
          instructor: row.instructor,
          credits: row.credits,
          semester: row.semester,
        };
      }

      if (row.date) {
        allSessions.push({
          date: row.date,
          day: row.day,
          timeStart: row.time_start,
          timeEnd: row.time_end,
          periodStr: row.period_str || null,
          periodEnd: row.period_end || null,
          code,
          name: row.name,
          room: row.room || null,
          instructor: row.session_instructor || row.instructor,
          sessionTitle: row.session_title || null,
          sessionContent: row.session_content || null,
        });
      }
    }

    // Already sorted by date+time from DB query
    return NextResponse.json({ sessions: allSessions, courseMeta });
  } catch (err) {
    console.error('[MedSchedule] error:', err.message);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
