import fs from 'node:fs';
import path from 'node:path';
import { DATA_DIR, LMS_YEAR } from '../config.js';

const SYLLABUS_BASE = 'https://syllabus.s.isct.ac.jp';
const BULK_CACHE_FILE = path.join(DATA_DIR, 'syllabus-all.json');
const CACHE_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days

// All known department listing paths on the syllabus site
const ALL_DEPT_PATHS = {
  MEC:  { path: `/courses/${LMS_YEAR}/2/0-902-321500-0-0`, label: '機械系' },
  LAE:  { path: `/courses/${LMS_YEAR}/7/0-907-0-110200-0`, label: '英語' },
  LAL:  { path: `/courses/${LMS_YEAR}/7/0-907-0-110300-0`, label: '第二外国語' },
  LAH:  { path: `/courses/${LMS_YEAR}/7/0-907-0-110100-0`, label: '人文社会系' },
  ENT:  { path: `/courses/${LMS_YEAR}/7/0-907-0-110610-0`, label: 'キャリア' },
  DSA:  { path: `/courses/${LMS_YEAR}/0/1-981-400037-0-0`, label: 'データサイエンス' },
};

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
      // Take text until "/" (English separator), or limit to first ~40 chars
      const namePart = afterCode.split(/\s*\/\s*/)[0].trim();
      // Clean: remove section markers, extra whitespace
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

  // Course name from detail page (backup)
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

  for (const [deptKey, deptInfo] of Object.entries(ALL_DEPT_PATHS)) {
    console.log(`[SyllabusBulk] Fetching ${deptKey} (${deptInfo.label})...`);
    let deptCourses;
    try {
      deptCourses = await fetchDeptCourses(deptKey, deptInfo.path);
    } catch (e) {
      console.error(`[SyllabusBulk] Dept ${deptKey} index failed:`, e.message);
      deptStats[deptKey] = { label: deptInfo.label, count: 0, error: e.message };
      continue;
    }

    console.log(`[SyllabusBulk] ${deptKey}: found ${deptCourses.length} courses, fetching details...`);
    let successCount = 0;

    for (const course of deptCourses) {
      try {
        const detail = await fetchCourseDetail(course.syllabusUrl);
        // Use detail page name as fallback if listing name is missing
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
    deptStats[deptKey] = { label: deptInfo.label, count: deptCourses.length, fetched: successCount };
    console.log(`[SyllabusBulk] ${deptKey}: ${successCount}/${deptCourses.length} details fetched`);
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
 * Return available department keys and labels.
 */
export function getDeptList() {
  return Object.entries(ALL_DEPT_PATHS).map(([key, info]) => ({
    key,
    label: info.label,
  }));
}
