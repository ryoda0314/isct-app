/**
 * Strip HTML tags from Moodle intro text.
 */
function stripHtml(html) {
  return html?.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim() || '';
}

/**
 * Determine priority from due date.
 */
function determinePriority(duedate) {
  const now = Date.now() / 1000;
  const daysLeft = (duedate - now) / 86400;
  if (daysLeft < 0) return 'high';
  if (daysLeft <= 3) return 'high';
  if (daysLeft <= 7) return 'medium';
  return 'low';
}

/**
 * Guess assignment type from title and description keywords.
 */
function determineType(name, intro) {
  const text = `${name} ${intro}`.toLowerCase();
  if (text.includes('レポート') || text.includes('report')) return 'report';
  if (text.includes('コード') || text.includes('実装') || text.includes('プログラ')) return 'coding';
  if (text.includes('演習') || text.includes('exercise') || text.includes('問題')) return 'problem_set';
  if (text.includes('プロジェクト') || text.includes('project')) return 'project';
  if (text.includes('テスト') || text.includes('quiz') || text.includes('小テスト')) return 'quiz';
  return 'report';
}

/**
 * Transform Moodle assignments to campus-sns format.
 *
 * @param {Object} moodleResponse - Response from mod_assign_get_assignments
 * @param {Object} courseIdMap - { moodleCourseId: campusSnsId }
 */
export function transformAssignments(moodleResponse, courseIdMap) {
  const assignments = [];

  for (const course of (moodleResponse.courses || [])) {
    const campusCourseId = courseIdMap[course.id];
    if (!campusCourseId) continue;

    for (const asgn of (course.assignments || [])) {
      if (!asgn.duedate || asgn.duedate === 0) continue;

      assignments.push({
        id: `ma_${asgn.id}`,
        moodleId: asgn.id,
        cid: campusCourseId,
        title: asgn.name,
        desc: stripHtml(asgn.intro),
        due: new Date(asgn.duedate * 1000),
        pri: determinePriority(asgn.duedate),
        st: 'not_started',
        type: determineType(asgn.name, asgn.intro),
        pts: asgn.grade || 0,
        subs: [],
        cmt: []
      });
    }
  }

  // Sort by due date ascending
  assignments.sort((a, b) => a.due - b.due);
  return assignments;
}

/**
 * Update assignment status based on Moodle submission status.
 */
export function updateAssignmentStatus(assignment, submissionStatus) {
  if (!submissionStatus?.lastattempt?.submission) return assignment;

  const sub = submissionStatus.lastattempt.submission;
  let st = 'not_started';

  if (sub.status === 'submitted') {
    st = 'completed';
  } else if (sub.status === 'draft') {
    st = 'in_progress';
  } else if (sub.status === 'new' && sub.timemodified > 0) {
    st = 'in_progress';
  }

  return {
    ...assignment,
    st,
    sub: st === 'completed' ? new Date(sub.timemodified * 1000) : undefined
  };
}
