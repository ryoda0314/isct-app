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
    DSA:  { path: `/courses/${year}/0/1-981-400037-0-0`, label: 'データサイエンス・AI', school: 'その他' },
  };
}

function stripHtml(html) {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ').trim();
}

/**
 * Detect section identifier from context text near a syllabus link.
 * Handles: 【B】brackets, numbered sections (14-RW, S16),
 * and single-letter sections after CJK text (実験A, 実験 A, 実験Ａ).
 */
function detectSection(ctx, code) {
  const escaped = code.replace('.', '\\.');

  // Pattern 1: Section in 【】 brackets (e.g. 【14-RW】, 【S16】, 【B】)
  const bracket = ctx.match(new RegExp(escaped + '[\\s\\S]*?【([^】]+)】'));
  if (bracket) return bracket[1];

  // Pattern 2: Numbered section after whitespace (14-RW, S16, B1)
  const numbered = ctx.match(new RegExp(
    escaped + '.*?(?:】|\\s)([A-Z]?\\d{1,3}(?:-[A-Z]{1,4})?)'
  ));
  if (numbered) return numbered[1];

  // Pattern 3: Single letter after CJK character (実験A, 実験 A, 実験Ａ)
  const cjkLetter = ctx.match(new RegExp(
    escaped + '[\\s\\S]*?[\\u3000-\\u9FFF\\uF900-\\uFAFF]\\s*([A-Z\uFF21-\uFF3A])(?=[\\s,、。.]|$)'
  ));
  if (cjkLetter) {
    const ch = cjkLetter[1];
    if (ch.charCodeAt(0) >= 0xFF21 && ch.charCodeAt(0) <= 0xFF3A) {
      return String.fromCharCode(ch.charCodeAt(0) - 0xFF21 + 0x41);
    }
    return ch;
  }

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
 */
async function fetchDeptCourses(deptKey, deptPath) {
  const url = `${SYLLABUS_BASE}${deptPath}`;
  const resp = await fetch(url, { headers: FETCH_HEADERS, cache: 'no-store' });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  const html = await resp.text();

  // Phase 1: Collect all links grouped by code
  const byCode = {};
  const seenUrls = new Set();
  const linkPattern = /href="((?:https?:\/\/[^"]*)?\/courses\/\d{4}\/[^"]*\/(\d{6,}))"/g;
  let m;

  while ((m = linkPattern.exec(html)) !== null) {
    const syllabusPath = m[1];
    const start = Math.max(0, m.index - 800);
    const end = Math.min(html.length, m.index + 800);
    const ctx = stripHtml(html.slice(start, end));

    const codeMatch = ctx.match(/([A-Z]{2,4}\.[A-Z]\d{3})/);
    if (!codeMatch) continue;

    const code = codeMatch[1];
    const syllabusUrl = syllabusPath.startsWith('http')
      ? syllabusPath
      : `${SYLLABUS_BASE}${syllabusPath}`;

    if (seenUrls.has(syllabusUrl)) continue;
    seenUrls.add(syllabusUrl);

    // Extract Japanese course name and teacher from listing text
    // Pattern: "科目コード 科目名 教員名 学系 年度 クォーター 年度"
    let name = null;
    let teacher = null;
    const afterCode = ctx.split(code).slice(1).join(code).trim();
    if (afterCode) {
      const namePart = afterCode.split(/\s*\/\s*/)[0].trim()
        .replace(/【[^】]*】/g, '')
        .replace(/\([^)]*\)/g, '')
        .replace(/\s+/g, ' ')
        .trim();

      // Split by known suffixes: 学系名(XX系), 年度(2025), クォーター(1Q etc)
      const deptYearMatch = namePart.match(/\s+(?:[^\s]*系|理学院|工学院|物質理工学院|情報理工学院|生命理工学院|環境・社会理工学院|リベラルアーツ研究教育院)\s+\d{4}/);
      const contentPart = deptYearMatch
        ? namePart.slice(0, deptYearMatch.index).trim()
        : namePart.slice(0, 60);

      if (contentPart) {
        // Try to separate "科目名 教員名" — teacher is usually last 2-4 chars (Japanese name)
        // Pattern: teacher name is CJK characters at the end, separated by space
        // e.g. "マイクロ・ナノ加工基礎 金 俊完" → name="マイクロ・ナノ加工基礎", teacher="金 俊完"
        // e.g. "有限要素法 荒木 稚子" → name="有限要素法", teacher="荒木 稚子"
        // e.g. "機械系基礎実験 A 各 教員" → name="機械系基礎実験 A", teacher="各 教員"
        const teacherMatch = contentPart.match(/^(.+?)\s+((?:各\s*教員|[^\s]{1,4}\s+[^\s]{1,4}))$/);
        if (teacherMatch) {
          name = teacherMatch[1].trim().slice(0, 60);
          teacher = teacherMatch[2].trim();
        } else {
          name = contentPart.slice(0, 60);
        }
      }
      if (!name || name.length < 2) name = null;
    }

    if (!byCode[code]) byCode[code] = [];
    byCode[code].push({ syllabusUrl, ctx, name, teacher });
  }

  // Phase 2: Build entries with section detection
  const result = [];

  for (const [code, group] of Object.entries(byCode)) {
    // First pass: detect sections for each entry
    const sectionEntries = [];
    const seenSections = new Set();

    for (const entry of group) {
      const sec = detectSection(entry.ctx, code);
      const sectionKey = sec || '';
      if (!seenSections.has(sectionKey)) {
        seenSections.add(sectionKey);
        sectionEntries.push({ ...entry, section: sec });
      }
    }

    // If any entry has a detected section, keep only section-specific entries
    const hasSections = sectionEntries.some(e => e.section);
    for (const entry of sectionEntries) {
      if (hasSections && !entry.section) continue; // skip generic entry when sections exist
      result.push({ code, name: entry.name, teacher: entry.teacher, syllabusUrl: entry.syllabusUrl, dept: deptKey, section: entry.section });
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
  const schedPattern = /([月火水木金土日])\s*(\d{1,2})\s*[-–ー~]\s*(\d{1,2})/g;
  // Room pattern: handles nested parens like (M-B07(H101)) and simple (S4-201)
  const roomPattern = /\(\s*([A-Z][A-Za-z0-9\-]*(?:\([A-Z][A-Za-z0-9]*\))?)\s*\)/;
  const schedules = [];
  let schedM;

  while ((schedM = schedPattern.exec(text)) !== null) {
    const afterMatch = text.slice(schedM.index + schedM[0].length, schedM.index + schedM[0].length + 80);
    const roomM = afterMatch.match(roomPattern);
    let room = roomM ? roomM[1] : null;
    schedules.push({
      day: schedM[1],
      per: `${schedM[1]}${schedM[2]}-${schedM[3]}`,
      periodStart: parseInt(schedM[2]),
      periodEnd: parseInt(schedM[3]),
      room,
    });
  }

  // Fallback room detection if no room found in schedule slots
  if (schedules.length > 0 && schedules.every(s => !s.room)) {
    const roomText = text.replace(/([A-Z])\s+([A-Z]\d?-\d)/g, '$1$2');
    const roomLabelMatch = roomText.match(/(?:教室|講義室|実験室)[）)：:\s]*([A-Z][A-Za-z0-9\-]+(?:[（(][A-Z]\d{2,4}[）)])?)/);
    let fallbackRoom = null;
    if (roomLabelMatch) {
      fallbackRoom = roomLabelMatch[1].replace(/[（）]/g, m => m === '（' ? '(' : ')');
    } else {
      const rp = roomText.match(/(M-[A-Z]?\d{1,3}(?:\([A-Z]\d{2,4}\))?|[A-Z]{2}\d?-\d{2,4}(?:\([A-Z]\d{2,4}\))?|[A-Z]\d-\d{2,4}(?:\([A-Z]\d{2,4}\))?|[MWSHEN]\d{3,4})/);
      if (rp) fallbackRoom = rp[1];
    }
    if (fallbackRoom) schedules.forEach(s => s.room = fallbackRoom);
  }

  // Single schedule fallback (no match)
  if (schedules.length === 0) {
    let room = null;
    const roomText = text.replace(/([A-Z])\s+([A-Z]\d?-\d)/g, '$1$2');
    const roomLabelMatch = roomText.match(/(?:教室|講義室|実験室)[）)：:\s]*([A-Z][A-Za-z0-9\-]+(?:[（(][A-Z]\d{2,4}[）)])?)/);
    if (roomLabelMatch) {
      room = roomLabelMatch[1].replace(/[（）]/g, m => m === '（' ? '(' : ')');
    } else {
      const rp = roomText.match(/(M-[A-Z]?\d{1,3}(?:\([A-Z]\d{2,4}\))?|[A-Z]{2}\d?-\d{2,4}(?:\([A-Z]\d{2,4}\))?|[A-Z]\d-\d{2,4}(?:\([A-Z]\d{2,4}\))?|[MWSHEN]\d{3,4})/);
      if (rp) room = rp[1];
    }
    schedules.push({ day: null, per: null, periodStart: null, periodEnd: null, room });
  }

  const quarterMatch = text.match(/(\d)\s*[-–～〜~]?\s*(\d)?\s*Q/);
  let quarter = null;
  if (quarterMatch) {
    quarter = quarterMatch[2] && quarterMatch[2] !== quarterMatch[1]
      ? `${quarterMatch[1]}-${quarterMatch[2]}Q`
      : `${quarterMatch[1]}Q`;
  }

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
      // Expand: one entry per schedule slot
      for (const sched of detail.schedules) {
        expandedCourses.push({
          ...course,
          per: sched.per,
          day: sched.day,
          periodStart: sched.periodStart,
          periodEnd: sched.periodEnd,
          room: sched.room,
          quarter: detail.quarter,
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
    quarter: c.quarter || null,
    syllabus_url: c.syllabusUrl,
    school: deptInfo.school,
    fetched_at: new Date().toISOString(),
  }));

  if (rows.length > 0) {
    // Upsert: on conflict (code, year, syllabus_url, section) update all fields
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
