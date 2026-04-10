import { NextResponse } from 'next/server';
import { requireAuth } from '../../../../lib/auth/require-auth.js';
import { getSupabaseAdmin } from '../../../../lib/supabase/server.js';
import { loadCredentials } from '../../../../lib/credentials.js';
import { fetchUserCourses } from '../../../../lib/api/courses.js';
import { fetchScheduleForCourses } from '../../../../lib/api/syllabus-scraper.js';
import { fetchAssignments } from '../../../../lib/api/assignments.js';
import { transformCourses, groupByQuarter } from '../../../../lib/transform/course-transform.js';
import { buildTimetable } from '../../../../lib/transform/timetable-builder.js';
import { transformAssignments } from '../../../../lib/transform/assignment-transform.js';

const ENV_ADMIN_IDS = (process.env.ADMIN_IDS || '').split(',').map(s => s.trim()).filter(Boolean);

async function checkAdmin(userid) {
  if (ENV_ADMIN_IDS.includes(String(userid))) return true;
  try {
    const sb = getSupabaseAdmin();
    const { data } = await sb.from('admin_users').select('moodle_user_id').eq('moodle_user_id', userid).maybeSingle();
    return !!data;
  } catch { return false; }
}

function parseStudentId(id) {
  if (!id) return null;
  const m = id.match(/^(\d{2})([BMDR])(\d)/i);
  if (!m) return null;
  return { yearGroup: m[1] + m[2].toUpperCase(), schoolNum: m[3] };
}

async function resolveStudentId(loginId, profileStudentId) {
  if (profileStudentId && parseStudentId(profileStudentId)) return profileStudentId;
  if (parseStudentId(loginId)) return loginId;
  try {
    const creds = await loadCredentials(loginId);
    if (creds?.portalUserId && parseStudentId(creds.portalUserId)) return creds.portalUserId;
  } catch {}
  return null;
}

export async function GET(request) {
  try {
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;
    const { wstoken, userid, fullname } = auth;

    // Courses + schedule from syllabus
    const sb = getSupabaseAdmin();
    const [raw, profileRow, captureConfig] = await Promise.all([
      fetchUserCourses(wstoken, userid),
      sb.from('profiles').select('dept, year_group, unit, student_id').eq('moodle_id', userid).maybeSingle().then(r => r.data),
      sb.from('site_settings').select('value').eq('key', 'moodle_capture_targets').maybeSingle().then(r => r.data?.value),
    ]);

    // Moodleデータキャプチャ: 指定IDのユーザーのみ、生データをDBに保存
    const captureTargets = captureConfig?.user_ids || [];
    if (captureTargets.includes(Number(userid)) && raw && raw.length > 0) {
      sb.from('moodle_capture')
        .insert({ moodle_user_id: userid, user_name: fullname, raw_courses: raw, course_count: raw.length })
        .then(({ error }) => { if (error) console.error('[All] moodle capture error:', error.message); })
        .catch(() => {});
    }

    let scheduleMap = {};
    try {
      scheduleMap = await fetchScheduleForCourses(raw);
    } catch (e) {
      console.error('[All] Syllabus scrape failed:', e.message);
    }

    const courses = transformCourses(raw, scheduleMap, profileRow?.dept || null);

    // Save course enrollments to Supabase (fire-and-forget)
    if (raw && raw.length > 0) {
      const enrollments = raw
        .filter(c => c.visible !== 0)
        .map(c => ({ moodle_user_id: userid, course_moodle_id: c.id, updated_at: new Date().toISOString() }));
      sb.from('course_enrollments')
        .upsert(enrollments, { onConflict: 'moodle_user_id,course_moodle_id' })
        .then(({ error }) => { if (error) console.error('[All] enrollment upsert error:', error.message); })
        .catch(() => {});
    }

    // Timetable
    const byQ = groupByQuarter(courses);
    const qData = {};
    for (const [q, qCourses] of Object.entries(byQ)) {
      qData[q] = { C: qCourses, TT: buildTimetable(qCourses) };
    }

    // Assignments (retry once on failure)
    const courseIdMap = {};
    courses.forEach(c => { courseIdMap[c.moodleId] = c.id; });
    const moodleIds = courses.map(c => c.moodleId);
    let assignments = [];
    let assignmentError = false;
    for (let _attempt = 0; _attempt < 2; _attempt++) {
      try {
        const moodleAsgn = await fetchAssignments(wstoken, moodleIds);
        assignments = transformAssignments(moodleAsgn, courseIdMap);
        assignmentError = false;
        break;
      } catch (e) {
        assignmentError = true;
        console.error(`[All] Assignment fetch failed (attempt ${_attempt + 1}):`, e.message);
        if (_attempt === 0) await new Promise(r => setTimeout(r, 800));
      }
    }

    const isAdmin = await checkAdmin(userid);

    // 学籍番号 / year_group を解決
    let yearGroup = profileRow?.year_group || null;
    let studentId = profileRow?.student_id || null;
    if (!studentId || !yearGroup) {
      const sid = await resolveStudentId(auth.loginId, studentId);
      if (sid) {
        studentId = sid;
        const parsed = parseStudentId(sid);
        if (!yearGroup && parsed) yearGroup = parsed.yearGroup;
        const updates = {};
        if (!profileRow?.student_id && studentId) updates.student_id = studentId;
        if (!profileRow?.year_group && yearGroup) updates.year_group = yearGroup;
        if (Object.keys(updates).length > 0) {
          sb.from('profiles').update(updates).eq('moodle_id', userid);
        }
      }
    }

    const resp = { qData, courses, assignments, user: { userid, fullname, isAdmin, dept: profileRow?.dept || null, yearGroup, unit: profileRow?.unit || null, studentId } };
    if (assignmentError) resp.assignmentError = true;
    return NextResponse.json(resp);
  } catch (err) {
    console.error('[All] Unhandled error:', err.message, err.stack);
    if (err.code === 'MOODLE_HTML_RESPONSE' || err.code === 'MOODLE_INVALID_JSON') {
      return NextResponse.json({ error: 'LMS is currently unavailable', lmsDown: true }, { status: 503 });
    }
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
