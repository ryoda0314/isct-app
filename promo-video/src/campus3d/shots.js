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
// 向き（方位 yaw・仰角 el。度）で見る点（pos から 100m 先）
const dirLook = (p, yaw, el) => {
  const y = (yaw * Math.PI) / 180;
  const e = (el * Math.PI) / 180;
  return [p[0] + 100 * Math.sin(y) * Math.cos(e), p[1] + 100 * Math.cos(y) * Math.cos(e), p[2] + 100 * Math.sin(e)];
};
const ABS = { ground: [40, 80], groundZ: 0 }; // pos・look の高さを標高（m）で書くカット
// 1 年を一巡する日付：u → その年の何日目（見どころはゆっくり）は yearDoy

export const SHOTS = [
  // 前奏：夜明け前。西の空に沈む満月から、東へ振り向くと日が昇る（4/2 は満月）
  {
    id: 'dawn', at: 0, len: 204, ...ABS, fov: 52,
    env: { day: SPRING, hm: '04:34', until: '05:41' },
    cam: (u) => {
      const p = [40, lerp(96, 86, u), lerp(56, 60, easeSine(u))];
      return { pos: p, look: dirLook(p, 258 + 177 * easeIO(u), lerp(6, 3.5, easeSine(u))) };
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
    id: 'taki', at: 624, len: 144, ...ABS, fov: 52, cap: { ja: 'Taki Plaza', en: 'TAKI PLAZA', sub: '段々の木の屋根と、地下へ光を落とす明かり取り' },
    env: { day: SPRING, hm: '13:00', preset: 'fair' },
    cam: (u) => ({ pos: orbit([104, 170], 82, lerp(76, 68, u), lerp(38, -22, easeIO(u))), look: [104, 167, 30] }),
  },
  {
    id: 'gate', at: 768, len: 144, ...ABS, fov: 50, cap: { ja: '正門', en: 'MAIN GATE', sub: '斜めの格子の柵・ステンレスの輪・銘板' },
    env: { day: SPRING, hm: '08:00', preset: 'fair' },
    cam: (u) => {
      const e = easeIO(u);
      return { pos: track([[0, [142.5, 249, 35.5]], [0.55, [141.8, 238, 35.2]], [1, [141, 230.8, 35.0]]], e), look: track([[0, [132, 228, 34.5]], [0.6, [133, 233, 34.6]], [1, [134.9, 232.7, 34.75]]], e) };
    },
  },
  {
    id: 'station', at: 912, len: 144, ...ABS, fov: 52, cap: { ja: '大岡山駅', en: 'OOKAYAMA STATION', sub: '壁面緑化の塔と、ガラスの片流れの屋根' },
    env: { day: SPRING, hm: '08:10', preset: 'fair' },
    cam: (u) => {
      const e = easeIO(u);
      return { pos: track([[0, [146, 252, 45]], [1, [160, 245, 72]]], e), look: track([[0, [204, 284, 48]], [1, [228, 300, 44]]], e) };
    },
  },
  {
    id: 's4', at: 1056, len: 144, ...ABS, fov: 52, cap: { ja: '南4号館', en: 'SOUTH BLDG. 4', sub: 'れんがの 1 階と、イチョウ並木' },
    env: { day: '2026-05-10', hm: '14:30', preset: 'fair' },
    cam: (u) => {
      const e = easeIO(u);
      return { pos: track([[0, [108, -196, 66]], [1, [102, -127, 47]]], e), look: track([[0, [66, -165, 40]], [1, [66, -160, 38]]], e) };
    },
  },
  {
    id: 'elsi', at: 1200, len: 144, ...ABS, fov: 52, cap: { ja: '地球生命研究所', en: 'ELSI-1', sub: '柱の外へ張り出した、長さ 85m の箱' },
    env: { day: SPRING, hm: '16:20', preset: 'fair' },
    cam: (u) => {
      const e = easeIO(u);
      return { pos: track([[0, [56, -284, 39]], [1, [152, -289, 40]]], e), look: track([[0, [90, -316, 38]], [1, [120, -319, 38]]], e) };
    },
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
    id: 'porch', at: 1920, len: 96, ...ABS, fov: 64, warm: 90, cap: { ja: '屋根の下には降らない', en: 'RAIN', sub: '雨粒は屋根・ひさしの高さで止まる' },
    env: { day: '2026-06-20', hm: '11:00', preset: 'heavy', set: { wind: 3 } },
    cam: (u) => {
      const x = lerp(32.5, 47.5, easeIO(u));
      return { pos: [x, 12.8, 34.7], look: [x + 2, 45, 35.8] };
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
    id: 'year', at: 2112, len: 384, ...ABS, fov: 50, cap: { ja: '季節がめぐる', en: 'SEASONS', sub: '樹種ごとの暦：芽吹き・開花・紅葉・落葉' },
    env: { day: '2026-01-15', hm: '14:00' },
    timeline: (u) => ({ day: doyToDay(yearDoy(u)), hm: '14:00' }),
    cam: (u) => ({ pos: orbit([40, 84], 56, lerp(69, 64, u), lerp(266, 312, easeSine(u))), look: [40, 80, 36] }),
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
  // ── 歩いて見る：駅の改札 → 交差点 → 正門 → 明かり取り → Taki Plaza の中 ──
  {
    id: 'stnin', at: 2880, len: 192, ...ABS, fov: 64, detail: true, cap: { ja: '歩いて見る', en: 'WALK', sub: '駅の改札から、目の高さで' },
    env: { day: '2026-05-18', hm: '08:30', speed: 1, preset: 'fair' },
    cam: (u) => {
      const e = easeIO(u);
      return {
        pos: track([[0, [198, 294.2, 34.6]], [0.42, [188, 291.1, 34.5]], [0.8, [177, 286.5, 34.6]], [1, [172.5, 280, 34.6]]], e),
        look: track([[0, [186, 291, 34.4]], [0.42, [176, 288, 34.4]], [0.8, [166, 276, 34.6]], [1, [160, 266, 34.8]]], e),
      };
    },
  },
  {
    id: 'xing', at: 3072, len: 192, ...ABS, fov: 62, cap: { ja: '駅前の交差点', en: 'CROSSING', sub: '信号・横断歩道・点字ブロック' },
    env: { day: '2026-05-18', hm: '08:31', speed: 1, preset: 'fair' },
    cam: (u) => {
      const e = easeIO(u);
      return { pos: track([[0, [172.5, 279, 34.8]], [0.5, [160, 260, 34.9]], [1, [146, 241, 35.6]]], e), look: track([[0, [160, 263, 35]], [0.5, [146, 241, 35.3]], [1, [132, 228, 35.4]]], e) };
    },
  },
  {
    id: 'gatewalk', at: 3264, len: 192, ...ABS, fov: 64, cap: { ja: '明かり取りへ', en: 'INTO CAMPUS', sub: '広場から、木の大階段で地下へ' },
    env: { day: '2026-05-18', hm: '08:35', preset: 'fair' },
    cam: (u) => {
      const e = easeIO(u);
      return {
        pos: track([[0, [139, 231, 35.6]], [0.22, [137.5, 210, 35.6]], [0.42, [124, 199, 35.6]], [0.64, [107, 189, 34.6]], [0.86, [97, 177, 30.4]], [1, [96.5, 171, 28.4]]], e),
        look: track([[0, [136, 205, 35.4]], [0.22, [124, 196, 35]], [0.42, [108, 188, 33.5]], [0.64, [95, 172, 29]], [0.86, [100, 160, 28]], [1, [101, 150, 28.6]]], e),
      };
    },
  },
  {
    id: 'takiin1', at: 3456, len: 192, ...ABS, fov: 66, detail: true, cap: { ja: 'Taki Plaza の中へ', en: 'INSIDE', sub: '図面から起こした地下 2 階〜3 階' },
    env: { day: '2026-05-18', hm: '12:00', preset: 'fair' },
    cam: (u) => {
      const e = easeIO(u);
      return {
        pos: track([[0, [94, 175, 27.6]], [0.32, [96.5, 168, 28.6]], [0.55, [98.5, 163.5, 30.9]], [0.75, [100, 160, 31.1]], [1, [101.5, 157, 31.1]]], e),
        look: track([[0, [99, 156, 27.2]], [0.35, [100, 150, 29.5]], [0.7, [100, 142, 31]], [1, [99, 138, 31.6]]], e),
      };
    },
  },
  {
    id: 'takiin2', at: 3648, len: 192, ...ABS, fov: 66, detail: true, cap: { ja: '吹き抜けを昇る', en: 'UP', sub: '地下 1 階 → 1 階 → 2 階' },
    env: { day: '2026-05-18', hm: '12:01', preset: 'fair' },
    cam: (u) => {
      const e = easeIO(u);
      return {
        pos: track([[0, [104, 162, 31.2]], [0.4, [108, 157, 33.4]], [0.75, [107, 151, 36.2]], [1, [104.5, 146, 39.6]]], e),
        look: track([[0, [108, 150, 31.6]], [0.4, [102, 140, 34.6]], [0.75, [99, 134, 36.6]], [1, [97, 130, 39.2]]], e),
      };
    },
  },
  {
    id: 'takiin3', at: 3840, len: 192, ...ABS, fov: 66, detail: true, cap: { ja: '地下 2 階からドライガーデンへ', en: 'LIFT OFF', sub: '' },
    env: { day: '2026-05-18', hm: '12:03', preset: 'fair' },
    cam: (u) => {
      const e = easeIO(u);
      return {
        pos: track([[0, [98, 150, 27.4]], [0.35, [107, 157, 27.4]], [0.55, [114.6, 162.5, 28.2]], [0.8, [114.8, 163.4, 44]], [1, [112, 176, 62]]], e),
        look: track([[0, [106, 158, 27]], [0.35, [115, 163, 27.5]], [0.55, [115, 168, 36]], [0.8, [114, 180, 52]], [1, [106, 158, 30]]], e),
      };
    },
  },
  // ── 夜 ──
  {
    id: 'trains', at: 4032, len: 144, ...ABS, fov: 50, cap: { ja: '電車が走る', en: 'TRAINS', sub: '東急線は時刻表どおりに' },
    env: { day: '2026-11-10', hm: '17:07:36', speed: 1, preset: 'clear' },
    cam: (u) => {
      const e = easeIO(u);
      return { pos: track([[0, [-36, 146, 60]], [1, [-50, 158, 50]]], e), look: track([[0, [-95, 195, 32]], [1, [-92, 200, 33]]], e) };
    },
  },
  {
    id: 'moonrise', at: 4176, len: 144, ...ABS, cap: { ja: '月が昇る', en: 'MOONRISE', sub: '満ち欠けも、昇る方角も計算どおり' },
    env: { day: '2026-11-24', hm: '17:00', speed: 30, preset: 'clear' },
    cam: (u) => {
      const p = [lerp(-79, -75.5, u), lerp(-49, -47.6, u), 48];
      return { pos: p, look: dirLook(p, 69.3, lerp(11.0, 11.5, u)), fov: lerp(15, 12, easeSine(u)) };
    },
  },
  {
    id: 'seven', at: 4320, len: 96, ground: P.s4, fov: 60, cap: { ja: '夜の明かり', en: 'NIGHT', sub: '街灯・窓・お店の灯り' },
    env: { day: '2026-11-10', hm: '20:20' },
    cam: (u) => {
      const e = easeIO(u);
      return { pos: track([[0, [91, -174, 2.0]], [1, [88, -166, 2.2]]], e), look: track([[0, [65, -167, 2.3]], [1, [64, -164, 2.4]]], e) };
    },
  },
  // ── たたみかける（1 小節ずつ）──
  ...[
    { id: 'm_lib', ground: P.lib, env: { day: '2026-10-20', hm: '16:40', preset: 'fair' }, a: [[18, 150, 6], [20, 168, 7]], l: [[46, 168, 6], [46, 180, 6]] },
    { id: 'm_hyaku', ground: P.hyaku, env: { day: '2026-11-10', hm: '21:30' }, a: [[150, 260, 14], [160, 236, 16]], l: [[115, 224.8, 11], [115, 224.8, 11]] },
    { id: 'm_elsi', ground: P.elsi, env: { day: '2026-10-20', hm: '10:30', preset: 'fair' }, a: [[110, -280, 6], [96, -282, 7]], l: [[104, -314, 8], [100, -316, 8]] },
    { id: 'm_ud', ground: P.ud, env: { day: '2026-10-20', hm: '12:30', preset: 'fair' }, a: [[74.7, -262, 1.6], [74.7, -272, 1.4]], l: [[74.7, -300, 0], [74.7, -310, -1]] },
    { id: 'm_mc', ground: P.mc, env: { day: '2026-10-20', hm: '19:30' }, a: [[150, 262, 3], [156, 256, 3]], l: [[170, 240, 8], [172, 238, 9]] },
    { id: 'm_s4', ground: P.s4, env: { day: '2026-10-20', hm: '11:30', preset: 'fair' }, a: [[40, -150, 1.7], [44, -158, 1.7]], l: [[60, -160, 2.5], [62, -166, 2.5]] },
    { id: 'm_b2', groundZ: 0, ground: [40, 80], detail: true, env: { day: '2026-10-20', hm: '12:00', preset: 'fair' }, a: [[93, 163, 27.4], [100, 151, 27.4]], l: [[104, 151, 26.6], [110, 146, 26.8]] },
    { id: 'm_k70', ground: P.k70, env: { day: '2026-10-20', hm: '09:30', preset: 'fair' }, a: [[30, 160, 16], [36, 150, 13]], l: [[0, 122, 6], [2, 122, 5]] },
  ].map((m, i) => ({
    id: m.id, at: 4416 + i * BAR, len: BAR, ground: m.ground, groundZ: m.groundZ, detail: m.detail, fov: 54, env: m.env, montage: true,
    cam: (u) => ({ pos: lerp3(m.a[0], m.a[1], u), look: lerp3(m.l[0], m.l[1], u) }),
  })),
  // ── フィナーレ：夕日の中を高く昇って、キャンパス全体へ。日が沈み、街灯がともる ──
  {
    id: 'finale', at: 4800, len: TL.total - 4800, ground: P.deck, fov: 48,
    env: { day: '2026-11-10', hm: '16:08', until: '17:02' },
    cam: (u) => {
      const e = easeIO(clamp01(u / 0.66));
      return {
        pos: track([[0, [60, 150, 10]], [0.4, [20, 190, 55]], [1, [-90, 300, 150]]], e),
        look: track([[0, [40, 60, 12]], [1, [55, -10, 0]]], e),
      };
    },
  },
];

// 映像の中で各カットを使う区間（次のカットの頭まで）
export const shotById = Object.fromEntries(SHOTS.map((s) => [s.id, s]));
