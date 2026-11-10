// 環境の状態（デジタルツインの芯 2：2026-11-10）：時刻（campus3dClock）から、太陽・月・星・季節（木ごと）・天気を決める。
// どの値にも出どころ（観測・計算・推定・演出・手動）をつける。データがないものは「不明」にして、もっともらしい値を事実として扱わない。
// 描き方（空・木・雨）はこの状態を読むだけ（芯 3）。DOM も MapLibre も使わない
import { SUN_SITE, sunPosition } from "./campus3dSky.js";
import { dayOfYear } from "./campus3dClock.js";

const DEG = Math.PI / 180;
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const smooth = (a, b, x) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

// 出どころ
export const SRC = {
  computed: "計算",
  estimated: "推定",
  observed: "観測",
  stylized: "演出",
  manual: "手動（デバッグ）",
  unknown: "不明",
};

// ── 月（SunCalc と同じ低精度の式。1〜2° ほど）と満ち欠け ──
// 2000 年 1 月 1 日 12 時（UT）からの日数
const daysJ2000 = (date) => date.getTime() / 86400000 + 2440587.5 - 2451545.0;
const OBL = 23.4397 * DEG;
function eclToEq(lon, lat) {
  const ra = Math.atan2(Math.sin(lon) * Math.cos(OBL) - Math.tan(lat) * Math.sin(OBL), Math.cos(lon));
  const dec = Math.asin(Math.sin(lat) * Math.cos(OBL) + Math.cos(lat) * Math.sin(OBL) * Math.sin(lon));
  return { ra, dec };
}
// 地方恒星時（ラジアン）
export function siderealTime(date, lng = SUN_SITE.lng) {
  const n = daysJ2000(date);
  const gmst = (((18.697374558 + 24.06570982441908 * n) % 24) + 24) % 24;
  return ((gmst * 15 + lng) % 360) * DEG;
}
function horizontal(ra, dec, date, lat = SUN_SITE.lat, lng = SUN_SITE.lng) {
  const H = siderealTime(date, lng) - ra;
  const phi = lat * DEG;
  const el = Math.asin(Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(H));
  const az = Math.atan2(-Math.sin(H), Math.tan(dec) * Math.cos(phi) - Math.sin(phi) * Math.cos(H));
  return { elevation: el / DEG, azimuth: (((az / DEG) % 360) + 360) % 360 };
}
export function moonPosition(date) {
  const d = daysJ2000(date);
  const L = (218.316 + 13.176396 * d) * DEG;
  const M = (134.963 + 13.064993 * d) * DEG;
  const F = (93.272 + 13.22935 * d) * DEG;
  const lon = L + 6.289 * DEG * Math.sin(M);
  const lat = 5.128 * DEG * Math.sin(F);
  const dist = 385001 - 20905 * Math.cos(M); // km
  const { ra, dec } = eclToEq(lon, lat);
  const h = horizontal(ra, dec, date);
  // 地平視差（月は近いので、地上から見ると少し低い）
  const par = Math.asin(6378.14 / dist) / DEG;
  h.elevation -= par * Math.cos(h.elevation * DEG);
  // 満ち欠け：太陽との離角から光っている割合
  const ms = daysJ2000(date);
  const sM = (357.5291 + 0.98560028 * ms) * DEG;
  const sL = sM + (1.9148 * Math.sin(sM) + 0.02 * Math.sin(2 * sM) + 0.0003 * Math.sin(3 * sM)) * DEG + 102.9372 * DEG + Math.PI;
  const sun = eclToEq(sL, 0);
  const phi = Math.acos(Math.min(1, Math.max(-1, Math.sin(sun.dec) * Math.sin(dec) + Math.cos(sun.dec) * Math.cos(dec) * Math.cos(sun.ra - ra))));
  const inc = Math.atan2(149598000 * Math.sin(phi), dist - 149598000 * Math.cos(phi));
  const lit = (1 + Math.cos(inc)) / 2;
  const waxing = ((lon - sL) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) < Math.PI;
  return { ...h, lit, waxing, dist };
}

// 高さ・方位（度。方位は北 0・時計回り）→ 東・北・上の単位ベクトル
export function dirOf({ elevation, azimuth }) {
  const e = elevation * DEG;
  const a = azimuth * DEG;
  return [Math.cos(e) * Math.sin(a), Math.cos(e) * Math.cos(a), Math.sin(e)];
}
// 星を回すための行列：東・北・上の向き d → 天球に固定した向き（x：春分点・z：天の北極）。行ごとに [r0, r1, r2]
export function starMatrix(date, lat = SUN_SITE.lat) {
  const phi = lat * DEG;
  const lst = siderealTime(date);
  const mer = [0, -Math.sin(phi), Math.cos(phi)]; // 子午線上の天の赤道（時角 0）
  const east = [1, 0, 0]; // 東の点（赤経が lst + 90°）
  const pole = [0, Math.cos(phi), Math.sin(phi)];
  const c = Math.cos(lst);
  const s = Math.sin(lst);
  // v = Rz(lst) · [mer·d, east·d, pole·d]
  return [
    [c * mer[0] - s * east[0], c * mer[1] - s * east[1], c * mer[2] - s * east[2]],
    [s * mer[0] + c * east[0], s * mer[1] + c * east[1], s * mer[2] + c * east[2]],
    pole,
  ];
}

// ── 季節（植物の暦） ──
// 樹種ごとの節目（その年の何日目。1 月 1 日が 0）。木ごとに spread 日だけずらす（日当たり・個体差）。
// src：その値の出どころ。東京の平年値（気象庁 1991〜2020）は「観測の平年値」だが、このキャンパスの木そのものではないので「推定」
export const SPECIES = {
  ginkgo: {
    name: "イチョウ", deciduous: true, spread: 5,
    leafOut: [96, 118], // 芽吹き（4/6）〜葉がそろう（4/28）
    color: [312, 327], // 色づきはじめ（11/8）〜黄葉（11/23：気象庁の東京の黄葉日の平年。報道の平年差から逆算）
    fall: [329, 345], // 落葉（11/25〜12/11）
    litterDays: 18, // 落ち葉が地面に残る日数（掃除・風で減る）
    nuts: [262, 330], // ギンナンが落ちる（9/19〜11/26。雌の木だけ）
    // 色づいた葉：autumn と autumn2 を葉の塊ごとにまぜる。brown は落ちる前の茶色（イチョウは黄色のまま落ちる）
    green: "#5f8a3a", young: "#a9c860", autumn: "#efc21c", autumn2: "#e2cf4a",
    src: "黄葉は気象庁 東京の平年（11/23 ごろ）を基準。ほかは一般的な時期（推定）",
  },
  cherry: {
    name: "ソメイヨシノ", deciduous: true, spread: 3,
    bloom: [82, 89, 100], // 開花（3/24：気象庁 東京の平年）・満開（3/31：同）・散る（4/10）
    leafOut: [92, 112], // 花のあとに葉（4/2〜4/22）
    color: [290, 315], // 早く色づく（10/17〜11/11）
    fall: [305, 336], // 落葉（11/1〜12/2）
    litterDays: 12,
    // 桜紅葉：くすんだ赤が主で、橙・黄がまじる（ウェザーニュースの解説）。色づきはじめは黄・橙寄り
    green: "#5d8740", young: "#9cc25c", autumn: "#a8432f", autumn2: "#dba23c", brown: "#8a5a3a", blossom: "#f6d9e2",
    src: "開花 3/24・満開 3/31 は気象庁 東京の平年値（1991〜2020）。紅葉の色（くすんだ赤に橙・黄）は解説記事。時期は一般的な時期（推定）",
  },
  zelkova: {
    name: "ケヤキ", deciduous: true, spread: 5,
    leafOut: [90, 112], color: [312, 330], fall: [326, 348], litterDays: 14,
    green: "#5a8540", young: "#a3c463", autumn: "#b0582c", autumn2: "#c99a3c", brown: "#7f5636",
    src: "一般的な時期・色（推定）",
  },
  evergreen: {
    name: "常緑の広葉樹（クスノキなど）", deciduous: false, spread: 6,
    flush: [110, 140], // 新芽（4/20〜5/20。赤みのある明るい葉）
    green: "#4e7a3a", young: "#9db45a",
    src: "常緑。新芽の時期は一般的な時期（推定）",
  },
  cedar: {
    name: "ヒマラヤスギ", deciduous: false, spread: 4,
    flush: [115, 150], green: "#45653e", young: "#7f9a5e",
    src: "常緑（推定）",
  },
  palm: {
    name: "シュロ", deciduous: false, spread: 4,
    green: "#5a7a3c", young: "#5a7a3c",
    src: "常緑（推定）",
  },
};
// 地図の木の kind → 樹種（broad は名前から。ケヤキ以外の broad はわからないので常緑とみなさない＝落葉広葉樹のケヤキ扱い）
export function speciesOf(f) {
  const k = f.kind;
  if (k === "ginkgo") return "ginkgo";
  if (k === "cherry") return "cherry";
  if (k === "cedar" || k === "conifer") return "cedar";
  if (k === "palm") return "palm";
  if (k === "broad") return /サクラ|ソメイヨシノ/.test(f.name || "") ? "cherry" : "zelkova";
  return "evergreen"; // round（クスノキなど）
}
export const SPECIES_ORDER = ["ginkgo", "cherry", "zelkova", "evergreen", "cedar", "palm"];

// その日（doy）の樹種の状態：leaf（葉の量 0〜1）、young（若葉の明るさ 0〜1）、autumn（色づき 0〜1）、bloom（花 0〜1）、
// petals（散った花びら 0〜1）、litter（落ち葉 0〜1）、nuts（ギンナン 0〜1）。木の層（campus3dVeg）のシェーダーも同じ式（木ごとに日をずらす）
export function phenology(spKey, doy) {
  const sp = SPECIES[spKey];
  const st = { leaf: 1, young: 0, autumn: 0, bloom: 0, petals: 0, litter: 0, nuts: 0 };
  if (!sp) return st;
  if (sp.deciduous) {
    const [o0, o1] = sp.leafOut;
    const [c0, c1] = sp.color;
    const [f0, f1] = sp.fall;
    // 葉の量：芽吹きから増え、落葉で減る（冬は葉なし）
    const grow = smooth(o0, o1, doy);
    const drop = 1 - smooth(f0, f1, doy);
    st.leaf = Math.min(grow, drop);
    // 若葉：芽吹きから 3 週間ほど明るい
    st.young = st.leaf > 0 ? 1 - smooth(o1 - 4, o1 + 18, doy) : 0;
    st.autumn = smooth(c0, c1, doy);
    // 落ち葉：落葉が進むと増え、落葉が終わってから litterDays で減る
    const fallen = smooth(f0 - 6, f1, doy);
    st.litter = fallen * (1 - smooth(f1, f1 + sp.litterDays, doy));
    if (sp.bloom) {
      const [b0, b1, b2] = sp.bloom;
      st.bloom = smooth(b0 - 2, b1, doy) * (1 - smooth(b1 + 2, b2, doy));
      st.petals = smooth(b1, b1 + 5, doy) * (1 - smooth(b2, b2 + 8, doy));
    }
    if (sp.nuts) st.nuts = smooth(sp.nuts[0], sp.nuts[0] + 20, doy) * (1 - smooth(sp.nuts[1], sp.nuts[1] + 14, doy));
  } else if (sp.flush) {
    const [a, b] = sp.flush;
    st.young = smooth(a, a + 10, doy) * (1 - smooth(b - 8, b + 6, doy));
  }
  return st;
}
// 芝生（コウライシバ）：4 月なかばから緑、11 月から枯れ色（推定）
export function lawnGreen(doy) {
  return smooth(98, 128, doy) * (1 - smooth(300, 330, doy));
}

// ── 天気 ──
// 雲 cloud（0〜1 の量）・暗さ dark（雨雲 0〜1）・雨 rain（mm/h）・雪 snow（mm/h）・風 wind（m/s）と風の吹いてくる向き windDir（度。北 0・時計回り）・
// 霧 fog（見通し m。大きいほど晴れ）・雷 thunder・濡れ wet（0〜1）・積雪 snowCover（0〜1）。wet・snowCover は auto なら雨・雪から時間で決める
export const WEATHER_PRESETS = {
  clear: { label: "快晴", cloud: 0, dark: 0, rain: 0, snow: 0, wind: 1.5, fog: 30000, thunder: false, type: "cumulus" },
  fair: { label: "晴れ", cloud: 0.28, dark: 0, rain: 0, snow: 0, wind: 2.5, fog: 25000, thunder: false, type: "cumulus" },
  hazy: { label: "うす曇り", cloud: 0.55, dark: 0.05, rain: 0, snow: 0, wind: 2, fog: 9000, thunder: false, type: "cirrus" },
  cloudy: { label: "くもり", cloud: 0.86, dark: 0.3, rain: 0, snow: 0, wind: 3, fog: 15000, thunder: false, type: "stratus" },
  drizzle: { label: "小雨", cloud: 0.95, dark: 0.45, rain: 1.2, snow: 0, wind: 2.5, fog: 7000, thunder: false, type: "stratus" },
  rain: { label: "雨", cloud: 1, dark: 0.62, rain: 6, snow: 0, wind: 4, fog: 4000, thunder: false, type: "stratus" },
  heavy: { label: "大雨", cloud: 1, dark: 0.82, rain: 30, snow: 0, wind: 7, fog: 1200, thunder: false, type: "stratus" },
  storm: { label: "雷雨", cloud: 1, dark: 0.93, rain: 40, snow: 0, wind: 10, fog: 1500, thunder: true, type: "cumulonimbus" },
  typhoon: { label: "台風", cloud: 1, dark: 0.85, rain: 25, snow: 0, wind: 20, fog: 900, thunder: false, type: "stratus" },
  fog: { label: "霧", cloud: 0.7, dark: 0.1, rain: 0, snow: 0, wind: 0.5, fog: 160, thunder: false, type: "stratus" },
  snow: { label: "雪", cloud: 1, dark: 0.35, rain: 0, snow: 2, wind: 2, fog: 1500, thunder: false, type: "stratus" },
  gale: { label: "強風", cloud: 0.45, dark: 0.1, rain: 0, snow: 0, wind: 15, fog: 20000, thunder: false, type: "cumulus" },
};
export const WEATHER_ORDER = ["clear", "fair", "hazy", "cloudy", "drizzle", "rain", "heavy", "storm", "typhoon", "fog", "snow", "gale"];
const W_KEYS = ["cloud", "dark", "rain", "snow", "wind", "windDir", "fog", "thunder", "type"];

// 天気の状態（ふだんは観測なし＝不明。デバッグで決めたら手動）。濡れ・積雪は時間で積もる・乾く
export function weatherCreate() {
  return {
    src: "unknown", preset: null,
    cloud: 0, dark: 0, rain: 0, snow: 0, wind: 2, windDir: 200, fog: 30000, thunder: false, type: "cumulus",
    wet: 0, wetAuto: true, snowCover: 0, snowAuto: true,
    at: null, // 最後に積もる・乾くを進めた時刻（世界の時刻 ms）
  };
}
// プリセットを当てる（風向きはそのまま）。雨・雪のプリセットは「しばらく降っている」ところ：濡れ・積雪（自動のとき）も最初から
export function weatherPreset(W, key) {
  const p = WEATHER_PRESETS[key];
  if (!p) return W;
  for (const k of W_KEYS) if (k in p && k !== "windDir") W[k] = p[k];
  W.preset = key;
  W.src = "manual";
  if (p.rain > 0 && W.wetAuto) W.wet = Math.max(W.wet, Math.min(1, 0.6 + p.rain / 20));
  if (p.snow > 0 && W.snowAuto) W.snowCover = Math.max(W.snowCover, 0.65);
  return W;
}
// ひとつの値を変える（プリセットからはずれる）
export function weatherSet(W, patch) {
  Object.assign(W, patch);
  if (Object.keys(patch).some((k) => W_KEYS.includes(k))) {
    W.preset = null;
    W.src = "manual";
  }
  return W;
}
// 濡れ・積雪を世界の時刻で進める：雨で濡れ（強いほど速い。10 分ほどで濡れきる）、やむと日差し・風で乾く（数時間）。
// 雪は 1 時間 2mm で 3 時間ほどで白く、0 度より上（雪が降っていない）なら数時間で解ける。sunEl は太陽の高さ（度）
export function weatherStep(W, timeMs, sunEl = 30) {
  if (W.at == null || !Number.isFinite(W.at)) {
    W.at = timeMs;
    return W;
  }
  let dt = (timeMs - W.at) / 3600000; // 時間
  W.at = timeMs;
  if (!(dt > 0)) return W; // 戻したときは今のまま
  dt = Math.min(dt, 48);
  if (W.wetAuto) {
    if (W.rain > 0.05) W.wet = 1 - (1 - W.wet) * Math.exp(-dt * (2 + W.rain * 1.5));
    else {
      const dry = 0.25 + 0.6 * clamp01(sunEl / 40) * (1 - W.cloud * 0.7) + 0.04 * W.wind; // 1 時間あたり
      W.wet *= Math.exp(-dt * dry);
    }
  }
  if (W.snowAuto) {
    if (W.snow > 0.05) W.snowCover = Math.min(1, W.snowCover + dt * W.snow * 0.17);
    else W.snowCover *= Math.exp(-dt * (0.15 + 0.35 * clamp01(sunEl / 40)));
  }
  return W;
}

// ── 雷（演出：鳴っているかは天気の状態 thunder のとおり。いつ・どこで光るかは乱数）──
// 1 回の稲妻：kind（"cg" 落雷＝雲の底から地面まで光の道が見える・"ic" 雲の中で光る）、方位 az（度。北 0・時計回り）・距離 dist（km）、
// 光って見える高さの角 el（度。稲妻の上の雲の底）、光の山 pulses（落雷は帰還雷撃 1〜4 回、雲の中は 2〜6 回のちらつき）。明るさは近いほど大きい（3km で 1）。
// 光の道 segs は角度の折れ線 [x0, y0, x1, y1]（x：方位からの横の角、y：高さの角。ラジアン）。はじめの mainN 本が幹、あとが枝
export const STORM_BASE_KM = 1.2; // 積乱雲の底の高さ（空のレイヤーの雲と同じ）
export const BOLT_SEGS = 16;
export function lightningCreate(seed = Date.now()) {
  let s = seed >>> 0 || 1;
  const rnd = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
  return { rnd, next: 0, strike: null, last: null, count: 0, level: 0, channel: 0 };
}
function makeBolt(rnd, dist) {
  const top = Math.atan2(STORM_BASE_KM, dist);
  const bot = Math.atan2(-0.03, dist);
  const MAIN = 11;
  const w = Array.from({ length: MAIN }, () => 0.7 + 0.6 * rnd());
  const sum = w.reduce((a, b) => a + b, 0);
  const pts = [[0, top]];
  let x = 0;
  let y = top;
  let th = (rnd() - 0.5) * 0.5;
  for (let i = 0; i < MAIN; i++) {
    const dy = ((top - bot) * w[i]) / sum;
    th = Math.max(-0.9, Math.min(0.9, th * 0.4 + (rnd() - 0.5) * 1.4)); // 折れ曲がり（前の向きを少し残す）
    x += dy * Math.tan(th);
    y -= dy;
    pts.push([x, i === MAIN - 1 ? bot : y]);
  }
  const segs = [];
  for (let i = 0; i < MAIN; i++) segs.push([pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1]]);
  // 枝：幹の上のほうから 2 本（3 本・2 本の線。地面までは届かない）
  const step = (top - bot) / MAIN;
  for (const n of [3, 2]) {
    let [bx, by] = pts[1 + Math.floor(rnd() * 5)];
    let bt = (rnd() < 0.5 ? -1 : 1) * (0.55 + 0.4 * rnd());
    for (let j = 0; j < n; j++) {
      const dy = step * (0.55 + 0.35 * rnd());
      bt = Math.max(-1.2, Math.min(1.2, bt + (rnd() - 0.5) * 0.5));
      const nx = bx + dy * Math.tan(bt);
      segs.push([bx, by, nx, by - dy]);
      bx = nx;
      by -= dy;
    }
  }
  return { segs, mainN: MAIN };
}
function makeStrike(rnd, now, o = {}) {
  const cg = o.kind ? o.kind === "cg" : rnd() < 0.32;
  const az = Number.isFinite(o.az) ? o.az : rnd() * 360;
  const dist = Number.isFinite(o.dist) ? o.dist : 1.5 + 15 * rnd();
  const pulses = [];
  let t = 0;
  if (cg) {
    const n = 1 + Math.floor(rnd() * 3.6);
    for (let i = 0; i < n; i++) {
      pulses.push({ t, a: i === 0 ? 1 : 0.5 + 0.45 * rnd(), tau: 45 + 30 * rnd(), ch: 1 });
      t += 40 + 90 * rnd();
    }
    pulses.push({ t: 0, a: 0.16, tau: 260, ch: 0 }); // あとに続く弱い光
  } else {
    const n = 2 + Math.floor(rnd() * 5);
    for (let i = 0; i < n; i++) {
      pulses.push({ t, a: 0.3 + 0.6 * rnd(), tau: 50 + 90 * rnd(), ch: 0 });
      t += 50 + 170 * rnd();
    }
  }
  const s = {
    kind: cg ? "cg" : "ic", az, dist, t0: now, dur: t + 1200, pulses,
    power: Math.min(1.6, Math.max(0.14, 3 / dist)),
    el: (Math.atan2(STORM_BASE_KM * (cg ? 0.8 : 1), dist) * 180) / Math.PI,
    segs: null, mainN: 0,
  };
  if (cg) Object.assign(s, makeBolt(rnd, dist));
  return s;
}
// デバッグ：いま光らせる（kind・az・dist を決めてもよい）。hold なら最初の光のまま止める（画面を撮る確かめ用）
export function lightningForce(L, now, o = {}) {
  const s = makeStrike(L.rnd, now, o);
  if (o.hold) {
    s.pulses = [{ ...s.pulses[0], tau: 1e12 }];
    s.dur = 1e15;
  }
  L.strike = s;
  L.count++;
  L.last = { n: L.count, kind: s.kind, az: s.az, dist: s.dist };
  L.next = o.hold ? Infinity : now + 3000 + 6000 * L.rnd();
  return s;
}
/**
 * 雷を now（ミリ秒。performance.now でよい）まで進める。W は天気の状態（thunder で鳴る。観測なしなら鳴らない）。
 * L.level：いまの明るさ（0〜1.6。空・建物の光）、L.channel：光の道の明るさ（落雷のとき）、L.strike：いまの稲妻（なければ null）、L.last：最後の稲妻
 */
export function lightningStep(L, W, now) {
  if (!(W && W.src !== "unknown" && W.thunder)) {
    L.strike = null;
    L.level = 0;
    L.channel = 0;
    L.next = 0;
    return L;
  }
  if (!L.next) L.next = now + 500 + 2000 * L.rnd();
  if (now >= L.next) {
    L.strike = makeStrike(L.rnd, now);
    L.count++;
    L.last = { n: L.count, kind: L.strike.kind, az: L.strike.az, dist: L.strike.dist };
    // 次まで：平均 9 秒ほど（指数分布。1.5〜30 秒）
    L.next = now + Math.min(30000, 1500 - Math.log(1 - 0.999 * L.rnd()) * 7500);
  }
  const S = L.strike;
  let lv = 0;
  let ch = 0;
  if (S) {
    const t = now - S.t0;
    for (const p of S.pulses) {
      if (t < p.t) continue;
      lv += p.a * Math.exp(-(t - p.t) / p.tau);
      if (p.ch) ch += p.a * Math.exp(-(t - p.t) / (p.tau * 0.6));
    }
    lv *= S.power;
    if (t > S.dur) L.strike = null;
  }
  L.level = Math.min(1.6, lv);
  L.channel = Math.min(1.5, ch);
  return L;
}

/**
 * いまの環境。date は世界の時刻、W は天気の状態（weatherCreate）、fixedSun は見え方を昼・夕方・夜に決めたときの太陽
 * @returns { date, doy, sun, moon, stars, weather, light, prov }
 */
export function envAt(date, W, fixedSun = null) {
  const sun = fixedSun ? { ...fixedSun } : sunPosition(date);
  sun.dir = dirOf(sun);
  const moon = moonPosition(date);
  moon.dir = dirOf(moon);
  const doy = dayOfYear(date.getTime());
  const plants = {};
  for (const k of SPECIES_ORDER) plants[k] = phenology(k, doy);
  const known = W && W.src !== "unknown";
  return {
    date, doy, sun, moon, plants,
    lawn: lawnGreen(doy),
    stars: starMatrix(date),
    weather: W,
    prov: {
      sun: { kind: fixedSun ? SRC.stylized : SRC.computed, note: fixedSun ? "見え方を固定（昼・夕方・夜）" : "NOAA の近似式（誤差 約 1°）" },
      moon: { kind: SRC.computed, note: "低精度の式（誤差 1〜2°）・満ち欠け" },
      stars: { kind: SRC.stylized, note: "星の並びは作りもの（地球の回転・緯度は計算どおり）" },
      plants: { kind: SRC.estimated, note: "樹種ごとの時期（気象庁 東京の平年値などから）＋木ごとのずれ" },
      lawn: { kind: SRC.estimated, note: "コウライシバの一般的な時期" },
      weather: known ? { kind: W.src === "manual" ? SRC.manual : SRC.observed, note: W.preset ? WEATHER_PRESETS[W.preset].label : "値を決めた" } : { kind: SRC.unknown, note: "観測データなし（雲・雨なしで描く）" },
      ...(known && W.thunder ? { thunder: { kind: SRC.stylized, note: "光る時刻・方位・距離・形は乱数（雷があるかは天気どおり）" } } : {}),
      ...(known && (W.rain > 0 || W.snow > 0) ? { precip: { kind: SRC.estimated, note: "粒の落ちる速さは雨の強さから計算（Marshall–Palmer・Atlas の式）。地面近くの風の弱まり（目の高さで天気の風の 0.45 倍）は推定。突風は演出" } } : {}),
    },
  };
}
