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
  // カンマ区切り: 各パートを順に試す ("建築製図室, W9-511設計製図室" etc.)
  if (/[,、]/.test(room)) {
    for (const part of room.split(/[,、]\s*/)) {
      const id = roomToBuildingId(part.trim());
      if (id) return id;
    }
    return null;
  }
  let m;
  // 複合建物コード: WL1, WL2, SL, SE1-5, NE1-8, NE3A, NE3B, IE1
  m = room.match(/^(WL|SL|SE|NE|IE)(\d?[A-Z]?)-/);
  if (m) { const id = `${m[1].toLowerCase()}${m[2].toLowerCase()}`; return id === 'ne3' ? 'ne3a' : id; }
  // 新形式 (末尾文字許容): W2-41, S2-201, I1-256, W8E-306
  m = room.match(/^([WSEI])(\d)[A-Z]*-/);
  if (m) { const p = {W:'w',S:'s',E:'e',I:'i'}[m[1]]; return p ? `${p}${m[2]}` : null; }
  // M- → 全て本館 (M-278(H121), M-B07(H101), M-358, M-124, M-156(H1103))
  if (/^M-/.test(room)) return /\(H/.test(room) ? 'main_lec' : 'main';
  // 旧形式: W241, S222, E201
  m = room.match(/^([WSEI])(\d)\d{2}$/);
  if (m) { const p = {W:'w',S:'s',E:'e',I:'i'}[m[1]]; return p ? `${p}${m[2]}` : null; }
  // H + 3-4桁 → 本館 (H203, H1103)
  if (/^H\d{3,4}$/.test(room)) return 'main';
  // N + (任意の数字) + - → 北x号館 (N-xx→n1, N2-xx→n2, N3-xx→n3)
  m = room.match(/^N(\d)?-/);
  if (m) return `n${m[1] || '1'}`;
  // 日本語建物名: "石川台1号館..."→i1, "西3号館..."→w3, "南2号館..."→s2
  m = room.match(/^(?:石川台|石)(\d)号館/); if (m) return `i${m[1]}`;
  m = room.match(/^西(\d)号館/); if (m) return `w${m[1]}`;
  m = room.match(/^南(\d)号館/); if (m) return `s${m[1]}`;
  // 日本語特殊教室名 → 建物ID
  if (/建築製図室/.test(room)) return 'w5';
  if (/GSIC/.test(room)) return 's3';
  if (/情報工学系計算機室/.test(room)) return 'w8';
  if (/情報ネットワーク演習室/.test(room)) return 's4';
  if (/屋内運動場/.test(room)) return 'gym';
  return null;
}

// 教室コード → 建物名ラベル (人が読める形式)
// M-B07→本館B1F, M-278→本館2F, WL1-301→西講義棟1, S2-203→南2号館
function roomToLabel(room) {
  if (!room || room === '未設定') return null;
  // カンマ区切り: 各パートを順に試す
  if (/[,、]/.test(room)) {
    for (const part of room.split(/[,、]\s*/)) {
      const lbl = roomToLabel(part.trim());
      if (lbl) return lbl;
    }
    return null;
  }
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
  // NE → 北実験棟 (NE3A→北実験棟3A, NE3→北実験棟3)
  m = room.match(/^NE(\d)([A-Z])?/);
  if (m) return `北実験棟${m[1]}${m[2] || ''}`;
  // IE → 石川台実験棟
  m = room.match(/^IE(\d)/);
  if (m) return `石川台実験棟${m[1]}`;
  // W/S/E/I + 数字 (+ 末尾文字) + -... → 西x号館 (W8E-306→西8号館)
  m = room.match(/^([WSEI])(\d)[A-Z]*-/);
  if (m) { const n = {W:'西',S:'南',E:'東',I:'石川台'}[m[1]]; return n ? `${n}${m[2]}号館` : null; }
  // 旧形式: W241→西2号館, S222→南2号館, E201→東2号館
  m = room.match(/^([WSEI])(\d)\d{2}$/);
  if (m) { const n = {W:'西',S:'南',E:'東',I:'石川台'}[m[1]]; return n ? `${n}${m[2]}号館` : null; }
  // H3-4桁 → 本館
  if (/^H\d{3,4}$/.test(room)) return '本館';
  // N + (任意の数字) + - → 北x号館
  m = room.match(/^N(\d)?-/);
  if (m) return `北${m[1] || '1'}号館`;
  // 日本語建物名: "石川台1号館..."→石川台1号館, "西3号館..."→西3号館, "南2号館..."→南2号館
  m = room.match(/^(?:石川台|石)(\d)号館/); if (m) return `石川台${m[1]}号館`;
  m = room.match(/^西(\d)号館/); if (m) return `西${m[1]}号館`;
  m = room.match(/^南(\d)号館/); if (m) return `南${m[1]}号館`;
  m = room.match(/^北(\d)号館/); if (m) return `北${m[1]}号館`;
  m = room.match(/^東(\d)号館/); if (m) return `東${m[1]}号館`;
  if (/^本館/.test(room)) return '本館';
  // 南実験棟・北実験棟・石川台実験棟 (日本語)
  m = room.match(/^南実験棟(\d)/); if (m) return `南実験棟${m[1]}`;
  m = room.match(/^北実験棟(\d)([A-Z])?/); if (m) return `北実験棟${m[1]}${m[2] || ''}`;
  m = room.match(/^石川台実験棟(\d)/); if (m) return `石川台実験棟${m[1]}`;
  // 日本語特殊教室名
  if (/建築製図室/.test(room)) return '西5号館';
  if (/GSIC/.test(room)) return '南3号館';
  if (/情報工学系計算機室/.test(room)) return '西8号館';
  if (/情報ネットワーク演習室/.test(room)) return '南4号館';
  if (/屋内運動場/.test(room)) return '体育館';
  return null;
}

// シラバスDBの building カラム (e.g. "W5", "M", "W9, W5") → SPOTS ID
// extractBuilding() が生成した大文字コードを地図用小文字IDに変換
function buildingCodeToSpotId(dbBuilding) {
  if (!dbBuilding) return null;
  const code = dbBuilding.split(/[,、]\s*/)[0].trim();
  if (!code) return null;
  if (code === 'M') return 'main';
  if (code === 'GSIC') return 's3';
  if (code === '屋内運動場') return 'gym';
  // W8E → W8 (末尾文字を除去)
  const extra = code.match(/^([WSEI])(\d)[A-Z]+$/);
  if (extra) return `${extra[1].toLowerCase()}${extra[2]}`;
  const id = code.toLowerCase();
  return id === 'ne3' ? 'ne3a' : id;
}

// シラバスDBの building カラム → 人が読める建物名ラベル
function buildingCodeToLabel(dbBuilding) {
  if (!dbBuilding) return null;
  const code = dbBuilding.split(/[,、]\s*/)[0].trim();
  if (!code) return null;
  if (code === 'M') return '本館';
  if (code === 'GSIC') return '南3号館';
  if (code === '屋内運動場') return '体育館';
  const cm = code.match(/^(WL|SL|SE|NE|IE)(\d?[A-Z]?)$/);
  if (cm) { const l = {WL:'西講義棟',SL:'南講義棟',SE:'南実験棟',NE:'北実験棟',IE:'石川台実験棟'}[cm[1]]; return `${l}${cm[2]}`; }
  const sm = code.match(/^([WSEIN])(\d)/);
  if (sm) { const l = {W:'西',S:'南',E:'東',I:'石川台',N:'北'}[sm[1]]; return l ? `${l}${sm[2]}号館` : null; }
  return null;
}

/**
 * Extract academic year from Moodle shortname (e.g. "2025_1Q_CSC.T243" → 2025).
 */
function extractYear(shortname) {
  // ISCT: "2025_1Q_CSC.T243" → 2025
  const m = shortname.match(/^(\d{4})/);
  if (m) return parseInt(m[1]);
  // T2SCHOLA: "LAS.M102-06[2024]" → 2024
  const m2 = shortname.match(/\[(\d{4})\]/);
  return m2 ? parseInt(m2[1]) : null;
}

/**
 * Extract course code (e.g. "CSC.T243") from Moodle shortname.
 */
function extractCourseCode(shortname) {
  const match = shortname.match(/[A-Z]{2,4}\.[A-Z]\d{3}/);
  return match ? match[0] : shortname;
}

/**
 * Extract course code with section suffix (e.g. "LAL.S204-07") from Moodle shortname.
 */
function extractCourseCodeRaw(shortname) {
  const match = shortname.match(/[A-Z]{2,4}\.[A-Z]\d{3}(-\d+)?/);
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
 * Detect user's primary department from their enrolled courses.
 * Counts dept prefixes from specialized courses (excluding language/common),
 * returns the most frequent one. e.g. MEC, CSC, EEE
 */
function detectUserDept(moodleCourses) {
  const counts = {};
  for (const mc of moodleCourses) {
    const m = mc.shortname.match(/([A-Z]{2,4})\.[A-Z]\d{3}/);
    if (!m) continue;
    const d = m[1];
    // Skip language/common courses — these are the ones WITH multiple sections
    if (/^LA[HELJTWS]$|^ENT$|^DSA$|^CMN$/.test(d)) continue;
    counts[d] = (counts[d] || 0) + 1;
  }
  let best = null, max = 0;
  for (const [d, c] of Object.entries(counts)) {
    if (c > max) { best = d; max = c; }
  }
  return best;
}

/**
 * Transform Moodle courses to campus-sns format.
 *
 * Moodle: {id, shortname, fullname, enrolledusercount, summary, visible, ...}
 * campus-sns: {id, moodleId, code, name, per, room, col, mem, quarter}
 *
 * @param {Array} moodleCourses - Raw Moodle course objects
 * @param {Object} [scheduleMap] - Optional map of courseCode → {per, room, quarter, dept} from syllabus scraper
 * @param {string|null} [userDept] - User's dept from profile DB. Falls back to auto-detection from courses.
 */
export function transformCourses(moodleCourses, scheduleMap = {}, userDept = null) {
  if (!userDept) userDept = detectUserDept(moodleCourses);

  const allCourses = moodleCourses
    .filter(mc => mc.visible !== 0)
    .map((mc) => {
      const code = extractCourseCode(mc.shortname);
      const codeRaw = extractCourseCodeRaw(mc.shortname);

      // Extract section from fullname (e.g. 【B】→"B", 【14-RW】→"14-RW")
      const secMatch = mc.fullname.match(/【([^】]+)】/);
      const section = secMatch ? secMatch[1] : null;

      // 「申告専用」は実セクションではなく申告制科目の umbrella コース。
      // シラバスDBには全セクションの時間割が集約されているため、
      // スケジュール参照をスキップして時間割に配置しない。
      const isDeclarationOnly = section === '申告専用';

      // Schedule lookup priority:
      //  1) `@${idnumber}` — syllabus URL tail; uniquely identifies the Q-variant
      //     (e.g. LAS.E101 has separate 1Q and 2Q entries with different idnumbers).
      //  2) `${code}:${section}#${year}` / `${code}#${year}` — year-scoped so
      //     2025 enrollments don't pick up 2026 rows for the same code.
      //  3) `${code}:${section}` / `${code}` — last resort (year-agnostic).
      // scheduleMap values can be arrays (multiple time slots) or single objects (legacy)
      const idKey = mc.idnumber && /^\d{9}$/.test(mc.idnumber) ? `@${mc.idnumber}` : null;
      const yearMatch = mc.shortname.match(/\[(\d{4})\]/) || mc.shortname.match(/^(\d{4})/);
      const mcYear = yearMatch ? yearMatch[1] : null;
      const syllabusRaw = isDeclarationOnly ? null
        : (idKey && scheduleMap[idKey])
          || (section && mcYear && scheduleMap[`${code}:${section}#${mcYear}`])
          || (mcYear && scheduleMap[`${code}#${mcYear}`])
          || (section && scheduleMap[`${code}:${section}`])
          || scheduleMap[code] || null;
      const syllabusArr = Array.isArray(syllabusRaw) ? syllabusRaw : syllabusRaw ? [syllabusRaw] : [];
      const syllabus = syllabusArr[0] || {};

      // Prefer syllabus data over Moodle fullname parsing
      const { per: moodlePer, room: moodleRoom } = parsePeriodRoom(mc.fullname, mc.summary);
      const per = syllabus.per || moodlePer;
      const room = syllabus.room || moodleRoom;

      // Collect ALL time slots for this course (e.g. 月3-4, 水1-2, 金1-2)
      const extraSlots = syllabusArr.length > 1
        ? syllabusArr.slice(1).map(s => ({
            per: s.per, room: s.room,
            periodStart: s.periodStart || s.period_start,
            periodEnd: s.periodEnd || s.period_end,
            building: s.building || null,
          }))
        : [];

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
        codeRaw,
        name,
        per: per || '未設定',
        room: room || '未設定',
        col: null, // assigned after dedup
        mem: mc.enrolledusercount || 0,
        quarter,
        year: extractYear(mc.shortname),
        periodStart: syllabus.periodStart || null,
        periodEnd: syllabus.periodEnd || null,
        building: buildingCodeToSpotId(syllabus.building) || roomToBuildingId(room),
        bldg: roomToLabel(room) || buildingCodeToLabel(syllabus.building),
        _syllDept: syllabus.dept || null,
        extraSlots,
        syllabusUrl: syllabus.syllabusUrl || null,
      };
    });

  // Deduplicate: when multiple sections share the same course code
  // (e.g. LAL.S204 with S11,S12,S13,...), keep only the section
  // assigned to the user's department in the syllabus DB.
  // Also prefer newer year when same code exists across academic years.
  const byCode = new Map();
  for (const c of allCourses) {
    const existing = byCode.get(c.code);
    if (!existing) {
      byCode.set(c.code, c);
    } else if (c.year && existing.year && c.year !== existing.year) {
      // Different academic years — keep newer year's course
      if (c.year > existing.year) byCode.set(c.code, c);
    } else if (userDept && c._syllDept === userDept && existing._syllDept !== userDept) {
      byCode.set(c.code, c);
    }
  }

  return [...byCode.values()].map((c, i) => {
    const { _syllDept, ...rest } = c;
    rest.col = COLOR_PALETTE[i % COLOR_PALETTE.length];
    return rest;
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
