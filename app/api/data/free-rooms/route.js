import { getSupabaseAdmin } from '../../../../lib/supabase/server.js';
import { requireSession } from '../../../../lib/auth/require-auth.js';

// =============================================================
// 空き教室ファインダー API
// syllabus_courses の授業データから「ある時限に授業が入っていない教室」を導出する。
//
// 時限モデルは時間割 (lib/transform/timetable-builder.js) と揃える:
//   大学の時限番号(1〜10) → 表示スロット(0〜4) = floor((n-1)/2)
//   スロット0: 1-2限(8:50-10:30) / 1: 3-4限(10:45-12:25) / 2: 5-6限(13:30-15:10)
//   3: 7-8限(15:25-17:05) / 4: 9-10限(17:15-18:55)
//
// 教室の母集団 = その年度に1度でも登場する教室 (シラバス由来)。
// 空き = 母集団 − その(クォーター,曜日,スロット)で使用中の教室。
// =============================================================

const DAYS = ['月', '火', '水', '木', '金'];
const N_SLOTS = 5;

// "WL1-201(W521),WL1-401(W541)" のような room 文字列を個別の教室名配列に分解する。
// カッコ内の旧室番号は除去し、カンマ区切りを展開する。
// 物理教室でない/ノイズトークン (英語説明の断片や単独記号)
const ROOM_JUNK = new Set(['PC', 'Room', 'Design', 'Factory', 'Bldg.5', 'Ishikawadai', '他']);
function isJunkRoom(r) {
  if (/オンライン|zoom|遠隔|未定|未設定|web|online|n\/?a|―|^-+$/i.test(r)) return true;
  if (ROOM_JUNK.has(r)) return true;
  if (/^[A-Za-z]$/.test(r)) return true;          // 単独アルファベット ("C" 等)
  return false;
}

function parseRooms(raw) {
  if (!raw) return [];
  // 1) カッコ外のカンマ/読点で分割 (カッコ内のカンマは無視)
  const parts = [];
  let depth = 0, buf = '';
  for (const ch of raw) {
    if (ch === '(' || ch === '（') { depth++; buf += ch; }
    else if (ch === ')' || ch === '）') { depth = Math.max(0, depth - 1); buf += ch; }
    else if ((ch === ',' || ch === '，' || ch === '、') && depth === 0) { parts.push(buf); buf = ''; }
    else buf += ch;
  }
  if (buf) parts.push(buf);

  const out = [];
  for (const part of parts) {
    // カッコ内に階情報(N階/NF)があれば退避 (例: "第1ラボ(W3,4F)" → 4階)
    let floorTok = '';
    const pm = part.match(/[（(]([^（）()]*)[）)]/);
    if (pm) { const fm = pm[1].match(/(\d{1,2})\s*[階F]/i); if (fm) floorTok = `${fm[1]}階`; }
    // カッコ除去 → NFKC(全角→半角) → 空白除去
    const name = part.replace(/[（(][^（）()]*[）)]/g, ' ').normalize('NFKC').replace(/\s+/g, '').trim();
    if (!name) continue;
    // 区切り無しで連続する室コード境界で分割 (例 "S7-209S8-110")
    for (let seg of name.split(/(?<=-\d{2,}|\d{3,})(?=(?:WL|SL|SE|NE|IE|[WSEIGJBMN])\d?[A-Z]?-(?:B?\d))/g)) {
      seg = seg.trim();
      if (!seg || isJunkRoom(seg)) continue;
      // 日本語建物名+コード ("南5号館S5-112" → "S5-112") はコード部に正規化
      const cm = seg.match(/(?:WL|SL|SE|NE|IE|[WSEIGJBMN])\d?[A-Z]?-B?\d[\w~～-]*/);
      if (cm && cm.index > 0 && /[号館棟階]/.test(seg.slice(0, cm.index))) seg = cm[0];
      // 「○N号館[M階]室番号」をコード化 ("南5号館112"→"S5-112", "石川台1号館2階253"→"I1-253")
      seg = seg.replace(/^(?:大岡山)?(西|南|北|東|石川台|石)(\d+)号館(?:\d+階)?(\d{3,4})(?:号室)?$/,
        (_w, jp, b, r) => `${({ 西: 'W', 南: 'S', 北: 'N', 東: 'E', 石川台: 'I', 石: 'I' })[jp]}${b}-${r}`);
      // 室番号も階表記も持たない名称室で、カッコ内に階があれば付与 (コード室は番号を持つので不変)
      if (floorTok && !/\d{3,}|\d\s*階|\d\s*F/i.test(seg)) seg += floorTok;
      out.push(seg);
    }
  }
  return out;
}

// 教室名から建物コードを推定する ("WL1-201" → "WL1", "M-B07" → "M")。
// 日本語建物名は対応するコードへ ("石川台4号館B02-05" → "I4")。
// 判定できない名称(建築製図室 等)は "その他"。
function buildingOf(room) {
  let m = room.match(/^(?:大岡山)?(西|南|北|東)(\d+)号館/);
  if (m) return ({ 西: 'W', 南: 'S', 北: 'N', 東: 'E' })[m[1]] + m[2];
  m = room.match(/^(?:石川台|石)(\d+)号館/);
  if (m) return 'I' + m[1];
  if (/^本館|^H\d/.test(room)) return 'M';
  const i = room.indexOf('-');
  // ハイフン前に日本語が混入している場合は建物コードとして採用しない
  if (i > 0) { const pre = room.slice(0, i); if (!/[^\x00-\x7F]/.test(pre)) return pre; }
  return 'その他';
}

// 建物コード → キャンパス区分。
// 大岡山: M(本館), W/WL/W8E, S/SL/SE, E/NE, I/IE(石川台), N(北), GSIC, 屋内運動場, 緑が丘 等
// すずかけ台: G/J/B/R 棟 (GSIC は大岡山なので先に除外)
function campusOf(building) {
  if (!building || building === 'その他') return 'その他';
  if (building === 'GSIC') return '大岡山';
  if (/^[GJBR]\d*$/.test(building)) return 'すずかけ台';
  if (/^(M|W|S|E|I|N|WL|SL|SE|NE|IE)/.test(building)) return '大岡山';
  if (building === '屋内運動場' || /^(緑が丘|南|西|北|東|石川台|本館|建築)/.test(building)) return '大岡山';
  return 'その他';
}

const CAMPUS_ORDER = ['大岡山', 'すずかけ台', 'その他'];

// 建物コード → 地域区分 (大岡山キャンパスの地区。地図の SPOT_CATS に対応)
// 本館・中央 / 西地区 / 南地区 / 東・北地区 / 石川台地区
function areaOf(building, campus) {
  if (campus === 'すずかけ台') return 'すずかけ台';
  if (campus === 'その他' || !building || building === 'その他') return 'その他';
  if (building === 'M' || /^(本館|H)/.test(building)) return '本館・中央';
  if (building === 'GSIC') return '南地区';
  if (/^(W|WL)/.test(building) || /^西/.test(building)) return '西地区';
  if (/^(S|SL|SE)/.test(building) || /^南/.test(building)) return '南地区';
  if (/^(E|NE|N)/.test(building) || /^(東|北)/.test(building)) return '東・北地区';
  if (/^(I|IE)/.test(building) || /^石川台/.test(building)) return '石川台地区';
  return 'その他';
}

const AREA_ORDER = ['本館・中央', '西地区', '南地区', '東・北地区', '石川台地区', 'すずかけ台', 'その他'];

// クォーター文字列 ("1Q","1-2Q","3-4Q","通年" 等) が指定クォーター(1-4)を含むか。
function quarterCovers(courseQ, q) {
  if (!courseQ) return false;
  if (/通年|前期|後期|集中|未/.test(courseQ) && !/\d/.test(courseQ)) {
    // 通年系は全クォーター扱い
    return true;
  }
  const nums = (courseQ.match(/\d/g) || []).map(Number);
  if (nums.length === 0) return false;
  const lo = Math.min(...nums);
  const hi = Math.max(...nums);
  return q >= lo && q <= hi;
}

// 大学時限番号(start,end) → 表示スロット範囲 [rowStart,rowEnd]
function slotRange(ps, pe) {
  if (ps == null || pe == null) return null;
  const rs = Math.floor((ps - 1) / 2);
  const re = Math.floor((pe - 1) / 2);
  if (!Number.isFinite(rs) || !Number.isFinite(re)) return null;
  return [Math.max(0, Math.min(4, rs)), Math.max(0, Math.min(4, re))];
}

export async function GET(req) {
  const auth = await requireSession(req);
  if (auth.error) return auth.error;

  const { searchParams } = new URL(req.url);
  const year = (searchParams.get('year') || '2026').slice(0, 8).replace(/[^0-9]/g, '');
  if (!year) return Response.json({ error: 'invalid year' }, { status: 400 });

  const sb = getSupabaseAdmin();

  // Supabase は 1 リクエスト最大 1000 行なので range でページング
  const rows = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await sb
      .from('syllabus_courses')
      .select('code,name,room,building,day,period_start,period_end,quarter')
      .eq('year', year)
      .range(from, from + PAGE - 1);
    if (error) {
      console.error('[free-rooms]', error.message);
      return Response.json({ error: 'query failed' }, { status: 500 });
    }
    if (!data || data.length === 0) break;
    rows.push(...data);
    if (data.length < PAGE) break;
  }

  // 教室の母集団 (建物 → 教室Set)、および
  // occ[quarter][dayIdx][slot] = Map<room, {code, name}[]>  (使用中教室とその授業)
  const roomBuilding = new Map(); // room → building
  const quartersSeen = new Set();
  const occ = {};
  const ensureOcc = q => {
    if (!occ[q]) {
      occ[q] = {};
      for (let d = 0; d < DAYS.length; d++) {
        occ[q][d] = Array.from({ length: N_SLOTS }, () => new Map());
      }
    }
    return occ[q];
  };

  for (const r of rows) {
    const rooms = parseRooms(r.room);
    if (rooms.length === 0) continue;
    for (const room of rooms) {
      if (!roomBuilding.has(room)) roomBuilding.set(room, buildingOf(room));
    }

    const dayIdx = DAYS.indexOf(r.day);
    const span = slotRange(r.period_start, r.period_end);

    // 占有情報はクォーター・曜日・時限がそろって初めて記録できる
    if (dayIdx < 0 || !span) continue;

    const cls = { code: r.code || '', name: r.name || '' };
    const clsKey = `${cls.code} ${cls.name}`;

    for (let q = 1; q <= 4; q++) {
      if (!quarterCovers(r.quarter, q)) continue;
      quartersSeen.add(q);
      const qKey = `${q}Q`;
      const grid = ensureOcc(qKey);
      for (let s = span[0]; s <= span[1]; s++) {
        for (const room of rooms) {
          const m = grid[dayIdx][s];
          if (!m.has(room)) m.set(room, { seen: new Set(), list: [] });
          const entry = m.get(room);
          if (!entry.seen.has(clsKey)) {
            entry.seen.add(clsKey);
            entry.list.push(cls);
          }
        }
      }
    }
  }

  // 出力形を JSON 化 (Set → 配列)
  const rooms = [...roomBuilding.entries()]
    .map(([room, building]) => {
      const campus = campusOf(building);
      return { room, building, campus, area: areaOf(building, campus) };
    })
    .sort((a, b) =>
      a.building === b.building ? a.room.localeCompare(b.room) : a.building.localeCompare(b.building)
    );

  const buildings = [...new Set(rooms.map(r => r.building))].sort((a, b) =>
    a === 'その他' ? 1 : b === 'その他' ? -1 : a.localeCompare(b)
  );

  // キャンパス一覧 (教室が存在するもののみ、定義順)
  const campusSet = new Set(rooms.map(r => r.campus));
  const campuses = CAMPUS_ORDER.filter(c => campusSet.has(c));

  // 地域一覧 (定義順)
  const areaSet = new Set(rooms.map(r => r.area));
  const areas = AREA_ORDER.filter(a => areaSet.has(a));

  // occOut[qKey][day][slot] = [{ room, classes:[{code,name}] }]
  const occOut = {};
  for (const [qKey, grid] of Object.entries(occ)) {
    occOut[qKey] = {};
    for (let d = 0; d < DAYS.length; d++) {
      occOut[qKey][DAYS[d]] = grid[d].map(m =>
        [...m.entries()].map(([room, entry]) => ({ room, classes: entry.list }))
      );
    }
  }

  const quarters = [1, 2, 3, 4]
    .filter(q => quartersSeen.has(q))
    .map(q => `${q}Q`);

  return Response.json({
    year,
    rooms,
    buildings,
    campuses: campuses.length ? campuses : ['大岡山'],
    areas,
    quarters: quarters.length ? quarters : ['1Q', '2Q', '3Q', '4Q'],
    occ: occOut,
    totalCourses: rows.length,
  });
}
