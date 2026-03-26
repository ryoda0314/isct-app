import fs from 'node:fs';
import path from 'node:path';
import { DATA_DIR } from '../config.js';

const SYLLABUS_BASE = 'https://syllabus.s.isct.ac.jp';
const SYLLABUS_YEARS = ['2025', '2026'];
const BULK_CACHE_FILE = path.join(DATA_DIR, 'syllabus-all.json');
const CACHE_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days

/**
 * Build department listing paths for a given year.
 * Path structure differs slightly between undergrad (0-) categories.
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
    ENT:  { path: `/courses/${year}/7/0-907-0-110610-0`, label: 'アントレプレナーシップ', school: '教養' },

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

const FETCH_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'ja,en;q=0.5',
};

/**
 * Fetch a department listing page and extract course code, name, and syllabus URL.
 */
async function fetchDeptCourses(deptKey, deptPath) {
  const url = `${SYLLABUS_BASE}${deptPath}`;
  const resp = await fetch(url, { headers: FETCH_HEADERS, cache: 'no-store' });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  const html = await resp.text();

  const courses = [];
  const seen = new Set();
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

    if (seen.has(syllabusUrl)) continue;
    seen.add(syllabusUrl);

    // Extract Japanese course name: text after the code until "/" or English text
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

    courses.push({ code, name, syllabusUrl, dept: deptKey });
  }

  // Deduplicate by code (keep first occurrence)
  const byCode = {};
  for (const c of courses) {
    if (!byCode[c.code]) byCode[c.code] = c;
  }

  return Object.values(byCode);
}

/**
 * Fetch schedule details from an individual course syllabus page.
 */
async function fetchCourseDetail(syllabusUrl) {
  const resp = await fetch(syllabusUrl, { headers: FETCH_HEADERS });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  const html = await resp.text();
  const text = stripHtml(html);

  // Day + periods: 月1-4, 火5-8, etc.
  const schedMatch = text.match(/([月火水木金土日])\s*(\d{1,2})\s*[-–ー~]\s*(\d{1,2})/);

  // Room extraction
  let room = null;
  const roomText = text.replace(/([A-Z])\s+([A-Z]\d?-\d)/g, '$1$2');
  const roomLabelMatch = roomText.match(/(?:教室|講義室|実験室)[）)：:\s]*([A-Z][A-Za-z0-9\-]+(?:[（(][A-Z]\d{2,4}[）)])?)/);
  if (roomLabelMatch) {
    room = roomLabelMatch[1].replace(/[（）]/g, m => m === '（' ? '(' : ')');
  } else {
    const roomPatterns = roomText.match(/(M-[A-Z]?\d{1,3}(?:\([A-Z]\d{2,4}\))?|[A-Z]{2}\d?-\d{2,4}(?:\([A-Z]\d{2,4}\))?|[A-Z]\d-\d{2,4}(?:\([A-Z]\d{2,4}\))?|[MWSHEN]\d{3,4})/);
    if (roomPatterns) room = roomPatterns[1];
  }

  // Quarter
  const quarterMatch = text.match(/(\d)[-–]?(\d)?\s*Q/);
  let quarter = null;
  if (quarterMatch) {
    quarter = quarterMatch[2]
      ? `${quarterMatch[1]}-${quarterMatch[2]}Q`
      : `${quarterMatch[1]}Q`;
  }

  // Course name from detail page title (backup)
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
 * Load cached bulk syllabus data.
 */
export function getCachedSyllabus() {
  try {
    const raw = fs.readFileSync(BULK_CACHE_FILE, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * Fetch ALL syllabus data from all known departments.
 * Returns { courses, timestamp, depts }.
 */
export async function fetchAllSyllabus(force = false) {
  // Check cache
  if (!force) {
    const cached = getCachedSyllabus();
    if (cached && cached.timestamp && Date.now() - cached.timestamp < CACHE_TTL) {
      return cached;
    }
  }

  console.log('[SyllabusBulk] Starting full scrape...');
  const allCourses = [];
  const deptStats = {};

  for (const year of SYLLABUS_YEARS) {
    const yearPaths = buildDeptPaths(year);
    console.log(`[SyllabusBulk] ── ${year}年度 ──`);

    for (const [deptKey, deptInfo] of Object.entries(yearPaths)) {
      const statKey = `${deptKey}_${year}`;
      console.log(`[SyllabusBulk] Fetching ${deptKey} ${year} (${deptInfo.label})...`);
      let deptCourses;
      try {
        deptCourses = await fetchDeptCourses(deptKey, deptInfo.path);
      } catch (e) {
        console.error(`[SyllabusBulk] Dept ${deptKey} ${year} index failed:`, e.message);
        deptStats[statKey] = { label: deptInfo.label, school: deptInfo.school, year, count: 0, error: e.message };
        continue;
      }

      console.log(`[SyllabusBulk] ${deptKey} ${year}: found ${deptCourses.length} courses, fetching details...`);
      let successCount = 0;

      for (const course of deptCourses) {
        course.year = year;
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

        // Rate limiting
        await new Promise(r => setTimeout(r, 250));
      }

      allCourses.push(...deptCourses);
      deptStats[statKey] = { label: deptInfo.label, school: deptInfo.school, year, count: deptCourses.length, fetched: successCount };
      console.log(`[SyllabusBulk] ${deptKey} ${year}: ${successCount}/${deptCourses.length} details fetched`);
    }
  }

  const result = {
    timestamp: Date.now(),
    courses: allCourses,
    depts: deptStats,
  };

  // Save cache
  try {
    fs.mkdirSync(path.dirname(BULK_CACHE_FILE), { recursive: true });
    fs.writeFileSync(BULK_CACHE_FILE, JSON.stringify(result, null, 2));
  } catch (e) {
    console.error('[SyllabusBulk] Cache save failed:', e.message);
  }

  console.log(`[SyllabusBulk] Done. Total: ${allCourses.length} courses`);
  return result;
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
