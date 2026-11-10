// 3D表示の「時刻の見え方」：昼・夕方・夜。キャンパス（大岡山）での太陽の高さと方位を時刻から計算し、
// 地図の色（パレット）・光の向きと色・空（画面の上のもや）・夜の街灯と電車の窓あかりを決める。
// 見え方の切りかえ（自動＝時刻・昼・夕方・夜・テーマどおり）は CampusMap3D のボタン。DOM も MapLibre も使わない
import { PALETTES, mixHex } from "./campusBasemap.js";
import { worldDate } from "./campus3dClock.js";

const DEG = Math.PI / 180;
export const SUN_SITE = { lat: 35.6058, lng: 139.6845 }; // 大岡山
export const LOOK_MODES = ["auto", "day", "evening", "night"];

// a から b へ t（0〜1）だけ寄せた色
export const lerpHex = (a, b, t) => mixHex(b, a, Math.min(1, Math.max(0, t)));
const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

// 太陽の位置（NOAA の近似式。1° ほどの誤差）：elevation は地平線からの高さ、azimuth は北 0・時計回り（度）
export function sunPosition(date, lat = SUN_SITE.lat, lng = SUN_SITE.lng) {
  const n = date.getTime() / 86400000 + 2440587.5 - 2451545.0; // 2000年1月1日 12時（UT）からの日数
  const L = (280.46 + 0.9856474 * n) % 360;
  const g = ((357.528 + 0.9856003 * n) % 360) * DEG;
  const lambda = (L + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * DEG; // 太陽の黄経
  const eps = (23.439 - 0.0000004 * n) * DEG;
  const ra = Math.atan2(Math.cos(eps) * Math.sin(lambda), Math.cos(lambda));
  const dec = Math.asin(Math.sin(eps) * Math.sin(lambda));
  const gmst = (((18.697374558 + 24.06570982441908 * n) % 24) + 24) % 24; // グリニッジ恒星時（時）
  const ha = (gmst * 15 + lng) * DEG - ra; // 時角
  const phi = lat * DEG;
  const el = Math.asin(Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(ha));
  const az = Math.atan2(-Math.sin(ha), Math.tan(dec) * Math.cos(phi) - Math.sin(phi) * Math.cos(ha));
  return { elevation: el / DEG, azimuth: ((az / DEG) % 360 + 360) % 360 };
}

// 太陽の高さ（度）から：warm（夕日の色づき）・twilight（日没後の紫の空）・night（夜）の割合（0〜1）
export function lookFactors(el) {
  const night = smooth(-1, -9, el); // 日の入り（-1°）から暗くなり、-9° でまっくら
  const warm = smooth(16, 2, el) * (1 - night); // 高さ 16° から色づき、日の入りでいちばん
  const twilight = Math.max(0, 1 - Math.abs(el + 4) / 4.5) * (1 - night * 0.6); // 日の入りのあと（-4° あたり）の紫
  return { warm, twilight, night };
}

// 決めた見え方（昼・夕方・夜）の太陽（空のレイヤーも同じ太陽にする）
export const FIXED = { day: { elevation: 45, azimuth: 200 }, evening: { elevation: 1.5, azimuth: 255 }, night: { elevation: -20, azimuth: 20 } };

// 見え方を決める時刻：window.__mapClock（または電車の __trainClock）の { at: "HH:MM", date?: "YYYY-MM-DD" }（日本時間）があればそれ。
// なければ世界の時計（campus3dClock。ふだんは今、デバッグで決めた時刻）
export function lookClock() {
  const c = (typeof window !== "undefined" && (window.__mapClock || window.__trainClock)) || null;
  if (!c?.at) return worldDate();
  const now = new Date();
  const jst = new Date(now.getTime() + 9 * 3600000);
  const day = c.date || `${jst.getUTCFullYear()}-${String(jst.getUTCMonth() + 1).padStart(2, "0")}-${String(jst.getUTCDate()).padStart(2, "0")}`;
  return new Date(`${day}T${c.at.length === 5 ? `${c.at}:00` : c.at}+09:00`);
}

const SUNSET = "#ff9a57"; // 夕日に染まる色
const DUSK = "#6a5aa8"; // 日没後の空の紫
const NAVY = "#0d1a33"; // 夜は紺に寄せる
const TEXT_KEYS = ["label", "labelMuted", "halo", "station", "stationBg"];
// 段彩（campusMap3d.js の RELIEF と同じ順）
export const RELIEF_COLORS = {
  light: ["#c9d5e0", "#d9e2e9", "#e6ebef", "#eff2f1", "#f6f6f2"],
  dark: ["#040507", "#0a0c0f", "#111418", "#1a1d22", "#23272c"],
};

// 灰色（同じ明るさ）
const grayOf = (hex) => {
  const n = parseInt(hex.slice(1, 7), 16);
  const y = Math.round(((n >> 16) & 255) * 0.299 + ((n >> 8) & 255) * 0.587 + (n & 255) * 0.114);
  return `#${[y, y, y].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
};
// 昼の色 day・夜の色 night から、いまの割合の色。f.gloom（くもり・雨の暗さ 0〜1）があれば、くすませて少し暗く
export function toneOf(f, day, night) {
  const gl = f.gloom || 0;
  let c = lerpHex(day, SUNSET, 0.16 * f.warm * (1 - gl));
  c = lerpHex(c, "#000000", 0.06 * f.warm);
  c = lerpHex(c, DUSK, 0.28 * f.twilight * (1 - 0.7 * gl));
  if (gl > 0) {
    c = lerpHex(c, grayOf(c), 0.35 * gl);
    c = lerpHex(c, "#000000", 0.16 * gl);
  }
  return lerpHex(c, lerpHex(night, NAVY, 0.25), f.night);
}
// 地面の色の種類（濡れ・雪・芝生の季節を当てるもの）：lawn 芝生・草、road 道・舗装、ground そのほかの地面
const GROUND_KEYS = { park: "lawn", pitch: "lawn", wood: "lawn", outside: "ground", campus: "ground", campusEdge: "ground", track: "ground", streetCase: "road", street: "road", walkCase: "road", walk: "road", platform: "road" };
const STRAW = "#cdbf93"; // 冬の芝生（コウライシバの枯れ色）
const SNOW_DAY = "#f3f5f7";
const SNOW_NIGHT = "#8e98a3";

/**
 * 見え方。mode は auto（時刻）・day・evening・night・theme（dark なら夜、でなければ昼）
 * @returns { mode, phase: "day"|"evening"|"night", key, sun, f, pal, relief, light, sky, hillshade, lamp, passage, tone(day, night) }
 */
export function lookFor(mode, { dark = false, date = lookClock(), weather = null, season = null } = {}) {
  const sun = mode === "auto" ? sunPosition(date) : FIXED[mode] || FIXED[dark ? "night" : "day"];
  const f = lookFactors(sun.elevation);
  // 天気（campus3dEnv の天気の状態。観測がない＝不明なら当てない）：くもり・雨・霧の暗さ gloom、濡れ wet、積雪 snow。
  // season は芝生の緑（0 枯れ色〜1 緑。campus3dEnv の lawnGreen）
  const W = weather && weather.src !== "unknown" ? weather : null;
  f.gloom = W ? Math.min(1, W.cloud * (0.3 + 0.7 * W.dark) + (W.fog < 1000 ? 0.35 * (1 - W.fog / 1000) : 0)) : 0;
  f.wet = W ? Math.min(1, Math.max(0, W.wet || 0)) : 0;
  f.snow = W ? Math.min(1, Math.max(0, W.snowCover || 0)) : 0;
  const lawn = season == null ? 1 : Math.min(1, Math.max(0, season));
  const tone = (d, n) => toneOf(f, d, n);
  // 地面の色：芝生は冬に枯れ色、濡れると暗く（道ほど）、雪が積もると白く。k は { light, dark }、kind は lawn・road・ground・paint
  const ground = (k, kind) => {
    let d = k.light;
    let n = k.dark;
    if (kind === "lawn" && lawn < 1) d = lerpHex(d, STRAW, (1 - lawn) * 0.75);
    if (f.wet > 0) {
      const k1 = kind === "road" ? 0.3 : kind === "lawn" ? 0.16 : kind === "paint" ? 0.12 : 0.22;
      d = lerpHex(lerpHex(d, "#000000", k1 * f.wet), "#40506a", 0.06 * f.wet);
      n = lerpHex(n, "#000000", 0.12 * f.wet);
    }
    if (f.snow > 0) {
      d = lerpHex(d, SNOW_DAY, 0.88 * f.snow);
      n = lerpHex(n, SNOW_NIGHT, 0.7 * f.snow);
      // くもりでも雪は地面の中でいちばん明るい：雪の色にはくもりの暗さを弱く
      return lerpHex(tone(d, n), toneOf({ ...f, gloom: f.gloom * 0.35 }, SNOW_DAY, SNOW_NIGHT), 0.45 * f.snow);
    }
    return tone(d, n);
  };
  const pal = {};
  for (const k of Object.keys(PALETTES.light)) {
    const d = PALETTES.light[k];
    const n = PALETTES.dark[k];
    pal[k] = d.startsWith("#") && n.startsWith("#") ? (GROUND_KEYS[k] ? ground({ light: d, dark: n }, GROUND_KEYS[k]) : tone(d, n)) : f.night > 0.5 ? n : d;
  }
  // 文字は途中の灰色で読めなくならないよう、夜の半分で切りかえる
  for (const k of TEXT_KEYS) pal[k] = f.night > 0.5 ? PALETTES.dark[k] : PALETTES.light[k];
  const relief = RELIEF_COLORS.light.map((d, i) => tone(d, RELIEF_COLORS.dark[i]));
  // 光：昼は太陽の方向（低いほど横から）、夜は月あかり（太陽の反対側の上のほう）
  const moon = f.night > 0.5;
  const sunCol = lerpHex("#ffdcbc", "#ffaa70", smooth(9, 0, sun.elevation));
  let color = lerpHex("#ffffff", sunCol, f.warm);
  color = lerpHex(color, "#c7b4ff", 0.5 * f.twilight * (1 - f.night));
  color = lerpHex(color, "#a9bde6", f.night);
  // くもり・雨：太陽の向きがはっきりしない（上からの、灰色の弱い光）
  color = lerpHex(color, "#c9ced6", 0.65 * f.gloom * (1 - f.night));
  const polar = moon ? 40 : Math.min(80, Math.max(12, 90 - sun.elevation));
  const light = {
    anchor: "map",
    color,
    intensity: Math.round((0.38 + 0.1 * f.warm * (1 - f.gloom) - 0.13 * f.night) * (1 - 0.3 * f.gloom) * 1000) / 1000,
    position: [1.4, moon ? (sun.azimuth + 180) % 360 : sun.azimuth, polar + (25 - polar) * f.gloom],
  };
  // 空（画面の上のもや）：上と地平線の色
  const top = lerpHex(lerpHex(lerpHex(lerpHex("#dce7f0", "#f2c3a3", f.warm), "#56508f", f.twilight), "#9aa2ab", 0.7 * f.gloom), "#060b18", f.night);
  const horizon = lerpHex(lerpHex(lerpHex(lerpHex(pal.outside, "#ffd7ae", f.warm), "#f19a76", f.twilight), "#b4b9bf", 0.6 * f.gloom), "#13203a", f.night);
  const phase = f.night > 0.5 ? "night" : f.warm > 0.35 || f.twilight > 0.35 ? "evening" : "day";
  return {
    mode, phase, sun, f, pal, relief, light, tone, ground,
    sky: { top, horizon },
    hillshade: {
      exaggeration: 0.55 + 0.05 * f.night,
      shadow: lerpHex(lerpHex("#4d6378", "#6b4a5c", f.warm), "#000000", f.night),
      highlight: lerpHex(lerpHex("#ffffff", "#ffe4c8", f.warm), "#2c3540", f.night),
      accent: lerpHex(lerpHex("#6f8398", "#8a6470", f.warm), "#000000", f.night),
    },
    lamp: Math.round(Math.max(smooth(-2, -7, sun.elevation), 0.6 * smooth(0.8, 1, f.gloom)) * 100) / 100, // 街灯のあかり（日の入りのあとから。嵐で暗いときも少し）
    passage: { color: lerpHex("#2b3a4a", "#000000", f.night), opacity: 0.22 + 0.13 * f.night },
    // 見え方が変わったかどうかの目安（太陽の高さ 0.5°・方位 2° ごと）
    key: `${mode}|${dark ? 1 : 0}|${Math.round(sun.elevation * 2)}|${Math.round(sun.azimuth / 2)}|${Math.round(f.gloom * 20)}|${Math.round(f.wet * 10)}|${Math.round(f.snow * 10)}|${Math.round(lawn * 10)}`,
  };
}

// 稲光の光（2026-11-10）：いまの光 light（lookFor の light）を、光った向き（strike の方位・見える高さ）へ寄せて明るく・青白く。
// level は稲光の明るさ（0〜1.6）。弱い光のうちは向きを少しだけ寄せる（光り終わりに影の向きが跳ばないように）
export function flashLight(light, strike, level) {
  if (!strike || !(level > 0.01)) return light;
  const w = Math.min(1, level * 2.5);
  const vec = (az, po) => {
    const a = (az * Math.PI) / 180;
    const p = (po * Math.PI) / 180;
    return [Math.sin(p) * Math.sin(a), Math.sin(p) * Math.cos(a), Math.cos(p)];
  };
  const a = vec(light.position[1], light.position[2]);
  const b = vec(strike.az, Math.min(80, Math.max(35, 90 - strike.el - 12)));
  const m = a.map((v, i) => v * (1 - w) + b[i] * w);
  const l = Math.hypot(m[0], m[1], m[2]) || 1;
  const az = (((Math.atan2(m[0], m[1]) * 180) / Math.PI) % 360 + 360) % 360;
  const po = (Math.acos(Math.min(1, Math.max(-1, m[2] / l))) * 180) / Math.PI;
  return {
    ...light,
    color: lerpHex(light.color, "#e6ecff", w),
    intensity: Math.round(Math.min(0.95, light.intensity + 0.5 * Math.min(1, level)) * 1000) / 1000,
    position: [light.position[0], Math.round(az * 10) / 10, Math.round(po * 10) / 10],
  };
}
