import { NextResponse } from 'next/server';
import { getToken } from '../../../../lib/auth/token-manager.js';
import { fetchUserCourses } from '../../../../lib/api/courses.js';
import { fetchAssignments, fetchSubmissionStatus } from '../../../../lib/api/assignments.js';
import { transformCourses } from '../../../../lib/transform/course-transform.js';
import { transformAssignments, updateAssignmentStatus } from '../../../../lib/transform/assignment-transform.js';

export async function GET() {
  try {
    const { wstoken, userid } = await getToken();
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
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
