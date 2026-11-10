// 大岡山キャンパス 3D マップ紹介映像（CampusMapFilm・約3分）のカット表。
// 撮影（capture/capture_campus3d.mjs）と映像（CampusMapFilm.jsx）の両方が読む。
//
// 座標はアプリと同じキャンパスの地図の m（x 東・y 北。原点は北緯 35.6048・東経 139.6835）。
// カメラの高さ h は、カットごとの基準の地面（ground の点の地形の高さ）からの m。
// cam(u) は u（0〜1：カットの中の時間）でカメラの位置 pos [x, y, h] と見る点 look [x, y, h]、画角 fov（縦・度）を返す。
// env：日付・時刻・時刻の進む速さ（倍）・天気（プリセットと値）。timeline(u) があればコマごとに時刻・天気を決める。
// 曲（public の bgm.mp3。150BPM・1小節 48 フレーム）：前奏 0–192、ビート 192–1344、ブレイク 1344–1728、ドロップ 1728、終わり 5184〜
export const FPS = 30;
export const BAR = 48;
export const TL = { beat: 192, brk: 1344, drop: 1728, outro: 5184, hit: 5364, total: 5430 };
export const PAD = 10; // カットの後ろに余分に撮るコマ（つなぎ目の重ね用）

// ── 補助 ──
const clamp01 = (t) => Math.min(1, Math.max(0, t));
export const easeIO = (t) => { const x = clamp01(t); return x < 0.5 ? 4 * x ** 3 : 1 - (-2 * x + 2) ** 3 / 2; };
export const easeO = (t) => 1 - (1 - clamp01(t)) ** 3;
export const easeI = (t) => clamp01(t) ** 3;
export const easeSine = (t) => 0.5 - 0.5 * Math.cos(Math.PI * clamp01(t));
const lerp = (a, b, t) => a + (b - a) * t;
const lerp3 = (a, b, t) => a.map((v, i) => lerp(v, b[i], t));
// キー [[u, [x, y, h]], ...] を Catmull-Rom（3次エルミート）でなめらかに結ぶ
export function track(keys, u) {
  if (u <= keys[0][0]) return [...keys[0][1]];
  const n = keys.length;
  if (u >= keys[n - 1][0]) return [...keys[n - 1][1]];
  let i = 0;
  while (i < n - 2 && u > keys[i + 1][0]) i++;
  const [ua, a] = keys[i];
  const [ub, b] = keys[i + 1];
  const tan = (j) => {
    const p = keys[Math.max(0, j - 1)];
    const q = keys[Math.min(n - 1, j + 1)];
    const span = q[0] - p[0] || 1;
    return q[1].map((v, k) => (v - p[1][k]) / span);
  };
  const h = ub - ua;
  const t = (u - ua) / h;
  const h00 = 2 * t ** 3 - 3 * t ** 2 + 1;
  const h10 = t ** 3 - 2 * t ** 2 + t;
  const h01 = -2 * t ** 3 + 3 * t ** 2;
  const h11 = t ** 3 - t ** 2;
  const ma = tan(i);
  const mb = tan(i + 1);
  return a.map((v, k) => h00 * v + h10 * h * ma[k] + h01 * b[k] + h11 * h * mb[k]);
}
// 中心 c [x, y, h] のまわり：方位 ang（度。中心から見たカメラの方位）・水平の距離 r・高さ h
export const orbit = (c, r, h, ang) => [c[0] + r * Math.sin((ang * Math.PI) / 180), c[1] + r * Math.cos((ang * Math.PI) / 180), h];

// 名所（地図の m）
export const P = {
  tower: [37.7, -4.8], // 本館の時計塔（高さ 39.4m）
  porch: [40.3, 15.4], // 本館の車寄せ（屋根 7.1m）
  deck: [40, 80], // 本館前のウッドデッキのまん中（桜並木）
  k70: [0.4, 122.5], // 70周年記念講堂（赤いヴォールト屋根）
  lib: [45.8, 173.4], // 附属図書館（学習棟）
  taki: [106.3, 156.2], // Taki Plaza
  well: [104, 182], // 明かり取り
  hyaku: [115, 224.8], // 百年記念館
  gate: [134.9, 232.7], // 正門の銘板
  xing: [156, 266], // 駅前の交差点
  mc: [170, 240], // POINT A（マクドナルド）
  station: [227, 300], // 大岡山駅ビル
  s4: [68, -160], // 南4号館
  seven: [65.8, -168.5], // セブン-イレブン
  ginkgo: [84, -180], // 南4号館の東のイチョウ並木（y −241〜−118）
  ud: [74.7, -285.5], // 地下通路
  elsi: [105.5, -317.4], // ELSI-1（宙に浮く箱）
};

// 1年を一巡する日付（季節の見どころはゆっくり）：u → その年の何日目
const YEAR_KEYS = [
  [0, 15], [0.12, 80], [0.3, 101], [0.38, 125], [0.48, 200], [0.58, 290], [0.74, 330], [0.84, 345], [1, 360],
];
export const yearDoy = (u) => {
  for (let i = 0; i < YEAR_KEYS.length - 1; i++) {
    const [ua, da] = YEAR_KEYS[i];
    const [ub, db] = YEAR_KEYS[i + 1];
    if (u <= ub) return lerp(da, db, easeSine((u - ua) / (ub - ua)));
  }
  return 360;
};
export const doyToDay = (doy, year = 2026) => {
  const d = new Date(Date.UTC(year, 0, 1) + Math.round(doy) * 86400000);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
};

// ── カット ──
// at：映像の中で始まるフレーム、len：長さ（このあと PAD コマ余分に撮る）、cap：字幕（映像の側で出す）
const SPRING = '2026-04-02'; // 満月・桜の満開（東京の平年 3/31 ごろ）
export const SHOTS = [
  // 前奏：夜明け前のキャンパスを高い空から。星が消えて、東の空が明るくなり、太陽が昇る
  {
    id: 'dawn', at: 0, len: 204, ground: P.deck, fov: 46,
    env: { day: SPRING, hm: '04:30', until: '05:44' },
    cam: (u) => {
      const e = easeSine(u);
      const tilt = easeIO(u / 0.7);
      return { pos: lerp3([-70, 30, 52], [-20, 60, 44], e), look: [lerp(-40, 200, tilt), lerp(40, 120, tilt), lerp(260, 14, tilt)] };
    },
  },
  // ── 建物（ビートの 24 小節。1 棟 3 小節）──
  {
    id: 'honkan', at: 192, len: 144, ground: P.deck, fov: 50, cap: { ja: '本館', en: 'MAIN BUILDING', sub: '時計塔・御影石の車寄せ・アーチの窓' },
    env: { day: SPRING, hm: '08:40', preset: 'fair' },
    cam: (u) => {
      const e = easeIO(u);
      return {
        pos: track([[0, [40, 112, 1.9]], [0.5, [40, 58, 2.4]], [0.72, [40, 36, 7]], [1, [39, 22, 24]]], e),
        look: track([[0, [39, 20, 9]], [0.6, [38.5, 0, 22]], [1, [37.7, -4.8, 34]]], e),
      };
    },
  },
  {
    id: 'hyaku', at: 336, len: 144, ground: P.hyaku, fov: 50, cap: { ja: '百年記念館', en: 'CENTENNIAL HALL', sub: '宙に浮く円筒と、ヴォールトの屋根' },
    env: { day: SPRING, hm: '10:30', preset: 'fair' },
    cam: (u) => ({ pos: orbit([115, 224.8], 58, lerp(18, 26, u), lerp(205, 290, easeIO(u))), look: [115, 224.8, 12] }),
  },
  {
    id: 'library', at: 480, len: 144, ground: P.lib, fov: 50, cap: { ja: '附属図書館', en: 'LIBRARY', sub: '浮かぶ学習棟と、V 字の柱' },
    env: { day: SPRING, hm: '15:10', preset: 'fair' },
    cam: (u) => {
      const e = easeIO(u);
      return { pos: track([[0, [14, 140, 4]], [1, [18, 206, 11]]], e), look: track([[0, [46, 160, 7]], [1, [47, 186, 6]]], e) };
    },
  },
  {
    id: 'taki', at: 624, len: 144, ground: P.taki, fov: 52, cap: { ja: 'Taki Plaza', en: 'TAKI PLAZA', sub: '木の屋根と、地下へ光を落とす明かり取り' },
    env: { day: SPRING, hm: '13:00', preset: 'fair' },
    cam: (u) => {
      const e = easeIO(u);
      return { pos: track([[0, [70, 112, 24]], [0.5, [96, 140, 38]], [1, [126, 196, 44]]], e), look: track([[0, [106, 156, 8]], [0.6, [104, 168, 0]], [1, [100, 176, -4]]], e) };
    },
  },
  {
    id: 'gate', at: 768, len: 144, ground: P.gate, fov: 48, cap: { ja: '正門', en: 'MAIN GATE', sub: '斜めの格子の柵と、銘板' },
    env: { day: SPRING, hm: '08:00', preset: 'fair' },
    cam: (u) => {
      const e = easeO(u);
      return { pos: track([[0, [178, 248, 6]], [1, [146, 236, 2.2]]], e), look: track([[0, [126, 228, 3]], [1, [133, 232.5, 1.6]]], e) };
    },
  },
  {
    id: 'station', at: 912, len: 144, ground: P.station, fov: 50, cap: { ja: '大岡山駅', en: 'OOKAYAMA STATION', sub: '駅ビルと、時刻表どおりに走る電車' },
    env: { day: SPRING, hm: '08:10', speed: 1, preset: 'fair' },
    cam: (u) => {
      const e = easeIO(u);
      return { pos: track([[0, [150, 230, 40]], [1, [190, 250, 34]]], e), look: track([[0, [230, 300, 4]], [1, [262, 318, 2]]], e) };
    },
  },
  {
    id: 's4', at: 1056, len: 144, ground: P.s4, fov: 50, cap: { ja: '南4号館', en: 'SOUTH BLDG. 4', sub: 'れんがの 1 階と、浮かぶ上の階' },
    env: { day: SPRING, hm: '14:30', preset: 'fair' },
    cam: (u) => {
      const e = easeIO(u);
      return { pos: track([[0, [110, -232, 10]], [1, [104, -128, 16]]], e), look: track([[0, [70, -176, 8]], [1, [66, -158, 8]]], e) };
    },
  },
  {
    id: 'elsi', at: 1200, len: 144, ground: P.elsi, fov: 50, cap: { ja: '地球生命研究所', en: 'ELSI-1', sub: '柱の外へ張り出した、長さ 85m の箱' },
    env: { day: SPRING, hm: '16:20', preset: 'fair' },
    cam: (u) => ({ pos: orbit([105.5, -317.4], 72, lerp(14, 22, u), lerp(120, 205, easeIO(u))), look: [100, -317.4, 8] }),
  },
  // ── ブレイク：時間が流れる（夕方 → 日の入り → 夜。最後に雷雲がわく）──
  {
    id: 'timelapse', at: 1344, len: 384, ground: P.tower, fov: 48, cap: { ja: '時間が流れる', en: 'TIME', sub: '太陽と月は、その日・その時刻の位置に' },
    env: { day: SPRING, hm: '16:50', until: '19:35' },
    weather: (u) => {
      const k = clamp01((u - 0.72) / 0.28);
      return k > 0 ? { cloud: 0.15 + 0.85 * k, dark: 0.2 + 0.75 * k, type: 'cumulonimbus', wind: 4 + 6 * k } : { cloud: 0.15, dark: 0, type: 'cumulus', wind: 3 };
    },
    cam: (u) => ({ pos: orbit([37.7, -4.8], 150, lerp(60, 48, u), lerp(-25, 40, easeSine(u))), look: [37.7, -4.8, 26] }),
  },
  // ── ドロップ：雷雨 ──
  {
    id: 'storm', at: 1728, len: 192, ground: P.deck, fov: 54, cap: { ja: '雷雨', en: 'THUNDERSTORM', sub: '稲妻は毎回ちがう方角・距離から' },
    env: { day: SPRING, hm: '21:10', speed: 1, preset: 'storm' },
    flashes: [
      { f: 0, kind: 'cg', rel: -4, dist: 2.6 }, { f: 30, kind: 'ic', rel: -45, dist: 4 }, { f: 54, kind: 'cg', rel: 28, dist: 4.5 },
      { f: 90, kind: 'ic', rel: 70, dist: 3 }, { f: 114, kind: 'cg', rel: -22, dist: 5 }, { f: 150, kind: 'ic', rel: -80, dist: 5 }, { f: 172, kind: 'cg', rel: 12, dist: 3.2 },
    ],
    cam: (u) => {
      const e = easeSine(u);
      return { pos: track([[0, [44, 132, 9]], [1, [42, 70, 15]]], e), look: track([[0, [38, -4.8, 30]], [1, [38, -4.8, 34]]], e) };
    },
  },
  {
    id: 'porch', at: 1920, len: 96, ground: P.porch, fov: 62, cap: { ja: '屋根の下には降らない', en: 'RAIN', sub: '雨粒は屋根・ひさしの高さで止まる' },
    env: { day: '2026-06-20', hm: '11:00', preset: 'heavy', set: { wind: 3 } },
    warm: 90,
    cam: (u) => {
      const e = easeIO(u);
      return { pos: track([[0, [40.3, 12.4, 1.6]], [1, [40.3, 17.6, 1.8]]], e), look: track([[0, [40.3, 40, 2.4]], [1, [41, 60, 3.2]]], e) };
    },
  },
  {
    id: 'snow', at: 2016, len: 96, ground: P.deck, fov: 52, cap: { ja: '雪', en: 'SNOW', sub: '降るほど白く積もり、晴れると解ける' },
    env: { day: '2027-01-25', hm: '09:20', preset: 'snow' },
    cam: (u) => {
      const e = easeIO(u);
      return { pos: track([[0, [62, 150, 14]], [1, [56, 112, 10]]], e), look: track([[0, [38, 40, 6]], [1, [38, 10, 12]]], e) };
    },
  },
  // ── 季節：1年がめぐる ──
  {
    id: 'year', at: 2112, len: 384, ground: P.deck, fov: 50, cap: { ja: '季節がめぐる', en: 'SEASONS', sub: '樹種ごとの暦：芽吹き・開花・紅葉・落葉' },
    env: { day: '2026-01-15', hm: '14:00' },
    timeline: (u) => ({ day: doyToDay(yearDoy(u)), hm: '14:00' }),
    cam: (u) => ({ pos: orbit([40, 84], 62, lerp(30, 22, u), lerp(68, 132, easeSine(u))), look: [38, 78, 3] }),
  },
  {
    id: 'sakura', at: 2496, len: 192, ground: P.deck, fov: 62, cap: { ja: '桜並木', en: 'CHERRY BLOSSOMS', sub: '満開から花吹雪へ' },
    env: { day: '2026-04-04', hm: '15:30', preset: 'fair', set: { wind: 5, windDir: 300 } },
    cam: (u) => {
      const e = easeIO(u);
      return { pos: track([[0, [41, 138, 1.75]], [1, [40, 70, 2.2]]], e), look: track([[0, [39, 110, 4.2]], [1, [38, 40, 6.5]]], e) };
    },
  },
  {
    id: 'ginkgo', at: 2688, len: 192, ground: P.ginkgo, fov: 60, cap: { ja: 'イチョウ並木', en: 'GINKGO AVENUE', sub: '黄葉と、舞い落ちる葉・ギンナン' },
    env: { day: '2026-11-26', hm: '14:20', preset: 'fair', set: { wind: 6, windDir: 20 } },
    cam: (u) => {
      const e = easeIO(u);
      return { pos: track([[0, [84, -124, 1.9]], [1, [83, -206, 2.6]]], e), look: track([[0, [83.5, -150, 4]], [1, [82, -240, 6]]], e) };
    },
  },
  // ── 歩いて見る ──
  {
    id: 'xing', at: 2880, len: 192, ground: P.xing, fov: 60, cap: { ja: '歩いて見る', en: 'WALK', sub: '駅前から、目の高さで' },
    env: { day: '2026-05-18', hm: '08:25', speed: 1, preset: 'fair' },
    cam: (u) => {
      const e = easeIO(u);
      return { pos: track([[0, [196, 284, 1.7]], [1, [150, 242, 1.7]]], e), look: track([[0, [170, 262, 2.5]], [1, [120, 222, 3]]], e) };
    },
  },
  {
    id: 'gatewalk', at: 3072, len: 192, ground: P.gate, fov: 60, cap: { ja: '正門から明かり取りへ', en: 'INTO CAMPUS', sub: '段・坂・手すりまで歩ける' },
    env: { day: '2026-05-18', hm: '08:40', preset: 'fair' },
    cam: (u) => {
      const e = easeIO(u);
      return { pos: track([[0, [146, 234, 1.7]], [0.55, [124, 214, 1.7]], [1, [112, 197, 1.2]]], e), look: track([[0, [118, 222, 2.5]], [0.55, [108, 196, 0.5]], [1, [104, 182, -2.5]]], e) };
    },
  },
  {
    id: 'takiin', at: 3264, len: 192, ground: P.taki, fov: 64, detail: true, cap: { ja: '建物の中まで', en: 'INSIDE', sub: 'Taki Plaza の地下 1・2 階（図面から）' },
    env: { day: '2026-05-18', hm: '12:00', preset: 'fair' },
    cam: (u) => {
      const e = easeIO(u);
      return { pos: track([[0, [108, 178, -2.4]], [1, [104, 150, -2.6]]], e), look: track([[0, [106, 160, -3.5]], [1, [102, 128, -4.2]]], e) };
    },
  },
  {
    id: 'stnin', at: 3456, len: 192, ground: P.station, fov: 62, detail: true, cap: { ja: '駅の改札も', en: 'STATION', sub: '券売機・改札・コンコース' },
    env: { day: '2026-05-18', hm: '08:30', speed: 1, preset: 'fair' },
    cam: (u) => {
      const e = easeIO(u);
      return { pos: track([[0, [186, 276, 1.7]], [1, [196, 290, 1.7]]], e), look: track([[0, [196, 292, 2.2]], [1, [206, 304, 2.2]]], e) };
    },
  },
  // ── 夜 ──
  {
    id: 'trains', at: 3648, len: 192, ground: P.station, fov: 50, cap: { ja: '電車が走る', en: 'TRAINS', sub: '東急線は時刻表どおりに' },
    env: { day: '2026-11-10', hm: '17:05', speed: 1, preset: 'fair' },
    cam: (u) => {
      const e = easeIO(u);
      return { pos: track([[0, [300, 240, 30]], [1, [250, 230, 22]]], e), look: track([[0, [240, 300, 2]], [1, [200, 290, 2]]], e) };
    },
  },
  {
    id: 'seven', at: 3840, len: 192, ground: P.s4, fov: 60, cap: { ja: '夜の明かり', en: 'NIGHT', sub: '街灯・窓・お店の灯り' },
    env: { day: '2026-11-10', hm: '20:20' },
    cam: (u) => {
      const e = easeIO(u);
      return { pos: track([[0, [96, -190, 1.8]], [1, [88, -166, 2.2]]], e), look: track([[0, [68, -170, 2]], [1, [64, -164, 2.4]]], e) };
    },
  },
  {
    id: 'moon', at: 4032, len: 192, ground: P.deck, fov: 52, cap: { ja: '月と星', en: 'MOON & STARS', sub: '満ち欠けも、昇る方角も' },
    env: { day: '2026-11-24', hm: '19:10' },
    cam: (u) => {
      const e = easeIO(u);
      return { pos: track([[0, [46, 104, 2]], [1, [44, 64, 6]]], e), look: track([[0, [39, 0, 34]], [1, [38, -4.8, 40]]], e) };
    },
  },
  {
    id: 'hyakunight', at: 4224, len: 192, ground: P.hyaku, fov: 50, cap: { ja: '百年記念館の夜', en: 'AFTER DARK', sub: '' },
    env: { day: '2026-11-10', hm: '21:30' },
    cam: (u) => ({ pos: orbit([115, 224.8], 64, lerp(10, 20, u), lerp(300, 220, easeIO(u))), look: [115, 224.8, 11] }),
  },
  // ── たたみかける（1 小節ずつ）──
  ...[
    { id: 'm_lib', ground: P.lib, env: { day: '2026-10-20', hm: '16:40', preset: 'fair' }, a: [[18, 150, 6], [20, 168, 7]], l: [[46, 168, 6], [46, 180, 6]] },
    { id: 'm_taki', ground: P.taki, env: { day: '2026-10-20', hm: '15:50', preset: 'fair' }, a: [[140, 130, 16], [140, 150, 18]], l: [[110, 150, 10], [108, 160, 10]] },
    { id: 'm_elsi', ground: P.elsi, env: { day: '2026-10-20', hm: '10:30', preset: 'fair' }, a: [[110, -280, 6], [96, -282, 7]], l: [[104, -314, 8], [100, -316, 8]] },
    { id: 'm_ud', ground: P.ud, env: { day: '2026-10-20', hm: '12:30', preset: 'fair' }, a: [[74.7, -262, 1.6], [74.7, -272, 1.4]], l: [[74.7, -300, 0], [74.7, -310, -1]] },
    { id: 'm_mc', ground: P.mc, env: { day: '2026-10-20', hm: '19:30' }, a: [[150, 262, 3], [156, 256, 3]], l: [[170, 240, 8], [172, 238, 9]] },
    { id: 'm_s4', ground: P.s4, env: { day: '2026-10-20', hm: '11:30', preset: 'fair' }, a: [[40, -150, 1.7], [44, -158, 1.7]], l: [[60, -160, 2.5], [62, -166, 2.5]] },
    { id: 'm_gate', ground: P.gate, env: { day: '2026-10-20', hm: '16:50', preset: 'fair' }, a: [[150, 222, 2], [148, 228, 1.8]], l: [[134, 232, 1.4], [134, 233, 1.3]] },
    { id: 'm_k70', ground: P.k70, env: { day: '2026-10-20', hm: '09:30', preset: 'fair' }, a: [[30, 160, 16], [36, 150, 13]], l: [[0, 122, 6], [2, 122, 5]] },
  ].map((m, i) => ({
    id: m.id, at: 4416 + i * BAR, len: BAR, ground: m.ground, fov: 54, env: m.env, montage: true,
    cam: (u) => ({ pos: lerp3(m.a[0], m.a[1], u), look: lerp3(m.l[0], m.l[1], u) }),
  })),
  // ── フィナーレ：夕日の中を高く昇って、キャンパス全体へ ──
  {
    id: 'finale', at: 4800, len: TL.total - 4800, ground: P.deck, fov: 48,
    env: { day: '2026-11-10', hm: '15:55', until: '16:40' },
    cam: (u) => {
      const e = easeIO(clamp01(u / 0.62));
      return {
        pos: track([[0, [60, 150, 10]], [0.4, [20, 190, 60]], [1, [-120, 330, 230]]], e),
        look: track([[0, [40, 60, 12]], [1, [50, -20, 0]]], e),
      };
    },
  },
];

// 映像の中で各カットを使う区間（次のカットの頭まで）
export const shotById = Object.fromEntries(SHOTS.map((s) => [s.id, s]));
