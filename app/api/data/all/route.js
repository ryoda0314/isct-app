import { NextResponse } from 'next/server';
import { requireAuth } from '../../../../lib/auth/require-auth.js';
import { getSupabaseAdmin } from '../../../../lib/supabase/server.js';
import { fetchUserCourses } from '../../../../lib/api/courses.js';
import { fetchScheduleForCourses } from '../../../../lib/api/syllabus-scraper.js';
import { fetchAssignments, fetchSubmissionStatus } from '../../../../lib/api/assignments.js';
import { transformCourses, groupByQuarter } from '../../../../lib/transform/course-transform.js';
import { buildTimetable } from '../../../../lib/transform/timetable-builder.js';
import { transformAssignments, updateAssignmentStatus } from '../../../../lib/transform/assignment-transform.js';

const ENV_ADMIN_IDS = (process.env.ADMIN_IDS || '').split(',').map(s => s.trim()).filter(Boolean);

async function checkAdmin(userid) {
  if (ENV_ADMIN_IDS.includes(String(userid))) return true;
  try {
    const sb = getSupabaseAdmin();
    const { data } = await sb.from('admin_users').select('moodle_user_id').eq('moodle_user_id', userid).maybeSingle();
    return !!data;
  } catch { return false; }
}

export async function GET(request) {
  try {
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;
    const { wstoken, userid, fullname } = auth;

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

    // Fetch submission status with concurrency limit to avoid overwhelming Moodle
    const CONCURRENCY = 3;
    let statusFailed = 0;
    for (let i = 0; i < assignments.length; i += CONCURRENCY) {
      const batch = assignments.slice(i, i + CONCURRENCY);
      const results = await Promise.all(
        batch.map(async asgn => {
          try {
            const status = await fetchSubmissionStatus(wstoken, asgn.moodleId);
            console.log(`[All] Submission status for ${asgn.id}: submission=${JSON.stringify(status?.lastattempt?.submission?.status ?? 'N/A')}`);
            return updateAssignmentStatus(asgn, status);
          } catch (e) {
            statusFailed++;
            console.error(`[All] Failed to fetch submission status for ${asgn.id} (moodle:${asgn.moodleId}):`, e.message);
            return asgn;
          }
        })
      );
      assignments.splice(i, CONCURRENCY, ...results);
    }
    if (statusFailed > 0) {
      console.warn(`[All] ${statusFailed}/${assignments.length} submission status fetches failed`);
    }

    const isAdmin = await checkAdmin(userid);
    return NextResponse.json({ qData, courses, assignments, user: { userid, fullname, isAdmin } });
  } catch (err) {
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
