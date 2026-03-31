import { NextResponse } from 'next/server';
import { requireAuth } from '../../../../lib/auth/require-auth.js';
import { loadCredentials } from '../../../../lib/credentials.js';
import { lookupScheduleFromDB } from '../../../../lib/api/syllabus-bulk.js';
import { transformCourses, groupByQuarter } from '../../../../lib/transform/course-transform.js';
import { buildTimetable } from '../../../../lib/transform/timetable-builder.js';

const T2_API = 'https://t2schola.titech.ac.jp/webservice/rest/server.php';
const T2_TOKEN_URL = 'https://t2schola.titech.ac.jp/login/token.php';

/**
 * Acquire T2SCHOLA wstoken using stored ISCT credentials.
 * Returns { token } or throws.
 */
async function acquireT2Token(loginId) {
  const creds = await loadCredentials(loginId);
  if (!creds?.password) throw new Error('No stored password for T2SCHOLA token acquisition');

  const resp = await fetch(T2_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `username=${encodeURIComponent(loginId)}&password=${encodeURIComponent(creds.password)}&service=moodle_mobile_app`,
  });
  const data = await resp.json();
  if (data.token) return data.token;
  throw new Error(data.error || data.errorcode || 'T2SCHOLA token acquisition failed');
}

/**
 * GET /api/data/timetable-past?year=2024
 * GET /api/data/timetable-past?t2token=xxx&year=2024  (explicit token)
 *
 * Fetches past timetable from T2SCHOLA, enriches with syllabus DB data.
 * If t2token is omitted, automatically acquires one using stored credentials.
 */
export async function GET(request) {
  try {
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;

    const { searchParams } = new URL(request.url);
    let t2token = searchParams.get('t2token');
    const year = searchParams.get('year') || '2024';

    // Auto-acquire T2SCHOLA token if not provided
    if (!t2token) {
      try {
        t2token = await acquireT2Token(auth.loginId);
      } catch (e) {
        console.error('[TimetablePast] Auto token acquisition failed:', e.message);
        return NextResponse.json({ error: 'T2SCHOLAトークンの自動取得に失敗しました。パスワードが変更されている可能性があります。', needsToken: true }, { status: 401 });
      }
    }

    // 1. Get site info to obtain T2SCHOLA userid
    const siteUrl = new URL(T2_API);
    siteUrl.searchParams.set('wstoken', t2token);
    siteUrl.searchParams.set('wsfunction', 'core_webservice_get_site_info');
    siteUrl.searchParams.set('moodlewsrestformat', 'json');
    const siteResp = await fetch(siteUrl.toString());
    const siteInfo = await siteResp.json();
    if (siteInfo.exception) {
      return NextResponse.json({ error: `T2SCHOLA auth failed: ${siteInfo.message}` }, { status: 401 });
    }

    // 2. Fetch enrolled courses from T2SCHOLA
    const coursesUrl = new URL(T2_API);
    coursesUrl.searchParams.set('wstoken', t2token);
    coursesUrl.searchParams.set('wsfunction', 'core_enrol_get_users_courses');
    coursesUrl.searchParams.set('moodlewsrestformat', 'json');
    coursesUrl.searchParams.set('userid', siteInfo.userid);
    const coursesResp = await fetch(coursesUrl.toString());
    const rawCourses = await coursesResp.json();

    if (!Array.isArray(rawCourses)) {
      return NextResponse.json({ error: 'Failed to fetch T2SCHOLA courses' }, { status: 502 });
    }

    // 3. Extract course codes and look up schedules from syllabus DB
    const codes = [];
    for (const mc of rawCourses) {
      const m = mc.shortname.match(/([A-Z]{2,4}\.[A-Z]\d{3})/);
      if (m) codes.push(m[1]);
    }
    const uniqueCodes = [...new Set(codes)];

    let dbRows = [];
    if (uniqueCodes.length > 0) {
      try {
        dbRows = await lookupScheduleFromDB(uniqueCodes, year);
      } catch (e) {
        console.error('[TimetablePast] DB lookup failed:', e.message);
      }
    }

    // Build schedule map from DB rows
    const scheduleMap = {};
    for (const row of dbRows) {
      const schedule = {
        per: row.per, day: row.day,
        periodStart: row.period_start, periodEnd: row.period_end,
        room: row.room, quarter: row.quarter,
        building: row.building || null,
        dept: row.dept || null,
      };
      if (row.section) scheduleMap[`${row.code}:${row.section}`] = schedule;
      if (!scheduleMap[row.code]) scheduleMap[row.code] = schedule;
    }

    // 4. Transform courses and build timetable
    // T2SCHOLA category IDs map to quarters — inject as hint
    // Determine category→quarter mapping from data (categories are ordered by quarter)
    const categories = [...new Set(rawCourses.map(c => c.category))].sort((a, b) => a - b);
    const catToQuarter = {};
    categories.forEach((cat, i) => { catToQuarter[cat] = i + 1; });

    // Adapt T2SCHOLA courses to look like ISCT Moodle courses for transformCourses()
    const adapted = rawCourses
      .filter(mc => mc.visible !== 0)
      .map(mc => ({
        ...mc,
        // Inject quarter hint into shortname for detectQuarter()
        _t2quarter: catToQuarter[mc.category] || null,
      }));

    const courses = transformCourses(adapted, scheduleMap);

    // Override quarter from T2SCHOLA category when syllabus DB didn't provide one
    for (const course of courses) {
      const orig = adapted.find(a => a.id === course.moodleId);
      if (orig?._t2quarter && !scheduleMap[course.code]?.quarter) {
        course.quarter = orig._t2quarter;
      }
    }

    const byQ = groupByQuarter(courses);
    const qData = {};
    for (const [q, qCourses] of Object.entries(byQ)) {
      qData[q] = { C: qCourses, TT: buildTimetable(qCourses) };
    }

    return NextResponse.json({
      qData,
      allCourses: courses,
      year,
      t2user: { userid: siteInfo.userid, fullname: siteInfo.fullname },
      stats: {
        total: rawCourses.length,
        withSchedule: courses.filter(c => c.per).length,
        dbRows: dbRows.length,
      },
    });
  } catch (err) {
    console.error('[TimetablePast] GET error:', err.message, err.stack);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
