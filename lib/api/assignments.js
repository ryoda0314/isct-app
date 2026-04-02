import { callMoodleAPI } from './moodle-client.js';

/**
 * Fetch assignments for given course IDs.
 * Returns: { courses: [{id, fullname, assignments: [{id, cmid, name, duedate, intro, grade, ...}]}] }
 */
export async function fetchAssignments(wstoken, courseIds) {
  return callMoodleAPI(wstoken, 'mod_assign_get_assignments', {
    courseids: courseIds
  });
}

/**
 * Fetch submission status for a specific assignment (current user).
 * Returns: { lastattempt: { submission: { status, timemodified }, grading: {...} } }
 */
export async function fetchSubmissionStatus(wstoken, assignmentId) {
  return callMoodleAPI(wstoken, 'mod_assign_get_submission_status', {
    assignid: assignmentId
  });
}