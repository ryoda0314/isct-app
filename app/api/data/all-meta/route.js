import { NextResponse } from 'next/server';
import { requireAuth } from '../../../../lib/auth/require-auth.js';
import { getSupabaseAdmin } from '../../../../lib/supabase/server.js';
import { loadCredentials } from '../../../../lib/credentials.js';
import { fetchScheduleForCourses } from '../../../../lib/api/syllabus-scraper.js';
import { transformCourses, groupByQuarter } from '../../../../lib/transform/course-transform.js';
import { buildTimetable } from '../../../../lib/transform/timetable-builder.js';
import { transformAssignments } from '../../../../lib/transform/assignment-transform.js';
import { seedEnrollmentCache } from '../../../../lib/auth/course-enrollment.js';

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

/**
 * Client-side Moodle API flow:
 * 1. Client calls GET /api/auth/token → gets wstoken + userid
 * 2. Client calls Moodle API directly → gets raw courses + assignments
 * 3. Client calls POST /api/data/all-meta with raw Moodle data
 * 4. Server does: syllabus lookup, transforms, Supabase ops, returns final data
 */
export async function POST(request) {
  try {
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;
    const { userid, fullname } = auth;

    const { rawCourses, rawAssignments } = await request.json();
    if (!Array.isArray(rawCourses)) {
      return NextResponse.json({ error: 'rawCourses required' }, { status: 400 });
    }

    const sb = getSupabaseAdmin();

    // Fetch profile and syllabus schedule in parallel
    const [profileRow, scheduleMap] = await Promise.all([
      sb.from('profiles').select('dept, year_group, unit, student_id').eq('moodle_id', userid).maybeSingle().then(r => r.data),
      fetchScheduleForCourses(rawCourses).catch(e => {
        console.error('[AllMeta] Syllabus scrape failed:', e.message);
        return {};
      }),
    ]);

    const courses = transformCourses(rawCourses, scheduleMap, profileRow?.dept || null);

    // Seed enrollment cache so server-side enrollment checks don't need to call Moodle API
    seedEnrollmentCache(userid, rawCourses.filter(c => c.visible !== 0), profileRow?.dept || null, profileRow?.unit || null);

    // Save course enrollments to Supabase (fire-and-forget)
    if (rawCourses.length > 0) {
      const enrollments = rawCourses
        .filter(c => c.visible !== 0)
        .map(c => ({ moodle_user_id: userid, course_moodle_id: c.id, updated_at: new Date().toISOString() }));
      sb.from('course_enrollments')
        .upsert(enrollments, { onConflict: 'moodle_user_id,course_moodle_id' })
        .then(({ error }) => { if (error) console.error('[AllMeta] enrollment upsert error:', error.message); })
        .catch(() => {});
    }

    // Timetable
    const byQ = groupByQuarter(courses);
    const qData = {};
    for (const [q, qCourses] of Object.entries(byQ)) {
      qData[q] = { C: qCourses, TT: buildTimetable(qCourses) };
    }

    // Assignments
    const courseIdMap = {};
    courses.forEach(c => { courseIdMap[c.moodleId] = c.id; });
    const assignments = rawAssignments
      ? transformAssignments(rawAssignments, courseIdMap)
      : [];

    const isAdmin = await checkAdmin(userid);

    // Resolve student ID / year group
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

    return NextResponse.json({
      qData, courses, assignments,
      user: { userid, fullname, isAdmin, dept: profileRow?.dept || null, yearGroup, unit: profileRow?.unit || null, studentId },
    });
  } catch (err) {
    console.error('[AllMeta] error:', err.message, err.stack);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
