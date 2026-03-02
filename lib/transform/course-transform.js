const COLOR_PALETTE = [
  '#6375f0', '#e5534b', '#3dae72', '#d4843e', '#a855c7',
  '#2d9d8f', '#c75d8e', '#c6a236', '#61afef', '#e06c75',
  '#98c379', '#c678dd', '#d19a66', '#56b6c2'
];

const DAY_MAP = { '月': 0, '火': 1, '水': 2, '木': 3, '金': 4 };

/**
 * Extract course code (e.g. "CSC.T243") from Moodle shortname.
 */
function extractCourseCode(shortname) {
  const match = shortname.match(/[A-Z]{2,4}\.[A-Z]\d{3}/);
  return match ? match[0] : shortname;
}

/**
 * Parse period ("月3-4") and room ("W631") from course text fields.
 */
function parsePeriodRoom(fullname, summary) {
  const text = `${fullname} ${summary || ''}`;
  const perMatch = text.match(/([月火水木金])\s*(\d{1,2})\s*[–\-ー]\s*(\d{1,2})/);
  const roomMatch = text.match(/([A-Z]\d{3}|[A-Z]\d{2,3}[A-Z]?\d*)/);

  return {
    per: perMatch ? `${perMatch[1]}${perMatch[2]}-${perMatch[3]}` : null,
    room: roomMatch ? roomMatch[1] : null,
    dayIndex: perMatch ? DAY_MAP[perMatch[1]] ?? null : null,
    periodStart: perMatch ? parseInt(perMatch[2]) : null
  };
}

/**
 * Detect quarter from Moodle course metadata.
 */
function detectQuarter(shortname, fullname) {
  const text = `${shortname} ${fullname}`;
  const match = text.match(/(\d)\s*[QqＱ]/);
  if (match) return parseInt(match[1]);

  // Fallback: guess from current month
  const month = new Date().getMonth() + 1;
  if (month >= 4 && month <= 5) return 1;
  if (month >= 6 && month <= 7) return 2;
  if (month >= 10 && month <= 11) return 3;
  if (month >= 12 || month <= 1) return 4;
  return 2;
}

/**
 * Transform Moodle courses to campus-sns format.
 *
 * Moodle: {id, shortname, fullname, enrolledusercount, summary, visible, ...}
 * campus-sns: {id, moodleId, code, name, per, room, col, mem, quarter}
 *
 * @param {Array} moodleCourses - Raw Moodle course objects
 * @param {Object} [scheduleMap] - Optional map of courseCode → {per, room, quarter} from syllabus scraper
 */
export function transformCourses(moodleCourses, scheduleMap = {}) {
  return moodleCourses
    .filter(mc => mc.visible !== 0)
    .map((mc, index) => {
      const code = extractCourseCode(mc.shortname);

      // Extract section from fullname (e.g. 【B】→"B", 【14-RW】→"14-RW")
      const secMatch = mc.fullname.match(/【([^】]+)】/);
      const section = secMatch ? secMatch[1] : null;

      // Section-aware schedule lookup (A and B may differ)
      const syllabus = (section && scheduleMap[`${code}:${section}`])
        || scheduleMap[code] || {};

      // Prefer syllabus data over Moodle fullname parsing
      const { per: moodlePer, room: moodleRoom } = parsePeriodRoom(mc.fullname, mc.summary);
      const per = syllabus.per || moodlePer;
      const room = syllabus.room || moodleRoom;

      // Quarter: prefer syllabus, then Moodle heuristic
      let quarter;
      if (syllabus.quarter) {
        const qm = syllabus.quarter.match(/(\d)/);
        quarter = qm ? parseInt(qm[1]) : detectQuarter(mc.shortname, mc.fullname);
      } else {
        quarter = detectQuarter(mc.shortname, mc.fullname);
      }

      // Clean name: remove year prefix, section markers, English translation
      let name = mc.fullname
        .replace(/\s*\/\s*[A-Za-z].*$/, '')  // remove English name after /
        .replace(/\s*\(?\d{4}.*$/, '')
        .replace(/^\d{4}_?\d?[QqＱ]_?/, '')
        .replace(/【[^】]*】/g, '')           // remove section markers
        .trim();

      // Append section to name for disambiguation (e.g. "機械系基礎実験" → "機械系基礎実験 B")
      if (section) name = `${name} ${section}`;

      return {
        id: `mc_${mc.id}`,
        moodleId: mc.id,
        code,
        name,
        per: per || '未設定',
        room: room || '未設定',
        col: COLOR_PALETTE[index % COLOR_PALETTE.length],
        mem: mc.enrolledusercount || 0,
        quarter,
        periodStart: syllabus.periodStart || null,
        periodEnd: syllabus.periodEnd || null,
      };
    });
}

/**
 * Group courses by quarter.
 */
export function groupByQuarter(courses) {
  const quarters = { 1: [], 2: [], 3: [], 4: [] };
  for (const c of courses) {
    const q = c.quarter || 2;
    if (quarters[q]) quarters[q].push(c);
  }
  return quarters;
}
