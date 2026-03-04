const COLOR_PALETTE = [
  '#6375f0', '#e5534b', '#3dae72', '#d4843e', '#a855c7',
  '#2d9d8f', '#c75d8e', '#c6a236', '#61afef', '#e06c75',
  '#98c379', '#c678dd', '#d19a66', '#56b6c2'
];

const DAY_MAP = { '月': 0, '火': 1, '水': 2, '木': 3, '金': 4 };

// 教室コード → キャンパス建物ID (SPOTS.id と対応)
// WL1-201→wl1, SL-201→sl, SE3-105→se3, NE2-401→ne2
// S2-201→s2, W5-31→w5 / 旧形式: S222→s2, W241→w2
// M- → 全て本館 (main / main_lec)
function roomToBuildingId(room) {
  if (!room || room === '未設定') return null;
  let m;
  // 複合建物コード: WL1, WL2, SL, SE1-5, NE1-8, IE1
  m = room.match(/^(WL|SL|SE|NE|IE)(\d?)-/);
  if (m) return `${m[1].toLowerCase()}${m[2]}`;
  // 新形式: W2-41, S2-201, I1-256, I3-203
  m = room.match(/^([WSEI])(\d)-/);
  if (m) { const p = {W:'w',S:'s',E:'e',I:'i'}[m[1]]; return p ? `${p}${m[2]}` : null; }
  // M- → 全て本館 (M-278(H121), M-B07(H101), M-358, M-124, M-156(H1103))
  if (/^M-/.test(room)) return /\(H/.test(room) ? 'main_lec' : 'main';
  // 旧形式: W241, S222, E201
  m = room.match(/^([WSEI])(\d)\d{2}$/);
  if (m) { const p = {W:'w',S:'s',E:'e',I:'i'}[m[1]]; return p ? `${p}${m[2]}` : null; }
  // H + 3-4桁 → 本館 (H203, H1103)
  if (/^H\d{3,4}$/.test(room)) return 'main';
  // N-xx → 北1号館
  if (/^N-/.test(room)) return 'n1';
  // 日本語建物名: "石川台1号館..."→i1, "西3号館..."→w3, "南2号館..."→s2
  m = room.match(/^(?:石川台|石)(\d)号館/); if (m) return `i${m[1]}`;
  m = room.match(/^西(\d)号館/); if (m) return `w${m[1]}`;
  m = room.match(/^南(\d)号館/); if (m) return `s${m[1]}`;
  return null;
}

// 教室コード → 建物名ラベル (人が読める形式)
// M-B07→本館B1F, M-278→本館2F, WL1-301→西講義棟1, S2-203→南2号館
function roomToLabel(room) {
  if (!room || room === '未設定') return null;
  let m;
  // M-B... → 本館B1F
  if (/^M-B/.test(room)) return '本館B1F';
  // M-数字... → 本館xF (M-278→2F, M-124→1F, M-358→3F)
  m = room.match(/^M-(\d)/);
  if (m) return `本館${m[1]}F`;
  // WL → 西講義棟
  m = room.match(/^WL(\d)/);
  if (m) return `西講義棟${m[1]}`;
  // SL → 南講義棟
  if (/^SL-/.test(room)) return '南講義棟';
  // SE → 南実験棟
  m = room.match(/^SE(\d)/);
  if (m) return `南実験棟${m[1]}`;
  // NE → 北実験棟
  m = room.match(/^NE(\d)/);
  if (m) return `北実験棟${m[1]}`;
  // IE → 石川台実験棟
  m = room.match(/^IE(\d)/);
  if (m) return `石川台実験棟${m[1]}`;
  // W/S/E/I + 数字-... → 西x号館, 南x号館, 東x号館, 石川台x号館
  m = room.match(/^([WSEI])(\d)-/);
  if (m) { const n = {W:'西',S:'南',E:'東',I:'石川台'}[m[1]]; return n ? `${n}${m[2]}号館` : null; }
  // 旧形式: W241→西2号館, S222→南2号館, E201→東2号館
  m = room.match(/^([WSEI])(\d)\d{2}$/);
  if (m) { const n = {W:'西',S:'南',E:'東',I:'石川台'}[m[1]]; return n ? `${n}${m[2]}号館` : null; }
  // H3-4桁 → 本館
  if (/^H\d{3,4}$/.test(room)) return '本館';
  // N- → 北1号館
  if (/^N-/.test(room)) return '北1号館';
  return null;
}

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
        building: roomToBuildingId(room),
        bldg: roomToLabel(room),
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
