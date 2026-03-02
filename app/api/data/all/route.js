import { NextResponse } from 'next/server';
import { getToken } from '../../../../lib/auth/token-manager.js';
import { fetchUserCourses } from '../../../../lib/api/courses.js';
import { fetchScheduleForCourses } from '../../../../lib/api/syllabus-scraper.js';
import { fetchAssignments, fetchSubmissionStatus } from '../../../../lib/api/assignments.js';
import { transformCourses, groupByQuarter } from '../../../../lib/transform/course-transform.js';
import { buildTimetable } from '../../../../lib/transform/timetable-builder.js';
import { transformAssignments, updateAssignmentStatus } from '../../../../lib/transform/assignment-transform.js';

export async function GET() {
  try {
    const { wstoken, userid, fullname } = await getToken();

    // Courses + schedule from syllabus
    const raw = await fetchUserCourses(wstoken, userid);
    let scheduleMap = {};
    try {
      scheduleMap = await fetchScheduleForCourses(raw);
    } catch (e) {
      console.error('[All] Syllabus scrape failed:', e.message);
    }
    const courses = transformCourses(raw, scheduleMap);

    // Timetable
    const byQ = groupByQuarter(courses);
    const qData = {};
    for (const [q, qCourses] of Object.entries(byQ)) {
      qData[q] = { C: qCourses, TT: buildTimetable(qCourses) };
    }

    // Assignments
    const courseIdMap = {};
    courses.forEach(c => { courseIdMap[c.moodleId] = c.id; });
    const moodleIds = courses.map(c => c.moodleId);
    const moodleAsgn = await fetchAssignments(wstoken, moodleIds);
    let assignments = transformAssignments(moodleAsgn, courseIdMap);

    assignments = await Promise.all(
      assignments.map(async asgn => {
        try {
          const status = await fetchSubmissionStatus(wstoken, asgn.moodleId);
          return updateAssignmentStatus(asgn, status);
        } catch (e) {
          console.error(`[All] Failed to fetch submission status for ${asgn.id} (moodle:${asgn.moodleId}):`, e.message);
          return asgn;
        }
      })
    );

    return NextResponse.json({ qData, courses, assignments, user: { userid, fullname } });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: err.message.includes('authenticated') ? 401 : 500 });
  }
}
