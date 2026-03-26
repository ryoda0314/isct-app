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

    // Extract Japanese course name
    let name = null;
    const afterCode = ctx.split(code).slice(1).join(code).trim();
    if (afterCode) {
      const namePart = afterCode.split(/\s*\/\s*/)[0].trim();
      name = namePart
        .replace(/【[^】]*】/g, '')
        .replace(/\([^)]*\)/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 60);
      if (!name || name.length < 2) name = null;
    }

    if (!byCode[code]) byCode[code] = [];
    byCode[code].push({ syllabusUrl, ctx, name });
  }

  // Phase 2: Build entries with section detection
  const result = [];
  const seenKeys = new Set();

  for (const [code, group] of Object.entries(byCode)) {
    // Default entry (no section) — first occurrence
    result.push({ code, name: group[0].name, syllabusUrl: group[0].syllabusUrl, dept: deptKey, section: null });
    seenKeys.add(`${code}:`);

    // Section-specific entries
    for (const entry of group) {
      const sec = detectSection(entry.ctx, code);
      if (sec) {
        const key = `${code}:${sec}`;
        if (!seenKeys.has(key)) {
          seenKeys.add(key);
          result.push({ code, name: entry.name, syllabusUrl: entry.syllabusUrl, dept: deptKey, section: sec });
        }
      }
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

  const schedMatch = text.match(/([月火水木金土日])\s*(\d{1,2})\s*[-–ー~]\s*(\d{1,2})/);

  let room = null;
  const roomText = text.replace(/([A-Z])\s+([A-Z]\d?-\d)/g, '$1$2');
  const roomLabelMatch = roomText.match(/(?:教室|講義室|実験室)[）)：:\s]*([A-Z][A-Za-z0-9\-]+(?:[（(][A-Z]\d{2,4}[）)])?)/);
  if (roomLabelMatch) {
    room = roomLabelMatch[1].replace(/[（）]/g, m => m === '（' ? '(' : ')');
  } else {
    const roomPatterns = roomText.match(/(M-[A-Z]?\d{1,3}(?:\([A-Z]\d{2,4}\))?|[A-Z]{2}\d?-\d{2,4}(?:\([A-Z]\d{2,4}\))?|[A-Z]\d-\d{2,4}(?:\([A-Z]\d{2,4}\))?|[MWSHEN]\d{3,4})/);
    if (roomPatterns) room = roomPatterns[1];
  }

  const quarterMatch = text.match(/(\d)[-–]?(\d)?\s*Q/);
  let quarter = null;
  if (quarterMatch) {
    quarter = quarterMatch[2]
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

  return {
    per: schedMatch ? `${schedMatch[1]}${schedMatch[2]}-${schedMatch[3]}` : null,
    day: schedMatch ? schedMatch[1] : null,
    periodStart: schedMatch ? parseInt(schedMatch[2]) : null,
    periodEnd: schedMatch ? parseInt(schedMatch[3]) : null,
    room,
    quarter,
    detailName,
  };
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

  console.log(`[SyllabusBulk] Fetching ${deptKey} ${year} (${deptInfo.label})...`);

  const deptCourses = await fetchDeptCourses(deptKey, deptInfo.path);

  console.log(`[SyllabusBulk] ${deptKey} ${year}: found ${deptCourses.length} courses, fetching details...`);
  let successCount = 0;

  for (const course of deptCourses) {
    try {
      const detail = await fetchCourseDetail(course.syllabusUrl);
      if (!course.name && detail.detailName) {
        course.name = detail.detailName;
      }
      Object.assign(course, {
        per: detail.per,
        day: detail.day,
        periodStart: detail.periodStart,
        periodEnd: detail.periodEnd,
        room: detail.room,
        quarter: detail.quarter,
      });
      successCount++;
    } catch (e) {
      console.error(`[SyllabusBulk] Detail ${course.code} failed:`, e.message);
    }
    await new Promise(r => setTimeout(r, 250));
  }

  // Upsert into Supabase
  const sb = getSupabaseAdmin();
  const rows = deptCourses.map(c => ({
    code: c.code,
    name: c.name || null,
    section: c.section || null,
    dept: deptKey,
    year,
    day: c.day || null,
    per: c.per || null,
    period_start: c.periodStart || null,
    period_end: c.periodEnd || null,
    room: c.room || null,
    quarter: c.quarter || null,
    syllabus_url: c.syllabusUrl,
    school: deptInfo.school,
    fetched_at: new Date().toISOString(),
  }));

  if (rows.length > 0) {
    // Delete old rows for this dept+year, then insert fresh
    await sb.from('syllabus_courses').delete().eq('dept', deptKey).eq('year', year);
    const { error } = await sb.from('syllabus_courses').insert(rows);
    if (error) console.error(`[SyllabusBulk] DB insert failed:`, error.message);
  }

  console.log(`[SyllabusBulk] ${deptKey} ${year}: ${successCount}/${deptCourses.length} details fetched, ${rows.length} rows saved`);
  return { added: rows.length };
}

/**
 * Get all syllabus data from DB, with optional filters.
 */
export async function getSyllabusFromDB({ dept, year, quarter, day, search, limit = 1000 } = {}) {
  const sb = getSupabaseAdmin();
  let query = sb.from('syllabus_courses').select('*').order('dept').order('code').limit(limit);
  if (dept) query = query.eq('dept', dept);
  if (year) query = query.eq('year', year);
  if (quarter) query = query.eq('quarter', quarter);
  if (day) query = query.eq('day', day);
  if (search) query = query.or(`code.ilike.%${search}%,name.ilike.%${search}%`);

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
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
