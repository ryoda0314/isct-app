import { NextResponse } from 'next/server';
import { requireAuth } from '../../../../lib/auth/require-auth.js';
import { lookupMedSessionsFromDB } from '../../../../lib/api/syllabus-med.js';

/**
 * Fetch medical/dental session schedules from DB (pre-scraped by admin).
 *
 * POST body: { courses: [{ code, lctCd, name }] }
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
    const lctCds = toFetch.map(c => c.lctCd);
    const codeByLctCd = {};
    for (const c of toFetch) codeByLctCd[c.lctCd] = c.code;
    console.log(`[MedSchedule] user=${auth.userid} coursesIn=${courses.length} lctCds=${lctCds.length} sample=${lctCds.slice(0,5).join(',')}`);

    // Read from DB
    const dbRows = await lookupMedSessionsFromDB(lctCds, '2026');
    console.log(`[MedSchedule] dbRows=${dbRows.length} year=2026`);
    if (dbRows.length === 0 && lctCds.length > 0) {
      console.warn(`[MedSchedule] DB empty for year=2026 lctCds=${lctCds.slice(0,10).join(',')} — scrape_med_syllabus may not have been run for 2026 yet`);
    }

    const allSessions = [];
    const courseMeta = {};

    for (const row of dbRows) {
      const code = codeByLctCd[row.lct_cd] || row.lct_cd;

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
