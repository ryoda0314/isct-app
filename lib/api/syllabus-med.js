/**
 * Medical/Dental syllabus scraper for ISCT (医歯学系).
 *
 * The medical/dental side uses a separate ASP.NET system at yushima2.tmd.ac.jp,
 * distinct from the engineering syllabus at syllabus.s.isct.ac.jp.
 *
 * Strategy:
 *   The SearchMain.aspx form requires ASP.NET ViewState which is difficult to
 *   replicate programmatically. Instead, we enumerate known course-code ranges
 *   and fetch data from LctSchedule.aspx which works with direct GET requests
 *   and returns both metadata (name, credits, instructor) and per-session
 *   schedule data via structured <tr> attributes.
 */

import { getSupabaseAdmin } from '../supabase/server.js';

const MED_BASE = 'https://yushima2.tmd.ac.jp/Portal/Public/Syllabus';

const FETCH_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'ja,en;q=0.5',
};

// ── Faculty mapping ──
// fac_cd values from SearchMain.aspx dropdowns
const MED_FACULTIES = {
  MED:  { fac_cd: '01', label: '医学部医学科',       school: '医学部' },
  DEN:  { fac_cd: '02', label: '歯学部歯学科',       school: '歯学部' },
  LIB:  { fac_cd: '00', label: '教養部',             school: '教養部' },
  GRAD: { fac_cd: 'grad', label: '大学院（全研究科）', school: '大学院' },
};

// ── Course code ranges per faculty (discovered by enumeration) ──
// Codes are 6-character strings. Most are decimal-only (e.g. "011002"),
// but dentistry includes hex digits (e.g. "021a00", "021c10").
//
// Observed patterns:
//   Medicine: decimal codes 011001–014099, step=1 within active ranges
//   Dentistry: decimal 021100–021999 (step 10) + hex 021a00–021f90 (step 0x10)
//   Liberal arts: very sparse 000001–000999

/**
 * Generate all candidate course codes for a faculty.
 * Returns an array of 6-character code strings.
 */
function generateCandidateCodes(facCd) {
  const codes = [];

  const addDecimalRange = (from, to, step = 1) => {
    for (let i = from; i <= to; i += step) {
      codes.push(String(i).padStart(6, '0'));
    }
  };

  const addHexRange = (hexFrom, hexTo, step = 0x10) => {
    const start = parseInt(hexFrom, 16);
    const end = parseInt(hexTo, 16);
    for (let i = start; i <= end; i += step) {
      codes.push(i.toString(16).padStart(6, '0'));
    }
  };

  switch (facCd) {
    case '01': // 医学部 — decimal codes, step=1
      addDecimalRange(11001, 11099);
      addDecimalRange(11100, 11199);
      addDecimalRange(11200, 11899);
      addDecimalRange(12001, 12299);
      addDecimalRange(13001, 13099);
      addDecimalRange(14001, 14099);
      break;

    case '02': // 歯学部 — decimal step=1 + hex range
      addDecimalRange(21100, 21999);
      // Hex portion: 021a00–021ff0 step=1
      addHexRange('021a00', '021ff0', 1);
      break;

    case '00': // 教養部 — sparse
      addDecimalRange(1, 999);
      break;

    case 'grad': // 大学院 — 041010–041520 (step=10) + 415002–415101 (step=1)
      addDecimalRange(41000, 41999, 10);
      addDecimalRange(415000, 415999);
      break;

    default:
      break;
  }

  return codes;
}

function stripHtml(html) {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ').trim();
}

// Progress tracking
const scrapeProgress = new Map();
export function getMedScrapeProgress(key) {
  return scrapeProgress.get(key) || null;
}

// ════════════════════════════════════════════════
// 1. Fetch + parse LctSchedule.aspx (primary data source)
// ════════════════════════════════════════════════

/**
 * Fetch course data from LctSchedule.aspx.
 * This single page provides both metadata and schedule in one request.
 *
 * Returns null if the course does not exist.
 * Returns { name, instructor, semester, credits, lctCd, sessions[] } on success.
 */
export async function fetchMedCourse(lctCd, year = '2026') {
  const url = `${MED_BASE}/LctSchedule.aspx?lct_year=${year}&lct_cd=${lctCd}`;
  const resp = await fetch(url, { headers: FETCH_HEADERS });
  if (!resp.ok) return null;
  const html = await resp.text();

  // ── Metadata from lbl* spans ──
  const lbl = (id) => {
    const m = html.match(new RegExp(`${id}[^>]*>([^<]*)`));
    return m ? m[1].trim() : null;
  };

  const name = lbl('lblSbjNm');
  if (!name) return null; // Course does not exist

  const instructor = lbl('lblStaffNm');
  const semester = lbl('lblTermNm');  // e.g. "前期", "2026年度前期"
  const creditsRaw = lbl('lblCredits');
  const credits = creditsRaw ? parseFloat(creditsRaw) : null;
  const dayPeriodShort = lbl('lblDayPeriodShort'); // e.g. "未定", "月1-2"

  // Check for empty schedule
  const noSchedule = html.includes('授業明細スケジュールはありません');

  // ── Parse column header order from <th> elements ──
  // Column structure varies per course (3 patterns observed):
  //   A: 回,日付,時刻,講義棟,担当教員,授業題目,授業内容,到達目標
  //   B: 回,日付,時刻,講義棟,担当教員,授業題目,到達目標  (授業内容なし)
  //   C: 回,日付,時刻,講義棟,授業内容                   (担当教員・授業題目なし)
  // Note: <thead> tag is absent in this HTML; <th> elements appear directly in <tr>.
  const colIndex = {};
  {
    const thMs = [...html.matchAll(/<th[^>]*>([\s\S]*?)<\/th>/gi)];
    thMs.forEach((m, i) => { colIndex[stripHtml(m[1]).trim()] = i; });
  }
  const titleColIdx   = colIndex['授業題目'] ?? -1;
  const contentColIdx = colIndex['授業内容'] ?? -1;
  const goalColIdx    = colIndex['到達目標・学習方法・その他'] ?? -1;

  // ── Sessions from <tr> attributes ──
  const sessions = [];
  if (!noSchedule) {
    const trPattern = /<tr\s+seq_no="([^"]*)"[^>]*lct_date_day="([^"]*)"[^>]*period_str="([^"]*)"[^>]*period_end="([^"]*)"[^>]*period_range="([^"]*)"[^>]*time_range="([^"]*)"[^>]*>/gi;
    let trMatch;

    while ((trMatch = trPattern.exec(html)) !== null) {
      const seqNo = trMatch[1];
      const dateDayRaw = trMatch[2]; // "2026/03/30(月)"
      const periodStr = trMatch[3]; // "b1", "g3", "11"
      const periodEnd = trMatch[4];
      const periodRange = trMatch[5]; // "b1時限", "11～13時限"
      const timeRange = trMatch[6]; // "13:30～15:00"

      // Extract day of week from date
      const dayMatch = dateDayRaw.match(/[（(]([月火水木金土日])[）)]/);
      const day = dayMatch ? dayMatch[1] : null;
      const date = dateDayRaw.replace(/[（(][月火水木金土日][）)]/, '').trim();

      // Parse time range
      const timeParts = timeRange.match(/(\d{2}:\d{2})\s*[～~ー-]\s*(\d{2}:\d{2})/);
      const timeStart = timeParts ? timeParts[1] : null;
      const timeEnd = timeParts ? timeParts[2] : null;

      const trStart = trMatch.index;
      const trEndIdx = html.indexOf('</tr>', trStart);
      const trContent = html.slice(trStart, trEndIdx);

      // Extract all TDs once and reuse
      const tds = [];
      {
        const tdPat = /<td[^>]*>([\s\S]*?)<\/td>/gi;
        let tdM;
        while ((tdM = tdPat.exec(trContent)) !== null) {
          tds.push(stripHtml(tdM[1]));
        }
      }

      // Room: prefer <a> link text (linked room name), fallback to td[3]
      let room = null;
      const roomLink = trContent.match(/<td[^>]*>[^<]*<a[^>]*>([^<]+)<\/a>/i);
      if (roomLink) {
        room = roomLink[1].trim();
      } else if (tds.length >= 4) {
        room = tds[3] || null;
      }

      const sessionInstructor = tds.length >= 5 ? (tds[4] || null) : null;
      const sessionTitle   = titleColIdx   >= 0 ? (tds[titleColIdx]   || null) : null;
      const sessionContent = contentColIdx >= 0 ? (tds[contentColIdx] || null) : null;
      const sessionGoal    = goalColIdx    >= 0 ? (tds[goalColIdx]    || null) : null;

      sessions.push({ seqNo, date, day, timeStart, timeEnd, periodStr, periodEnd, periodRange, room, instructor: sessionInstructor, sessionTitle, sessionContent, sessionGoal });
    }
  }

  return { name, instructor, semester, credits, lctCd, dayPeriodShort, sessions };
}

// ════════════════════════════════════════════════
// 2. Derive weekly schedule pattern from sessions
// ════════════════════════════════════════════════

/**
 * Given sessions, derive the weekly recurring pattern.
 * Medical courses often have block schedules (irregular day/time combos),
 * so we group by day and merge adjacent time slots, then keep only the
 * most common patterns to avoid generating excessive rows.
 *
 * Returns array of { day, timeStart, timeEnd, per, room }.
 */
function deriveWeeklyPattern(sessions) {
  if (!sessions || sessions.length === 0) return [];

  // Filter and clean
  const validSessions = sessions.filter(s => s.day && s.timeStart && s.timeEnd);
  if (validSessions.length === 0) return [];

  // Group by day → collect all time ranges + rooms
  const dayMap = {};
  for (const s of validSessions) {
    if (!dayMap[s.day]) dayMap[s.day] = { count: 0, times: [], rooms: [] };
    dayMap[s.day].count++;
    dayMap[s.day].times.push({ start: s.timeStart, end: s.timeEnd });
    const room = cleanRoom(s.room);
    if (room) dayMap[s.day].rooms.push(room);
  }

  // For each day, merge overlapping/adjacent time ranges into a single span
  const patterns = [];
  for (const [day, info] of Object.entries(dayMap)) {
    // Only include days with at least 2 sessions (skip one-off events)
    if (info.count < 2) continue;

    // Find overall time range for this day
    const starts = info.times.map(t => t.start).sort();
    const ends = info.times.map(t => t.end).sort();
    const timeStart = starts[0];
    const timeEnd = ends[ends.length - 1];

    // Most common room
    const roomCounts = {};
    for (const r of info.rooms) roomCounts[r] = (roomCounts[r] || 0) + 1;
    const room = Object.entries(roomCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || null;

    const per = `${day}(${timeStart}-${timeEnd})`;
    patterns.push({ day, timeStart, timeEnd, per, room, _count: info.count });
  }

  // Sort by frequency (most sessions first), limit to top 4
  patterns.sort((a, b) => b._count - a._count);
  return patterns.slice(0, 4).map(({ _count, ...rest }) => rest);
}

/** Clean room string: treat &nbsp;, 未定, 遠隔, オンデマンド as null */
function cleanRoom(room) {
  if (!room) return null;
  const cleaned = room.replace(/&nbsp;/gi, '').trim();
  if (!cleaned) return null;
  if (/未定|遠隔|オンデマンド/.test(cleaned)) return null;
  return cleaned;
}

/**
 * Map semester text to quarter notation for compatibility.
 */
function semesterToQuarter(semester) {
  if (!semester) return null;
  if (semester.includes('前期')) return '1-2Q';
  if (semester.includes('後期')) return '3-4Q';
  if (semester.includes('通年')) return '1-4Q';
  return null;
}

// ════════════════════════════════════════════════
// 3. Building code extraction (湯島キャンパス)
// ════════════════════════════════════════════════

function extractMedBuilding(room) {
  if (!room) return null;
  if (room.includes('遠隔')) return null;

  // "7号館2階歯学科講義室3" → "MD7"
  const goukan = room.match(/(\d+)号館/);
  if (goukan) return `MD${goukan[1]}`;
  // "医学科講義室1" → "MD_med"
  if (room.includes('医学科')) return 'MD_med';
  if (room.includes('歯学科')) return 'MD_den';
  // Alpha-numeric patterns
  const alpha = room.match(/^([A-Z]+\d?[A-Z]*)-/);
  if (alpha) return alpha[1];
  return null;
}

// ════════════════════════════════════════════════
// 4. Bulk fetch: enumerate codes → fetch → upsert
// ════════════════════════════════════════════════

/**
 * Discover valid courses by enumerating code ranges and probing LctSchedule.aspx.
 * Returns array of { lctCd, name, instructor, semester, credits, sessions }.
 */
async function discoverCourses(facCd, year, onProgress) {
  const candidates = generateCandidateCodes(facCd);
  console.log(`[SyllabusMed] Probing ${candidates.length} candidate codes for fac=${facCd}...`);

  const found = [];
  const BATCH = 8;

  for (let i = 0; i < candidates.length; i += BATCH) {
    const batch = candidates.slice(i, i + BATCH);
    if (onProgress) onProgress(candidates.length, found.length, i);

    const results = await Promise.allSettled(
      batch.map(code => fetchMedCourse(code, year))
    );

    for (let j = 0; j < results.length; j++) {
      const r = results[j];
      if (r.status === 'fulfilled' && r.value) {
        found.push(r.value);
      }
    }

    // Polite delay to avoid rate limiting
    if (i + BATCH < candidates.length) {
      await new Promise(r => setTimeout(r, 300));
    }
  }

  console.log(`[SyllabusMed] Discovered ${found.length} valid courses out of ${candidates.length} probed`);
  return found;
}

/**
 * Fetch all courses for a medical/dental faculty and upsert into syllabus_courses.
 *
 * @param {string} facKey - e.g. "MED", "DEN", "LIB"
 * @param {string} year   - e.g. "2026"
 */
export async function fetchMedFacultySyllabus(facKey, year) {
  const facInfo = MED_FACULTIES[facKey];
  if (!facInfo) throw new Error(`Unknown medical faculty: ${facKey}`);

  const progressKey = `med_${facKey}_${year}`;
  scrapeProgress.set(progressKey, { total: 0, done: 0, phase: 'discover', current: '' });

  console.log(`[SyllabusMed] Starting ${facKey} ${year} (${facInfo.label})...`);

  // Phase 1: Discover courses by enumeration
  const courses = await discoverCourses(facInfo.fac_cd, year, (total, found, probed) => {
    scrapeProgress.set(progressKey, {
      total, done: probed, phase: 'discover',
      current: `${found} found / ${probed} probed`,
    });
  });

  if (courses.length === 0) {
    scrapeProgress.delete(progressKey);
    return { added: 0, note: 'No courses found' };
  }

  scrapeProgress.set(progressKey, {
    total: courses.length, done: 0, phase: 'saving', current: '',
  });

  // Phase 2: Build session rows and save to med_sessions
  const sb = getSupabaseAdmin();
  const now = new Date().toISOString();
  const sessionRows = [];

  for (const course of courses) {
    if (course.sessions.length > 0) {
      for (const s of course.sessions) {
        sessionRows.push({
          lct_cd: course.lctCd,
          name: course.name,
          faculty: facKey,
          year,
          semester: course.semester,
          credits: course.credits,
          instructor: course.instructor,
          seq_no: s.seqNo || null,
          date: s.date || null,
          day: s.day || null,
          time_start: s.timeStart || null,
          time_end: s.timeEnd || null,
          period_str: s.periodStr || null,
          period_end: s.periodEnd || null,
          room: s.room || null,
          session_instructor: s.instructor || null,
          session_title: s.sessionTitle || null,
          session_content: s.sessionContent || null,
          session_goal: s.sessionGoal || null,
          fetched_at: now,
        });
      }
    } else {
      // Course exists but has no sessions
      sessionRows.push({
        lct_cd: course.lctCd,
        name: course.name,
        faculty: facKey,
        year,
        semester: course.semester,
        credits: course.credits,
        instructor: course.instructor,
        seq_no: null,
        date: null,
        day: null,
        time_start: null,
        time_end: null,
        period_str: null,
        period_end: null,
        room: null,
        session_instructor: null,
        session_title: null,
        session_content: null,
        session_goal: null,
        fetched_at: now,
      });
    }
  }

  // Delete old data for this faculty+year, then insert fresh
  const { error: delError } = await sb.from('med_sessions')
    .delete().eq('faculty', facKey).eq('year', year);
  if (delError) console.error(`[SyllabusMed] med_sessions delete failed:`, delError.message);

  const BATCH_SIZE = 200;
  for (let i = 0; i < sessionRows.length; i += BATCH_SIZE) {
    const batch = sessionRows.slice(i, i + BATCH_SIZE);
    const { error } = await sb.from('med_sessions').insert(batch);
    if (error) console.error(`[SyllabusMed] med_sessions insert batch ${i} failed:`, error.message);
  }

  scrapeProgress.delete(progressKey);
  console.log(`[SyllabusMed] ${facKey} ${year}: ${courses.length} courses, ${sessionRows.length} sessions saved`);
  return { added: sessionRows.length, courses: courses.length };
}

// ════════════════════════════════════════════════
// 5. Exports
// ════════════════════════════════════════════════

export function getMedFacultyList() {
  const _jst = new Date(Date.now() + 9 * 3600_000);
  const currentAY = _jst.getUTCMonth() >= 3 ? _jst.getUTCFullYear() : _jst.getUTCFullYear() - 1;
  const years = [String(currentAY - 1), String(currentAY)];

  return {
    years,
    faculties: Object.entries(MED_FACULTIES).map(([key, info]) => ({
      key,
      label: info.label,
      school: info.school,
    })),
  };
}

/**
 * Lookup sessions from med_sessions by lct_cd list.
 * Used by the timetable view to avoid live scraping.
 */
export async function lookupMedSessionsFromDB(lctCds, year) {
  const sb = getSupabaseAdmin();
  const PAGE = 1000;
  let all = [];
  let from = 0;
  while (true) {
    const { data, error } = await sb.from('med_sessions')
      .select('*')
      .in('lct_cd', lctCds)
      .eq('year', year)
      .order('date').order('time_start')
      .range(from, from + PAGE - 1);
    if (error) { console.error('[SyllabusMed] med_sessions lookup failed:', error.message); break; }
    if (!data || data.length === 0) break;
    all = all.concat(data);
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return all;
}
