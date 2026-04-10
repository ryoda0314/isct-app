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
  MED:  { fac_cd: '01', label: '医学部医学科',             school: '医学部' },
  DEN:  { fac_cd: '02', label: '歯学部歯学科',             school: '歯学部' },
  LIB:  { fac_cd: '00', label: '教養部',                   school: '教養部' },
  GMED_M: { fac_cd: '31', label: '医歯学総合研究科(修士)',  school: '大学院 医歯学総合研究科' },
  GMED_D3: { fac_cd: '36', label: '医歯学総合研究科(博士3年)', school: '大学院 医歯学総合研究科' },
  GMED_D4: { fac_cd: '41', label: '医歯学総合研究科(博士4年)', school: '大学院 医歯学総合研究科' },
  GHSC_D: { fac_cd: '61', label: '保健衛生学研究科(博士)',  school: '大学院 保健衛生学研究科' },
  GHSC_M: { fac_cd: '71', label: '保健衛生学研究科(修士)',  school: '大学院 保健衛生学研究科' },
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

    case '02': // 歯学部 — codes at step=10 in string repr, including hex digits
      // All observed codes end in X0: 021100, 021110, ..., 021f90
      // Decimal portion: 0211xx–0219xx
      addDecimalRange(21100, 21299, 10);
      addDecimalRange(21500, 21999, 10);
      // Hex portion: 021axx–021fxx (contains hex digits a–f)
      addHexRange('021a00', '021ff0', 0x10);
      break;

    case '00': // 教養部 — sparse
      addDecimalRange(1, 999);
      break;

    default:
      // Graduate schools — try broader range with step=10
      addDecimalRange(parseInt(facCd) * 10000 + 1000, parseInt(facCd) * 10000 + 9999, 10);
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
  const url = `${MED_BASE}/LctSchedule.aspx?lct_year=${year}&lct_cd=${lctCd}&top=1`;
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

  // ── Sessions from <tr> attributes ──
  const sessions = [];
  if (!noSchedule) {
    const trPattern = /<tr\s+seq_no="([^"]*)"[^>]*lct_date_day="([^"]*)"[^>]*time_range="([^"]*)"[^>]*>/gi;
    let trMatch;

    while ((trMatch = trPattern.exec(html)) !== null) {
      const seqNo = trMatch[1];
      const dateDayRaw = trMatch[2]; // "2026/03/30(月)"
      const timeRange = trMatch[3]; // "13:30～15:00"

      // Extract day of week from date
      const dayMatch = dateDayRaw.match(/[（(]([月火水木金土日])[）)]/);
      const day = dayMatch ? dayMatch[1] : null;
      const date = dateDayRaw.replace(/[（(][月火水木金土日][）)]/, '').trim();

      // Parse time range
      const timeParts = timeRange.match(/(\d{2}:\d{2})\s*[～~ー-]\s*(\d{2}:\d{2})/);
      const timeStart = timeParts ? timeParts[1] : null;
      const timeEnd = timeParts ? timeParts[2] : null;

      // Extract room from the <td> that follows (4th column)
      // The <tr> content contains <td> cells; room is typically in column 4 (index 3)
      const trStart = trMatch.index;
      const trEndIdx = html.indexOf('</tr>', trStart);
      const trContent = html.slice(trStart, trEndIdx);

      // Room: look for the room <td>/<a> — skip seq_no, date, time columns
      let room = null;
      const roomLink = trContent.match(/<td[^>]*>[^<]*<a[^>]*>([^<]+)<\/a>/i);
      if (roomLink) {
        room = roomLink[1].trim();
      } else {
        // Try plain text in 4th <td>
        const tds = [];
        const tdPattern = /<td[^>]*>([\s\S]*?)<\/td>/gi;
        let tdMatch;
        while ((tdMatch = tdPattern.exec(trContent)) !== null) {
          tds.push(stripHtml(tdMatch[1]));
        }
        if (tds.length >= 4) room = tds[3] || null;
      }

      // Extract session instructor (5th column)
      let sessionInstructor = null;
      {
        const tds = [];
        const tdPattern = /<td[^>]*>([\s\S]*?)<\/td>/gi;
        let tdMatch;
        while ((tdMatch = tdPattern.exec(trContent)) !== null) {
          tds.push(stripHtml(tdMatch[1]));
        }
        if (tds.length >= 5) sessionInstructor = tds[4] || null;
      }

      sessions.push({ seqNo, date, day, timeStart, timeEnd, room, instructor: sessionInstructor });
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
  const BATCH = 15;

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

    // Polite delay
    if (i + BATCH < candidates.length) {
      await new Promise(r => setTimeout(r, 100));
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
    total: courses.length, done: 0, phase: 'processing', current: '',
  });

  // Phase 2: Convert to DB rows
  const expandedRows = [];

  for (const course of courses) {
    const quarter = semesterToQuarter(course.semester);
    const syllabusUrl = `${MED_BASE}/DetailMain.aspx?lct_year=${year}&lct_cd=${course.lctCd}&je_cd=1`;
    const code = `MED.${course.lctCd}`;

    const patterns = deriveWeeklyPattern(course.sessions);

    if (patterns.length > 0) {
      for (const pat of patterns) {
        expandedRows.push({
          code,
          name: course.name,
          teacher: course.instructor,
          section: '',
          dept: facKey,
          year,
          day: pat.day,
          per: pat.per || '',
          period_start: null,
          period_end: null,
          room: pat.room,
          building: extractMedBuilding(pat.room),
          quarter,
          syllabus_url: syllabusUrl,
          school: facInfo.school,
          requirement: null,
          credits: course.credits,
          fetched_at: new Date().toISOString(),
        });
      }
    } else {
      expandedRows.push({
        code,
        name: course.name,
        teacher: course.instructor,
        section: '',
        dept: facKey,
        year,
        day: null,
        per: '',
        period_start: null,
        period_end: null,
        room: null,
        building: null,
        quarter,
        syllabus_url: syllabusUrl,
        school: facInfo.school,
        requirement: null,
        credits: course.credits,
        fetched_at: new Date().toISOString(),
      });
    }
  }

  scrapeProgress.set(progressKey, {
    total: courses.length, done: courses.length, phase: 'saving', current: '',
  });

  // Phase 3: Upsert into Supabase
  const sb = getSupabaseAdmin();

  // Deduplicate
  const seen = new Set();
  const uniqueRows = expandedRows.filter(r => {
    const key = `${r.code}|${r.year}|${r.syllabus_url}|${r.section}|${r.per}|${r.day}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  if (uniqueRows.length > 0) {
    // Preserve existing requirement values
    const { data: existingRows } = await sb.from('syllabus_courses')
      .select('code, requirement')
      .eq('dept', facKey).eq('year', year)
      .not('requirement', 'is', null);
    const reqMap = {};
    if (existingRows) {
      for (const r of existingRows) {
        if (r.requirement) reqMap[r.code] = r.requirement;
      }
    }
    for (const row of uniqueRows) {
      if (!row.requirement && reqMap[row.code]) {
        row.requirement = reqMap[row.code];
      }
    }

    // Delete old data for this faculty+year
    const { error: delError } = await sb.from('syllabus_courses')
      .delete().eq('dept', facKey).eq('year', year);
    if (delError) console.error(`[SyllabusMed] DB delete failed:`, delError.message);

    // Insert in batches
    const BATCH_SIZE = 500;
    for (let i = 0; i < uniqueRows.length; i += BATCH_SIZE) {
      const batch = uniqueRows.slice(i, i + BATCH_SIZE);
      const { error } = await sb.from('syllabus_courses')
        .upsert(batch, { onConflict: 'code,year,syllabus_url,section,per,day' });
      if (error) {
        console.error(`[SyllabusMed] DB upsert batch failed:`, error.message);
      }
    }
  }

  scrapeProgress.delete(progressKey);
  console.log(`[SyllabusMed] ${facKey} ${year}: ${courses.length} courses, ${uniqueRows.length} rows saved`);
  return { added: uniqueRows.length, courses: courses.length };
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

export async function lookupMedScheduleFromDB(codes, year) {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from('syllabus_courses')
    .select('code, section, day, per, period_start, period_end, room, quarter, building, dept, requirement')
    .in('code', codes)
    .eq('year', year);
  if (error) {
    console.error('[SyllabusMed] DB lookup failed:', error.message);
    return [];
  }
  return data || [];
}
