import { NextResponse } from 'next/server';
import { requireAuth } from '../../../../lib/auth/require-auth.js';
import { fetchUserCourses } from '../../../../lib/api/courses.js';
import { fetchAssignments, fetchSubmissionStatus } from '../../../../lib/api/assignments.js';
import { transformCourses } from '../../../../lib/transform/course-transform.js';
import { transformAssignments, updateAssignmentStatus } from '../../../../lib/transform/assignment-transform.js';

export async function GET(request) {
  try {
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;
    const { wstoken, userid } = auth;

    const raw = await fetchUserCourses(wstoken, userid);
    const courses = transformCourses(raw);

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
          console.error(`[Assignments] Failed to fetch submission status for ${asgn.id} (moodle:${asgn.moodleId}):`, e.message);
          return asgn;
        }
      })
    );

    return NextResponse.json({ assignments });
  } catch (err) {
    console.error('[Assignments] GET error:', err.message, err.stack);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
