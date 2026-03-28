import { NextResponse } from 'next/server';
import { requireAuth } from '../../../../lib/auth/require-auth.js';
import { fetchUserCourses } from '../../../../lib/api/courses.js';
import { fetchScheduleForCourses } from '../../../../lib/api/syllabus-scraper.js';
import { transformCourses, groupByQuarter } from '../../../../lib/transform/course-transform.js';
import { buildTimetable } from '../../../../lib/transform/timetable-builder.js';

export async function GET(request) {
  try {
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;
    const { wstoken, userid } = auth;

    const raw = await fetchUserCourses(wstoken, userid);

    let scheduleMap = {};
    try {
      scheduleMap = await fetchScheduleForCourses(raw);
    } catch (e) {
      console.error('[Timetable] Syllabus scrape failed:', e.message);
    }

    const courses = transformCourses(raw, scheduleMap);
    const byQ = groupByQuarter(courses);

    const qData = {};
    for (const [q, qCourses] of Object.entries(byQ)) {
      qData[q] = { C: qCourses, TT: buildTimetable(qCourses) };
    }

    return NextResponse.json({ qData, allCourses: courses });
  } catch (err) {
    console.error('[Timetable] GET error:', err.message, err.stack);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
