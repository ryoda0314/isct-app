import { NextResponse } from 'next/server';
import puppeteer from 'puppeteer-core';
import { requireAuth } from '../../../../lib/auth/require-auth.js';
import { loadCredentials } from '../../../../lib/credentials.js';
import { lookupScheduleFromDB } from '../../../../lib/api/syllabus-bulk.js';
import { transformCourses, groupByQuarter } from '../../../../lib/transform/course-transform.js';
import { buildTimetable } from '../../../../lib/transform/timetable-builder.js';

const T2_BASE = 'https://t2schola.titech.ac.jp';
const T2_API = `${T2_BASE}/webservice/rest/server.php`;
const MOODLE_SERVICE = 'moodle_mobile_app';

// In-memory cache: loginId -> { wstoken, expiry }
const t2TokenCache = new Map();
const T2_TOKEN_TTL = 2 * 60 * 60 * 1000; // 2 hours

async function getBrowser() {
  if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME) {
    const chromium = (await import('@sparticuz/chromium')).default;
    chromium.setHeadlessMode = true;
    chromium.setGraphicsMode = false;
    return puppeteer.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath: await chromium.executablePath(),
      headless: chromium.headless,
    });
  }
  const { executablePath } = await import('puppeteer');
  return puppeteer.launch({
    headless: 'new',
    executablePath: executablePath(),
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });
}

/**
 * Acquire T2SCHOLA wstoken via old TiTech portal (usr_name + password + matrix auth).
 * Same auth flow as grades — T2SCHOLA redirects to portal.nap.gsic.titech.ac.jp.
 */
async function acquireT2Token(loginId) {
  const cached = t2TokenCache.get(loginId);
  if (cached && Date.now() < cached.expiry) {
    console.log('[T2Token] Using cached token');
    return cached.wstoken;
  }

  console.log('[T2Token] Loading credentials for', loginId);
  const creds = await loadCredentials(loginId);
  if (!creds?.portalUserId || !creds?.portalPassword || !creds?.matrix) {
    throw new Error('Portal credentials (portalUserId/portalPassword/matrix) not configured');
  }

  let browser;
  try {
    browser = await getBrowser();
    const page = await browser.newPage();
    page.setDefaultNavigationTimeout(30_000);
    page.setDefaultTimeout(15_000);
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );

    // Step 1: Go directly to portal login with userpass_key template, targeting T2SCHOLA
    // T2SCHOLA's own redirect goes to /portal.pl (certificate auth) which lacks usr_name form.
    // Instead, use /GetAccess/Login with Template=userpass_key (same as grades) but with T2SCHOLA resource.
    const portalLoginUrl = 'https://portal.nap.gsic.titech.ac.jp/GetAccess/Login'
      + '?Template=userpass_key&AUTHMETHOD=UserPassword'
      + '&GAREASONCODE=-1'
      + '&GARESOURCEID=T2SCHOLA2023_S001_80'
      + '&GAURI=' + encodeURIComponent(`${T2_BASE}/auth/eltitech/autologin.php`)
      + '&Reason=-1'
      + '&APPID=T2SCHOLA2023_S001_80'
      + '&URI=' + encodeURIComponent(`${T2_BASE}/auth/eltitech/autologin.php`);
    console.log('[T2Token] Navigating to portal login (userpass_key)...');
    await page.goto(portalLoginUrl, { waitUntil: 'networkidle2' });
    console.log('[T2Token] Landed on:', page.url());

    // Step 2: Portal login — usr_name + usr_password
    await page.waitForSelector('input[name="usr_name"]', { visible: true });
    await page.type('input[name="usr_name"]', creds.portalUserId, { delay: 20 });
    await page.type('input[name="usr_password"]', creds.portalPassword, { delay: 20 });
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle2' }),
      page.click('input[name="OK"]'),
    ]);
    console.log('[T2Token] After login submit:', page.url());

    // Step 3: Matrix authentication
    await page.waitForSelector('input[name="message3"]', { visible: true });
    const matrixLabels = await page.evaluate(() => {
      const labels = [];
      for (const cell of document.querySelectorAll('td, th')) {
        const t = cell.textContent?.trim();
        if (t && /^\[[A-J],\s*\d\]$/i.test(t)) labels.push(t);
      }
      return labels;
    });
    console.log('[T2Token] Matrix positions:', matrixLabels);

    if (matrixLabels.length < 3) {
      throw new Error(`Expected 3 matrix labels, found ${matrixLabels.length}`);
    }

    const inputNames = ['message3', 'message4', 'message5'];
    for (let i = 0; i < 3; i++) {
      const match = matrixLabels[i].match(/\[([A-J]),\s*(\d)\]/i);
      const val = creds.matrix[match[1].toUpperCase()]?.[match[2]] || '';
      await page.type(`input[name="${inputNames[i]}"]`, val, { delay: 20 });
    }

    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle2' }),
      page.click('input[name="OK"]'),
    ]);
    console.log('[T2Token] After matrix submit:', page.url());

    // Step 4: Wait for redirect back to T2SCHOLA
    let attempts = 0;
    while (!page.url().includes('t2schola.titech.ac.jp') && attempts < 5) {
      console.log(`[T2Token] Waiting for T2SCHOLA redirect... attempt ${attempts + 1}, url=${page.url()}`);
      await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 10_000 }).catch(() => {});
      attempts++;
    }

    if (!page.url().includes('t2schola.titech.ac.jp')) {
      throw new Error(`Portal login did not redirect to T2SCHOLA. Final URL: ${page.url()}`);
    }
    console.log('[T2Token] Reached T2SCHOLA:', page.url());

    // Step 5: Get wstoken via Moodle mobile launch
    const passport = Date.now().toString();
    const launchUrl = `${T2_BASE}/admin/tool/mobile/launch.php?service=${MOODLE_SERVICE}&passport=${passport}`;

    let tokenUrl = null;
    page.on('request', req => {
      const url = req.url();
      if (url.includes('token=') || url.includes('moodlemobile://')) tokenUrl = url;
    });

    try {
      await page.goto(launchUrl, { waitUntil: 'networkidle2' });
    } catch (e) {
      console.log('[T2Token] Mobile launch navigation:', e.message);
    }

    if (!tokenUrl) tokenUrl = page.url();

    let wstoken = null;

    // Decode moodlemobile://token=<base64> → <siteid>:::<wstoken>:::<privatetoken>
    const b64Match = tokenUrl?.match(/token=([A-Za-z0-9+/=]+)/);
    if (b64Match) {
      try {
        const decoded = Buffer.from(b64Match[1], 'base64').toString('utf-8');
        const parts = decoded.split(':::');
        if (parts[1] && /^[a-f0-9]{32}$/.test(parts[1])) wstoken = parts[1];
      } catch {}
    }

    // Fallback: page content
    if (!wstoken) {
      const content = await page.content();
      const m = content.match(/token['":\s]+([a-f0-9]{32})/);
      if (m) wstoken = m[1];
    }

    // Fallback: login/token.php POST (within authenticated session)
    if (!wstoken) {
      console.log('[T2Token] Trying token.php fallback...');
      const tokenResp = await page.evaluate(
        async (url, user, pass, svc) => {
          const r = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: `username=${encodeURIComponent(user)}&password=${encodeURIComponent(pass)}&service=${encodeURIComponent(svc)}`,
          });
          return r.text();
        },
        `${T2_BASE}/login/token.php`, creds.portalUserId, creds.portalPassword, MOODLE_SERVICE
      );
      try {
        const d = JSON.parse(tokenResp);
        if (d.token) wstoken = d.token;
      } catch {}
    }

    await browser.close();
    browser = null;

    if (!wstoken) throw new Error('Failed to obtain T2SCHOLA wstoken');

    console.log('[T2Token] Token acquired:', wstoken.slice(0, 6) + '...');
    t2TokenCache.set(loginId, { wstoken, expiry: Date.now() + T2_TOKEN_TTL });
    return wstoken;

  } catch (error) {
    console.error('[T2Token] Login failed:', error.message, error.stack);
    throw new Error(`T2SCHOLA portal login failed: ${error.message}`);
  } finally {
    if (browser) await browser.close();
  }
}

/**
 * GET /api/data/timetable-past?year=2024
 * GET /api/data/timetable-past?t2token=xxx&year=2024  (explicit token)
 *
 * Fetches past timetable from T2SCHOLA, enriches with syllabus DB data.
 * If t2token is omitted, automatically acquires one via SSO using stored credentials.
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
        console.error('[TimetablePast] Auto token acquisition failed:', e.message, e.stack);
        return NextResponse.json({ error: `T2SCHOLA SSO失敗: ${e.message}`, needsToken: true }, { status: 401 });
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
      // Token expired — clear cache and report
      t2TokenCache.delete(auth.loginId);
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

    // Build schedule map from DB rows — store ARRAYS (courses can have multiple slots)
    const scheduleMap = {};
    for (const row of dbRows) {
      const schedule = {
        per: row.per, day: row.day,
        periodStart: row.period_start, periodEnd: row.period_end,
        room: row.room, quarter: row.quarter,
        building: row.building || null,
        dept: row.dept || null,
      };
      if (row.section) {
        const key = `${row.code}:${row.section}`;
        if (!scheduleMap[key]) scheduleMap[key] = [];
        scheduleMap[key].push(schedule);
      }
      if (!scheduleMap[row.code]) scheduleMap[row.code] = [];
      scheduleMap[row.code].push(schedule);
    }

    // Log Moodle courses that had no code match or no syllabus schedule
    const noCodeCourses = rawCourses.filter(mc => !mc.shortname.match(/([A-Z]{2,4}\.[A-Z]\d{3})/));
    const noScheduleCodes = uniqueCodes.filter(code => !scheduleMap[code]);
    if (noCodeCourses.length > 0) {
      console.log(`[TimetablePast] コード抽出不可 (${noCodeCourses.length}件):`);
      for (const mc of noCodeCourses) {
        console.log(`  - id=${mc.id} shortname="${mc.shortname}" fullname="${mc.fullname}"`);
      }
    }
    if (noScheduleCodes.length > 0) {
      console.log(`[TimetablePast] シラバスDB未マッチ (${noScheduleCodes.length}/${uniqueCodes.length}件):`);
      for (const code of noScheduleCodes) {
        const mc = rawCourses.find(c => c.shortname.includes(code));
        console.log(`  - ${code}  "${mc?.fullname || '?'}"`);
      }
    }
    console.log(`[TimetablePast] Moodle全${rawCourses.length}件, コード抽出=${uniqueCodes.length}件, DB hit=${dbRows.length}件, スケジュール有=${Object.keys(scheduleMap).length}件`);

    // 4. Transform courses and build timetable
    const categories = [...new Set(rawCourses.map(c => c.category))].sort((a, b) => a - b);
    const catToQuarter = {};
    categories.forEach((cat, i) => { catToQuarter[cat] = i + 1; });

    const adapted = rawCourses
      .filter(mc => mc.visible !== 0)
      .map(mc => ({
        ...mc,
        _t2quarter: catToQuarter[mc.category] || null,
      }));

    const courses = transformCourses(adapted, scheduleMap);

    // Override quarter from T2SCHOLA category when syllabus DB didn't provide one
    for (const course of courses) {
      const orig = adapted.find(a => a.id === course.moodleId);
      if (orig?._t2quarter && !scheduleMap[course.code]?.[0]?.quarter) {
        course.quarter = orig._t2quarter;
      }
    }

    // Log courses that ended up without schedule (per) info
    const noPerCourses = courses.filter(c => !c.per);
    if (noPerCourses.length > 0) {
      console.log(`[TimetablePast] 時間割配置なし (${noPerCourses.length}件):`);
      for (const c of noPerCourses) {
        console.log(`  - ${c.code} "${c.name}" quarter=${c.quarter||'?'}`);
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
        noCode: noCodeCourses.map(mc => ({ id: mc.id, shortname: mc.shortname, fullname: mc.fullname })),
        noSchedule: noScheduleCodes.map(code => {
          const mc = rawCourses.find(c => c.shortname.includes(code));
          return { code, fullname: mc?.fullname || '?' };
        }),
        noPer: noPerCourses.map(c => ({ code: c.code, name: c.name, quarter: c.quarter })),
      },
    });
  } catch (err) {
    console.error('[TimetablePast] GET error:', err.message, err.stack);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
