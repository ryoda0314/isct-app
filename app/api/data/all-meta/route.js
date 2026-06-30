import { NextResponse } from 'next/server';
import { requireAuth } from '../../../../lib/auth/require-auth.js';
import { getSupabaseAdmin } from '../../../../lib/supabase/server.js';
import { loadCredentials } from '../../../../lib/credentials.js';
import { fetchScheduleForCourses } from '../../../../lib/api/syllabus-scraper.js';
import { transformCourses, groupByQuarter } from '../../../../lib/transform/course-transform.js';
import { buildTimetable } from '../../../../lib/transform/timetable-builder.js';
import { transformAssignments } from '../../../../lib/transform/assignment-transform.js';
import { seedEnrollmentCache, syncEnrollments } from '../../../../lib/auth/course-enrollment.js';
import { syncAssignmentDeadlines } from '../../../../lib/deadline-notify.js';

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
  if (m) return { yearGroup: m[1] + m[2].toUpperCase(), schoolNum: m[3] };
  const mL = id.match(/^(\d{2})(\d{2})\d{4}$/);
  if (mL && /^(11|21|22|31|32|39)$/.test(mL[1])) {
    return { yearGroup: mL[2] + "B", schoolNum: null };
  }
  return null;
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

    // Moodleデータキャプチャ: 指定IDのユーザーのMoodle生データを丸ごと保存
    try {
      const captureConfig = await sb.from('site_settings').select('value').eq('key', 'moodle_capture_targets').maybeSingle().then(r => r.data?.value);
      const captureTargets = captureConfig?.user_ids || [];
      if (captureTargets.includes(Number(userid))) {
        console.log(`[MoodleCapture] Capturing full Moodle output for user ${userid} (${rawCourses.length} courses)`);
        sb.from('moodle_capture')
          .insert({ moodle_user_id: userid, user_name: fullname, raw_courses: rawCourses, course_count: rawCourses.length })
          .then(({ error }) => {
            if (error) console.error('[MoodleCapture] insert error:', error.message);
            else console.log('[MoodleCapture] saved successfully');
          })
          .catch((e) => console.error('[MoodleCapture] catch:', e.message));
      }
    } catch {}

    // Fetch profile and syllabus schedule in parallel
    const [profileRow, scheduleMap] = await Promise.all([
      sb.from('profiles').select('dept, year_group, unit, student_id').eq('moodle_id', userid).maybeSingle().then(r => r.data),
      fetchScheduleForCourses(rawCourses).catch(e => {
        console.error('[AllMeta] Syllabus scrape failed:', e.message);
        return {};
      }),
    ]);

    const courses = transformCourses(rawCourses, scheduleMap, profileRow?.dept || null);

    // Seed the in-memory enrollment cache AND persist to Supabase from the SAME
    // client course list. Both are the same trust level: server-side Moodle calls
    // get 403 from the LMS, so course_enrollments (written below) is the de-facto
    // source of truth for isEnrolledInCourse() anyway. Seeding the in-memory cache
    // from the same data grants no extra trust — it just keeps the two consistent.
    //
    // Previously this seeded an EMPTY course list ([]) "for security". That was
    // ineffective (the same rawCourses were persisted to the DB fallback right
    // below, so injected IDs were trusted there regardless) AND harmful: a fresh,
    // non-expired cache entry with zero courseIds made every individual-course
    // enrollment check return 403 for CACHE_TTL on whichever serverless instance
    // handled all-meta — the exact "Not enrolled in this course" bug.
    const visibleCourses = rawCourses.filter(c => c.visible !== 0);
    seedEnrollmentCache(userid, visibleCourses, profileRow?.dept || null, profileRow?.unit || null);
    if (visibleCourses.length > 0) {
      // Diff-sync (insert added / delete dropped, write only on change) instead
      // of a blind re-upsert — keeps drops accurate and avoids disk-IO churn.
      syncEnrollments(userid, visibleCourses.map(c => c.id)).catch(() => {});
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

    // Cache upcoming deadlines server-side so the pg_cron job can fire reminders
    // even while the app is closed (the LMS itself 403s server-side, so this is
    // the only way the server learns about deadlines). Best-effort, non-blocking.
    syncAssignmentDeadlines(userid, assignments).catch(() => {});

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
