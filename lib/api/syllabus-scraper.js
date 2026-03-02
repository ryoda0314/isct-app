import fs from 'node:fs';
import path from 'node:path';
import { DATA_DIR, LMS_YEAR } from '../config.js';

const SYLLABUS_BASE = 'https://syllabus.s.isct.ac.jp';
const CACHE_FILE = path.join(DATA_DIR, 'syllabus-cache.json');
const CACHE_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days

// Course code prefix → department listing path on syllabus site
const DEPT_PATHS = {
  'MEC': `/courses/${LMS_YEAR}/2/0-902-321500-0-0`,
  'LAE': `/courses/${LMS_YEAR}/7/0-907-0-110200-0`,
  'LAL': `/courses/${LMS_YEAR}/7/0-907-0-110300-0`,
  'LAH': `/courses/${LMS_YEAR}/7/0-907-0-110100-0`,
  'ENT': `/courses/${LMS_YEAR}/7/0-907-0-110610-0`,
  'DSA': `/courses/${LMS_YEAR}/0/1-981-400037-0-0`,
  'MEC.I': `/courses/${LMS_YEAR}/2/0-902-321500-0-0`,
  'MEC.P': `/courses/${LMS_YEAR}/2/0-902-321500-0-0`,
};

let cache = null;

function loadCache() {
  if (cache) return cache;
  try {
    const raw = fs.readFileSync(CACHE_FILE, 'utf-8');
    const data = JSON.parse(raw);
    if (data.timestamp && Date.now() - data.timestamp < CACHE_TTL) {
      cache = data;
      return cache;
    }
  } catch {}
  cache = { timestamp: 0, courses: {} };
  return cache;
}

function saveCache() {
  try {
    cache.timestamp = Date.now();
    fs.mkdirSync(path.dirname(CACHE_FILE), { recursive: true });
    fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2));
  } catch (e) {
    console.error('[Syllabus] Cache save failed:', e.message);
  }
}

/**
 * Strip HTML tags and decode entities.
 */
function stripHtml(html) {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
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
  // Must be followed by whitespace/punctuation (not dash/digit, to exclude room patterns like M-124)
  const cjkLetter = ctx.match(new RegExp(
    escaped + '[\\s\\S]*?[\\u3000-\\u9FFF\\uF900-\\uFAFF]\\s*([A-Z\uFF21-\uFF3A])(?=[\\s,、。.]|$)'
  ));
  if (cjkLetter) {
    const ch = cjkLetter[1];
    // Convert fullwidth (Ａ-Ｚ) to halfwidth (A-Z)
    if (ch.charCodeAt(0) >= 0xFF21 && ch.charCodeAt(0) <= 0xFF3A) {
      return String.fromCharCode(ch.charCodeAt(0) - 0xFF21 + 0x41);
    }
    return ch;
  }

  return null;
}

/**
 * Fetch a department page and build a mapping: courseCode → syllabusUrl.
 * For courses with sections (like LAE.E211 14-RW or MEC.P211 A/B),
 * returns entries keyed by "CODE:section" (e.g. "LAE.E211:14-RW", "MEC.P211:B").
 */
async function fetchDepartmentIndex(deptPath) {
  const url = `${SYLLABUS_BASE}${deptPath}`;
  console.log(`[Syllabus] Fetching department: ${url}`);

  const resp = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'ja,en;q=0.5',
    },
    cache: 'no-store',
  });
  console.log(`[Syllabus] Department response: ${resp.status} ${resp.statusText}, content-type: ${resp.headers.get('content-type')}`);
  if (!resp.ok) throw new Error(`HTTP ${resp.status} ${resp.statusText}`);
  const html = await resp.text();
  console.log(`[Syllabus] Department HTML length: ${html.length} chars`);
  console.log(`[Syllabus] HTML snippet: ${html.slice(0, 500).replace(/\n/g, ' ')}`);

  // Phase 1: Collect all (code, url, context) grouped by code
  const byCode = {};
  const linkPattern = /href="((?:https?:\/\/[^"]*)?\/courses\/\d{4}\/[^"]*\/(\d{6,}))"/g;
  let m;
  let linkCount = 0;
  while ((m = linkPattern.exec(html)) !== null) {
    linkCount++;
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

    if (!byCode[code]) byCode[code] = [];
    if (!byCode[code].some(e => e.url === syllabusUrl)) {
      byCode[code].push({ url: syllabusUrl, ctx });
    }
  }

  // Phase 2: Detect sections and build entries map
  const entries = {};
  for (const [code, group] of Object.entries(byCode)) {
    entries[code] = group[0].url; // default: first URL
    for (const e of group) {
      const sec = detectSection(e.ctx, code);
      if (sec) {
        entries[`${code}:${sec}`] = e.url;
      }
    }
  }

  console.log(`[Syllabus] Found ${linkCount} links, ${Object.keys(entries).length} course entries from ${deptPath}`);
  if (linkCount === 0) {
    console.log(`[Syllabus] No links found. HTML sample (1000 chars): ${html.slice(0, 1000).replace(/\n/g, ' ')}`);
  }
  return entries;
}

/**
 * Fetch an individual course syllabus page and extract schedule data.
 */
async function fetchCourseDetail(syllabusUrl) {
  const resp = await fetch(syllabusUrl, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; campus-sns/1.0)' }
  });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  const html = await resp.text();
  const text = stripHtml(html);

  // Extract day + periods: 月1-4, 火5-8, 水3-4, etc.
  const schedMatch = text.match(/([月火水木金土日])\s*(\d{1,2})\s*[-–ー~]\s*(\d{1,2})/);

  // Extract room/classroom - look near "教室" label or common room patterns
  let room = null;
  // Try structured: after "教室" label
  const roomLabelMatch = text.match(/教室[：:\s]*([A-Z][A-Za-z0-9\-]+(?:\([A-Z]\d{2,3}\))?)/);
  if (roomLabelMatch) {
    room = roomLabelMatch[1];
  } else {
    // Try common ISCT room patterns: M-B07(H101), W631, S011, H121
    const roomPatterns = text.match(/([A-Z]-[A-Z]?\d{2,3}(?:\([A-Z]\d{2,3}\))?|[MWSH]\d{3})/);
    if (roomPatterns) room = roomPatterns[1];
  }

  // Extract quarter: 1Q, 2Q, 3Q, 4Q, 1-2Q, etc.
  const quarterMatch = text.match(/(\d)[-–]?(\d)?\s*Q/);
  let quarter = null;
  if (quarterMatch) {
    quarter = quarterMatch[2]
      ? `${quarterMatch[1]}-${quarterMatch[2]}Q`
      : `${quarterMatch[1]}Q`;
  }

  return {
    per: schedMatch ? `${schedMatch[1]}${schedMatch[2]}-${schedMatch[3]}` : null,
    day: schedMatch ? schedMatch[1] : null,
    periodStart: schedMatch ? parseInt(schedMatch[2]) : null,
    periodEnd: schedMatch ? parseInt(schedMatch[3]) : null,
    room,
    quarter,
  };
}

/**
 * Extract section from Moodle fullname.
 * e.g. "英語第五【14-RW】 / English 5【14-RW】" → "14-RW"
 * e.g. "スペイン語初級１【S16】 / ..." → "S16"
 */
function extractSection(fullname) {
  const m = fullname.match(/【([^】]+)】/);
  return m ? m[1] : null;
}

/**
 * Get the department path for a course code.
 */
function getDeptPath(code) {
  const prefix = code.split('.')[0]; // MEC, LAE, LAH, etc.
  return DEPT_PATHS[code] || DEPT_PATHS[prefix] || null;
}

/**
 * Main entry: fetch schedule data for Moodle courses.
 *
 * @param {Array} moodleCourses - Raw Moodle course objects with {shortname, fullname}
 * @returns {Object} Map of courseCode → {per, day, periodStart, periodEnd, room, quarter}
 */
export async function fetchScheduleForCourses(moodleCourses) {
  console.log(`[Syllabus] fetchScheduleForCourses called with ${moodleCourses.length} courses`);
  console.log(`[Syllabus] Sample shortnames:`, moodleCourses.slice(0, 3).map(mc => mc.shortname));

  const c = loadCache();
  const result = {};
  const toFetch = []; // {code, section, fullname}

  // Extract course codes and check cache
  for (const mc of moodleCourses) {
    const codeMatch = mc.shortname.match(/([A-Z]{2,4}\.[A-Z]\d{3})/);
    if (!codeMatch) {
      console.log(`[Syllabus] No code in shortname: "${mc.shortname}"`);
      continue;
    }
    const code = codeMatch[1];
    const section = extractSection(mc.fullname);
    const cacheKey = section ? `${code}:${section}` : code;

    if (c.courses[cacheKey]) {
      if (section) result[`${code}:${section}`] = c.courses[cacheKey];
      result[code] = c.courses[cacheKey];
    } else if (c.courses[code]) {
      result[code] = c.courses[code];
    } else {
      toFetch.push({ code, section, fullname: mc.fullname });
    }
  }

  if (toFetch.length === 0) {
    console.log(`[Syllabus] All ${moodleCourses.length} courses found in cache`);
    return result;
  }

  console.log(`[Syllabus] ${toFetch.length} courses need schedule lookup...`);

  // Group by department
  const deptGroups = {};
  for (const item of toFetch) {
    const deptPath = getDeptPath(item.code);
    if (!deptPath) {
      console.log(`[Syllabus] No dept mapping for ${item.code}`);
      continue;
    }
    if (!deptGroups[deptPath]) deptGroups[deptPath] = [];
    deptGroups[deptPath].push(item);
  }

  // Fetch each department index and then individual course pages
  for (const [deptPath, items] of Object.entries(deptGroups)) {
    let deptIndex;
    try {
      deptIndex = await fetchDepartmentIndex(deptPath);
    } catch (e) {
      console.error(`[Syllabus] Dept fetch failed (${deptPath}):`, e.message);
      continue;
    }

    for (const item of items) {
      // Try to find syllabus URL: first with section, then without
      let syllabusUrl = null;
      if (item.section) {
        syllabusUrl = deptIndex[`${item.code}:${item.section}`];
      }
      if (!syllabusUrl) {
        syllabusUrl = deptIndex[item.code];
      }

      if (!syllabusUrl) {
        console.log(`[Syllabus] Course ${item.code} not found in dept index`);
        continue;
      }

      try {
        const schedule = await fetchCourseDetail(syllabusUrl);
        const cacheKey = item.section ? `${item.code}:${item.section}` : item.code;
        if (item.section) {
          result[`${item.code}:${item.section}`] = schedule;
        }
        result[item.code] = schedule;
        c.courses[cacheKey] = schedule;
        c.courses[item.code] = schedule; // also cache by base code
        console.log(`[Syllabus] ${item.code}: ${schedule.per || '集中'} / ${schedule.room || '?'} / ${schedule.quarter || '?'}`);
      } catch (e) {
        console.error(`[Syllabus] Detail fetch failed (${item.code}):`, e.message);
      }

      // Be polite to the server
      await new Promise(r => setTimeout(r, 300));
    }
  }

  saveCache();
  console.log(`[Syllabus] Schedule data fetched for ${Object.keys(result).length} courses`);
  return result;
}
