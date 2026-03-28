import { getSupabaseAdmin } from '../supabase/server.js';

const SYLLABUS_BASE = 'https://syllabus.s.isct.ac.jp';
const SYLLABUS_YEARS = ['2025', '2026'];

/**
 * Build department listing paths for a given year.
 */
function buildDeptPaths(year) {
  return {
    // ── 理学院 (School of Science) ──
    MTH:  { path: `/courses/${year}/1/0-901-311100-0-0`, label: '数学系', school: '理学院' },
    PHY:  { path: `/courses/${year}/1/0-901-311200-0-0`, label: '物理学系', school: '理学院' },
    CHM:  { path: `/courses/${year}/1/0-901-311300-0-0`, label: '化学系', school: '理学院' },
    EPS:  { path: `/courses/${year}/1/0-901-311400-0-0`, label: '地球惑星科学系', school: '理学院' },

    // ── 工学院 (School of Engineering) ──
    MEC:  { path: `/courses/${year}/2/0-902-321500-0-0`, label: '機械系', school: '工学院' },
    SCE:  { path: `/courses/${year}/2/0-902-321600-0-0`, label: 'システム制御系', school: '工学院' },
    EEE:  { path: `/courses/${year}/2/0-902-321700-0-0`, label: '電気電子系', school: '工学院' },
    ICT:  { path: `/courses/${year}/2/0-902-321800-0-0`, label: '情報通信系', school: '工学院' },
    IEE:  { path: `/courses/${year}/2/0-902-321900-0-0`, label: '経営工学系', school: '工学院' },

    // ── 物質理工学院 (School of Materials and Chemical Technology) ──
    MAT:  { path: `/courses/${year}/3/0-903-332000-0-0`, label: '材料系', school: '物質理工学院' },
    CAP:  { path: `/courses/${year}/3/0-903-332100-0-0`, label: '応用化学系', school: '物質理工学院' },

    // ── 情報理工学院 (School of Computing) ──
    MCS:  { path: `/courses/${year}/4/0-904-342200-0-0`, label: '数理・計算科学系', school: '情報理工学院' },
    CSC:  { path: `/courses/${year}/4/0-904-342300-0-0`, label: '情報工学系', school: '情報理工学院' },

    // ── 生命理工学院 (School of Life Science and Technology) ──
    LST:  { path: `/courses/${year}/5/0-905-352400-0-0`, label: '生命理工学系', school: '生命理工学院' },

    // ── 環境・社会理工学院 (School of Environment and Society) ──
    ARC:  { path: `/courses/${year}/6/0-906-362500-0-0`, label: '建築学系', school: '環境・社会理工学院' },
    CVE:  { path: `/courses/${year}/6/0-906-362600-0-0`, label: '土木・環境工学系', school: '環境・社会理工学院' },
    TSE:  { path: `/courses/${year}/6/0-906-362700-0-0`, label: '融合理工学系', school: '環境・社会理工学院' },

    // ── 教養科目 (Liberal Arts) ──
    LAH:  { path: `/courses/${year}/7/0-907-0-110100-0`, label: '文系教養科目', school: '教養' },
    LAE:  { path: `/courses/${year}/7/0-907-0-110200-0`, label: '英語科目', school: '教養' },
    LAL:  { path: `/courses/${year}/7/0-907-0-110300-0`, label: '第二外国語科目', school: '教養' },
    LAJ:  { path: `/courses/${year}/7/0-907-0-110400-0`, label: '日本語・日本文化科目', school: '教養' },
    LAT:  { path: `/courses/${year}/7/0-907-0-110500-0`, label: '教職科目', school: '教養' },
    ENT:  { path: `/courses/${year}/7/0-907-0-110610-0`, label: 'アントレプレナーシップ', school: '教養' },
    LAW:  { path: `/courses/${year}/7/0-907-0-110700-0`, label: '広域教養科目', school: '教養' },
    LAS:  { path: `/courses/${year}/7/0-907-0-110800-0`, label: '理工系教養科目', school: '教養' },

    // ── 共通・その他 ──
    CMN:  { path: `/courses/${year}/11/0-908-300001-0-0`, label: '工・物質・環境共通', school: '共通' },
    DSA:  { path: `/courses/${year}/0/0-981-400037-0-0`, label: 'データサイエンス・AI', school: 'その他' },
  };
}

/**
 * Split room string into individual room names.
 * Handles comma, Japanese comma, and space before alphanumeric building code.
 * e.g. "建築製図室 W9-511設計製図室" → ["建築製図室", "W9-511設計製図室"]
 * e.g. "建築製図室, W9-511設計製図室" → ["建築製図室", "W9-511設計製図室"]
 */
function splitRooms(raw) {
  // First split by comma/Japanese comma
  const parts = raw.split(/[,、]\s*/);
  // Then split by space before an uppercase letter (building code boundary)
  const result = [];
  for (const part of parts) {
    const sub = part.trim().split(/\s+(?=[A-Z])/);
    result.push(...sub);
  }
  return result.map(r => r.trim()).filter(Boolean);
}

/**
 * Clean room name: strip parenthetical noise like "(W934)" from each room,
 * normalize separators, and deduplicate.
 */
function cleanRoomName(raw) {
  return splitRooms(raw)
    .map(r => r.replace(/\s*\([A-Za-z0-9]+\)\s*$/, '').trim())
    .filter(Boolean)
    .join(', ');
}

/**
 * Extract building code(s) from room name for map navigation.
 * Returns comma-separated unique building codes.
 * e.g. "W5-106" → "W5"
 * e.g. "M-B07, I3-201A～C, I3-303" → "M, I3"
 * e.g. "W8E-306" → "W8E"
 * e.g. "第３ラボ(W3, 8F)" → "W3"
 */
function extractBuilding(room) {
  if (!room) return null;
  const buildings = new Set();
  for (const part of splitRooms(room)) {
    // "W9-511", "M-B07", "S4-201", "WL1-301", "SL-206", "W8E-306"
    const m = part.match(/^([A-Z]+\d?[A-Z]*)-/);
    if (m) { buildings.add(m[1]); continue; }
    // Standalone codes: "GSIC3F", "H101"
    const s = part.match(/^([A-Z]{2,})\d/);
    if (s) buildings.add(s[1]);
  }
  // Fallback: extract building codes from parentheses
  // e.g. "第３ラボ(W3, 8F)" → W3, "第１ラボ(W3, 4F)" → W3
  if (buildings.size === 0) {
    const pm = room.match(/[（(]\s*([A-Z]+\d?[A-Z]*)\s*[,、，\s）)]/);
    if (pm) buildings.add(pm[1]);
  }
  // Map Japanese building names to codes (always runs, not just as fallback)
  // e.g. "石川台6号館4階404" → I6, "W9-324，西8号館 計算機室" → W9, W8
  {
    const toHalfNum = c => c ? String.fromCharCode(c.charCodeAt(0) - 0xFF10 + 0x30) : c;
    // Match "南2，3" → S2, S3 / "石川台6" → I6 etc.
    const jpPrefixes = [
      [/石川台\s*([0-9０-９](?:\s*[,、，]\s*[0-9０-９])*)/, 'I'],
      [/西\s*([0-9０-９](?:\s*[,、，]\s*[0-9０-９])*)/, 'W'],
      [/南\s*([0-9０-９](?:\s*[,、，]\s*[0-9０-９])*)/, 'S'],
      [/本館/, 'M'],
      [/南実験棟\s*([0-9０-９](?:\s*[,、，]\s*[0-9０-９])*)/, 'SE'],
      [/屋内運動場/, '屋内運動場'],
      [/情報工学系計算機室/, 'W8'],
      [/情報ネットワーク演習室/, 'S4'],
      [/建築製図室/, 'W5'],
      [/GSIC/, 'S3'],
    ];
    for (const [pat, prefix] of jpPrefixes) {
      const jm = room.match(pat);
      if (jm && jm[1]) {
        for (const ch of jm[1].replace(/[\s,、，]/g, '')) {
          const num = /[０-９]/.test(ch) ? toHalfNum(ch) : ch;
          buildings.add(`${prefix}${num}`);
        }
      } else if (jm) {
        buildings.add(prefix);
      }
    }
  }
  return buildings.size > 0 ? [...buildings].join(', ') : null;
}


function stripHtml(html) {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ').trim();
}

/**
 * Extract quarter string from raw text like "2026 1Q", "2026 1～2Q", "2026 1・3Q".
 */
function parseQuarterFromText(text) {
  const dotQM = text.match(/(\d)\s*[・]\s*(\d)\s*Q/);
  const rangeQM = text.match(/(\d)\s*[-–～〜~]\s*(\d)\s*Q/);
  const singleQM = text.match(/(\d)\s*Q/);
  if (dotQM) return `${dotQM[1]}・${dotQM[2]}Q`;
  if (rangeQM) return rangeQM[2] !== rangeQM[1] ? `${rangeQM[1]}-${rangeQM[2]}Q` : `${rangeQM[1]}Q`;
  if (singleQM) return `${singleQM[1]}Q`;
  return null;
}

const FETCH_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'ja,en;q=0.5',
};

// Progress tracking for scrape jobs
const scrapeProgress = new Map();

export function getScrapeProgress(key) {
  return scrapeProgress.get(key) || null;
}

/**
 * Fetch a department listing page and extract course code, name, section, and syllabus URL.
 * Uses structural <tr>/<td> parsing for reliable extraction across all departments.
 */
async function fetchDeptCourses(deptKey, deptPath) {
  const url = `${SYLLABUS_BASE}${deptPath}`;
  const resp = await fetch(url, { headers: FETCH_HEADERS, cache: 'no-store' });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  const html = await resp.text();

  const byCode = {};
  const seenUrls = new Set();

  // Parse table rows structurally:
  // col[0]=code, col[1]=<a>name+section</a>, col[2]=teacher, col[3]=dept, col[4]=year+quarter
  const trPattern = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let trMatch;

  while ((trMatch = trPattern.exec(html)) !== null) {
    const trContent = trMatch[1];

    // Extract <td> cells
    const tds = [];
    const tdPattern = /<td[^>]*>([\s\S]*?)<\/td>/gi;
    let tdMatch;
    while ((tdMatch = tdPattern.exec(trContent)) !== null) {
      tds.push(tdMatch[1]);
    }

    if (tds.length < 5) continue;

    // Cell 0: course code
    const code = tds[0].replace(/<[^>]+>/g, '').trim();
    if (!/^[A-Z]{2,4}\.[A-Z]\d{3}$/.test(code)) continue;

    // Cell 1: <a href="URL">name [section]</a>
    const linkMatch = tds[1].match(/href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/);
    if (!linkMatch) continue;

    const syllabusPath = linkMatch[1];
    const syllabusUrl = syllabusPath.startsWith('http')
      ? syllabusPath
      : `${SYLLABUS_BASE}${syllabusPath}`;

    if (seenUrls.has(syllabusUrl)) continue;
    seenUrls.add(syllabusUrl);

    // Split name and section from <a> text (separated by newline in HTML)
    const lines = linkMatch[2].trim().split(/\n/).map(l => l.trim()).filter(Boolean);
    let name = lines[0] && lines[0].length >= 2 ? lines[0] : null;
    let section = lines.length > 1 ? lines.slice(1).join(' ') : null;

    // Detect trailing fullwidth/halfwidth digit as section
    // e.g. "応用基礎データサイエンス・AI第一２" → name without "２", section "2"
    if (!section && name) {
      const trailingNum = name.match(/[０-９\d]+$/);
      if (trailingNum) {
        section = trailingNum[0].replace(/[０-９]/g, c =>
          String.fromCharCode(c.charCodeAt(0) - 0xFF10 + 0x30));
        name = name.slice(0, -trailingNum[0].length).trim();
      }
    }

    // Cell 2: teacher(s) — take first teacher from "/" separated list
    const teacherRaw = tds[2].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
    const teacher = teacherRaw ? teacherRaw.split(/\s*\/\s*/)[0].trim() || null : null;

    // Cell 4: year + quarter (e.g. "2026 1Q", "2026 1～2Q", "2026 1・3Q")
    const yearQRaw = tds[4].replace(/<[^>]+>/g, '').trim();
    const listingQuarter = parseQuarterFromText(yearQRaw);

    if (!byCode[code]) byCode[code] = [];
    byCode[code].push({ syllabusUrl, name, teacher, section, listingQuarter });
  }

  // Phase 2: Build entries with section dedup
  const result = [];

  for (const [code, group] of Object.entries(byCode)) {
    const seenSections = new Set();

    for (const entry of group) {
      const sectionKey = entry.section || '';
      if (seenSections.has(sectionKey)) continue;
      seenSections.add(sectionKey);

      result.push({
        code,
        name: entry.name,
        teacher: entry.teacher,
        syllabusUrl: entry.syllabusUrl,
        dept: deptKey,
        section: entry.section,
        listingSchedules: [],
        listingRoom: null,
        listingQuarter: entry.listingQuarter,
      });
    }
  }

  return result;
}

/**
 * Fetch schedule details from an individual course syllabus page.
 */
async function fetchCourseDetail(syllabusUrl) {
  const resp = await fetch(syllabusUrl, { headers: FETCH_HEADERS });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  const html = await resp.text();
  const text = stripHtml(html);

  // Match all "曜日+時限" patterns (e.g. "月3-4 (M-B07(H101)) / 木3-4 (M-B07(H101))")
  // (?<!曜) prevents matching "曜日3-4時限" where 日 is part of 曜日/木曜日, not Sunday
  const schedPattern = /(?<!曜)([月火水木金土日])\s*(\d{1,2})\s*[-–ー~]\s*(\d{1,2})/g;
  // Room pattern: match content inside parens, excluding closing parens and "/" (schedule separator).
  // Supports nested parens for cases like (M-B07(H101)), any chars including fullwidth punctuation.
  const roomPattern = /[（(]\s*((?:[^（(）)\/]|[（(][^）)]*[）)])+)\s*[）)]/;
  const schedules = [];
  let schedM;

  while ((schedM = schedPattern.exec(text)) !== null) {
    const afterMatch = text.slice(schedM.index + schedM[0].length, schedM.index + schedM[0].length + 80);
    const roomM = afterMatch.match(roomPattern);
    let room = roomM ? roomM[1].replace(/[（）]/g, m => m === '（' ? '(' : ')') : null;
    // Reject time strings like "10時45分～12時25分" mistakenly captured as room
    if (room && /^\d+時/.test(room)) room = null;
    if (room) room = cleanRoomName(room);
    schedules.push({
      day: schedM[1],
      per: `${schedM[1]}${schedM[2]}-${schedM[3]}`,
      periodStart: parseInt(schedM[2]),
      periodEnd: parseInt(schedM[3]),
      room,
    });
  }

  // Propagate room from previous slot when omitted (e.g. "月5-6 (W9-325) / 木3-4")
  for (let i = 1; i < schedules.length; i++) {
    if (!schedules[i].room && schedules[i - 1].room) {
      schedules[i].room = schedules[i - 1].room;
    }
  }

  // Fallback room detection if no room found in schedule slots
  if (schedules.length > 0 && schedules.every(s => !s.room)) {
    const roomText = text.replace(/([A-Z])\s+([A-Z]\d?-\d)/g, '$1$2');
    const roomLabelMatch = roomText.match(/(?:教室|講義室|実験室)[）)：:\s]*([A-Z][A-Za-z0-9\-]+(?:[（(][A-Z]\d{2,4}[）)])?)/);
    let fallbackRoom = null;
    if (roomLabelMatch) {
      fallbackRoom = roomLabelMatch[1].replace(/[（）]/g, m => m === '（' ? '(' : ')');
    } else {
      const rp = roomText.match(/((?<![A-Za-z])M-[A-Z]?\d{1,3}(?:\([A-Z]\d{2,4}\))?|(?<![A-Za-z])[A-Z]{2}\d?-\d{2,4}(?:\([A-Z]\d{2,4}\))?|(?<![A-Za-z])[A-Z]\d-\d{2,4}(?:\([A-Z]\d{2,4}\))?)/);
      if (rp) fallbackRoom = rp[1];
    }
    if (fallbackRoom) {
      fallbackRoom = cleanRoomName(fallbackRoom);
      schedules.forEach(s => s.room = fallbackRoom);
    }
  }

  // Single schedule fallback (no match)
  if (schedules.length === 0) {
    let room = null;
    const roomText = text.replace(/([A-Z])\s+([A-Z]\d?-\d)/g, '$1$2');
    const roomLabelMatch = roomText.match(/(?:教室|講義室|実験室)[）)：:\s]*([A-Z][A-Za-z0-9\-]+(?:[（(][A-Z]\d{2,4}[）)])?)/);
    if (roomLabelMatch) {
      room = roomLabelMatch[1].replace(/[（）]/g, m => m === '（' ? '(' : ')');
    } else {
      const rp = roomText.match(/((?<![A-Za-z])M-[A-Z]?\d{1,3}(?:\([A-Z]\d{2,4}\))?|(?<![A-Za-z])[A-Z]{2}\d?-\d{2,4}(?:\([A-Z]\d{2,4}\))?|(?<![A-Za-z])[A-Z]\d-\d{2,4}(?:\([A-Z]\d{2,4}\))?)/);
      if (rp) room = rp[1];
    }
    if (room) room = cleanRoomName(room);
    schedules.push({ day: null, per: null, periodStart: null, periodEnd: null, room });
  }

  const quarter = parseQuarterFromText(text);

  let detailName = null;
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  if (titleMatch) {
    detailName = titleMatch[1]
      .replace(/\s*[-|].*/g, '')
      .replace(/シラバス/g, '')
      .trim();
  }

  return { schedules, quarter, detailName };
}

/**
 * Fetch syllabus data for a single department + year,
 * then upsert results into the syllabus_courses table.
 *
 * @param {string} deptKey - e.g. "MEC", "CSC"
 * @param {string} year    - e.g. "2025", "2026"
 * @returns {{ added: number }}
 */
export async function fetchDeptSyllabus(deptKey, year) {
  const paths = buildDeptPaths(year);
  const deptInfo = paths[deptKey];
  if (!deptInfo) throw new Error(`Unknown department: ${deptKey}`);

  const progressKey = `${deptKey}_${year}`;
  scrapeProgress.set(progressKey, { total: 0, done: 0, phase: 'listing', current: '' });

  console.log(`[SyllabusBulk] Fetching ${deptKey} ${year} (${deptInfo.label})...`);

  const deptCourses = await fetchDeptCourses(deptKey, deptInfo.path);

  console.log(`[SyllabusBulk] ${deptKey} ${year}: found ${deptCourses.length} courses, fetching details...`);
  scrapeProgress.set(progressKey, { total: deptCourses.length, done: 0, phase: 'details', current: '' });
  let successCount = 0;

  // Expanded rows: one course can produce multiple rows (multi-day schedules)
  const expandedCourses = [];

  for (const course of deptCourses) {
    scrapeProgress.set(progressKey, { total: deptCourses.length, done: successCount, phase: 'details', current: course.code });
    try {
      const detail = await fetchCourseDetail(course.syllabusUrl);
      if (!course.name && detail.detailName) {
        course.name = detail.detailName;
      }
      // Check if detail page had real schedule data
      const hasDetailSchedule = detail.schedules.some(s => s.day);
      const schedules = hasDetailSchedule ? detail.schedules : null;
      const quarter = detail.quarter;

      if (schedules) {
        // Use detail page schedules
        for (const sched of schedules) {
          expandedCourses.push({
            ...course,
            per: sched.per,
            day: sched.day,
            periodStart: sched.periodStart,
            periodEnd: sched.periodEnd,
            room: sched.room,
            quarter,
          });
        }
      } else if (course.listingSchedules && course.listingSchedules.length > 0) {
        // Fallback: use listing page schedule info
        for (const sched of course.listingSchedules) {
          expandedCourses.push({
            ...course,
            per: sched.per,
            day: sched.day,
            periodStart: sched.periodStart,
            periodEnd: sched.periodEnd,
            room: course.listingRoom,
            quarter: quarter || course.listingQuarter,
          });
        }
      } else {
        // No schedule found anywhere
        expandedCourses.push({
          ...course,
          per: null,
          day: null,
          periodStart: null,
          periodEnd: null,
          room: detail.schedules[0]?.room || course.listingRoom || null,
          quarter: quarter || course.listingQuarter,
        });
      }
      successCount++;
    } catch (e) {
      console.error(`[SyllabusBulk] Detail ${course.code} failed:`, e.message);
    }
    await new Promise(r => setTimeout(r, 250));
  }
  scrapeProgress.set(progressKey, { total: deptCourses.length, done: successCount, phase: 'saving', current: '' });

  // Upsert into Supabase
  const sb = getSupabaseAdmin();
  const rows = expandedCourses.map(c => ({
    code: c.code,
    name: c.name || null,
    teacher: c.teacher || null,
    section: c.section || '',
    dept: deptKey,
    year,
    day: c.day || null,
    per: c.per || '',
    period_start: c.periodStart || null,
    period_end: c.periodEnd || null,
    room: c.room || null,
    building: extractBuilding(c.room) || null,
    quarter: c.quarter || null,
    syllabus_url: c.syllabusUrl,
    school: deptInfo.school,
    fetched_at: new Date().toISOString(),
  }));

  if (rows.length > 0) {
    // Delete old data for this dept+year before inserting fresh data
    const { error: delError } = await sb.from('syllabus_courses')
      .delete().eq('dept', deptKey).eq('year', year);
    if (delError) console.error(`[SyllabusBulk] DB delete failed:`, delError.message);

    // Insert fresh rows
    const { error } = await sb.from('syllabus_courses')
      .upsert(rows, { onConflict: 'code,year,syllabus_url,section,per' });
    if (error) console.error(`[SyllabusBulk] DB upsert failed:`, error.message);
  }

  scrapeProgress.delete(progressKey);
  console.log(`[SyllabusBulk] ${deptKey} ${year}: ${successCount}/${deptCourses.length} details fetched, ${rows.length} rows saved`);
  return { added: rows.length };
}

/**
 * Get all syllabus data from DB, with optional filters.
 */
export async function getSyllabusFromDB({ dept, year, quarter, day, search } = {}) {
  const sb = getSupabaseAdmin();
  const PAGE = 1000;
  let all = [];
  let from = 0;

  while (true) {
    let query = sb.from('syllabus_courses').select('*').order('dept').order('code').range(from, from + PAGE - 1);
    if (dept) query = query.eq('dept', dept);
    if (year) query = query.eq('year', year);
    if (quarter) query = query.eq('quarter', quarter);
    if (day) query = query.eq('day', day);
    if (search) query = query.or(`code.ilike.%${search}%,name.ilike.%${search}%`);

    const { data, error } = await query;
    if (error) throw error;
    if (!data || data.length === 0) break;
    all = all.concat(data);
    if (data.length < PAGE) break;
    from += PAGE;
  }

  return all;
}

/**
 * Get stats: count per dept+year.
 */
export async function getSyllabusStats() {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb.from('syllabus_courses').select('dept, year, school');
  if (error) throw error;

  const stats = {};
  for (const row of (data || [])) {
    const key = `${row.dept}_${row.year}`;
    if (!stats[key]) stats[key] = { dept: row.dept, year: row.year, school: row.school, count: 0 };
    stats[key].count++;
  }
  return stats;
}

/**
 * Return available department keys, labels, and years.
 */
export function getDeptList() {
  const depts = buildDeptPaths(SYLLABUS_YEARS[0]);
  return {
    years: SYLLABUS_YEARS,
    departments: Object.entries(depts).map(([key, info]) => ({
      key,
      label: info.label,
      school: info.school,
    })),
  };
}

/**
 * Lookup schedule data from DB for given course codes.
 * Used by the per-user scraper to avoid re-scraping.
 *
 * @param {string[]} codes - Course codes (e.g. ['MEC.C201', 'CSC.T243'])
 * @param {string} year - Academic year (e.g. '2026')
 * @returns {Array} DB rows with code, section, day, per, period_start, period_end, room, quarter
 */
export async function lookupScheduleFromDB(codes, year) {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from('syllabus_courses')
    .select('code, section, day, per, period_start, period_end, room, quarter')
    .in('code', codes)
    .eq('year', year);
  if (error) {
    console.error('[SyllabusBulk] DB lookup failed:', error.message);
    return [];
  }
  return data || [];
}
