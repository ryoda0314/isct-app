import { NextResponse } from 'next/server';
import { getToken } from '../../../../lib/auth/token-manager.js';
import { fetchUserCourses } from '../../../../lib/api/courses.js';
import { fetchScheduleForCourses } from '../../../../lib/api/syllabus-scraper.js';
import { transformCourses, groupByQuarter } from '../../../../lib/transform/course-transform.js';
import { buildTimetable } from '../../../../lib/transform/timetable-builder.js';

export async function GET() {
  try {
    const { wstoken, userid } = await getToken();
    const raw = await fetchUserCourses(wstoken, userid);

    // Fetch schedule data from ISCT syllabus site (cached for 7 days)
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
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
