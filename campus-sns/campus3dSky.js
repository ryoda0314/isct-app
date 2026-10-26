// 3D表示の「時刻の見え方」：昼・夕方・夜。キャンパス（大岡山）での太陽の高さと方位を時刻から計算し、
// 地図の色（パレット）・光の向きと色・空（画面の上のもや）・夜の街灯と電車の窓あかりを決める。
// 見え方の切りかえ（自動＝時刻・昼・夕方・夜・テーマどおり）は CampusMap3D のボタン。DOM も MapLibre も使わない
import { PALETTES, mixHex } from "./campusBasemap.js";

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

// 決めた見え方（昼・夕方・夜）の太陽
const FIXED = { day: { elevation: 45, azimuth: 200 }, evening: { elevation: 1.5, azimuth: 255 }, night: { elevation: -20, azimuth: 20 } };

// 見え方を決める時刻：window.__mapClock（または電車の __trainClock）の { at: "HH:MM", date?: "YYYY-MM-DD" }（日本時間）があればそれ
export function lookClock() {
  const c = (typeof window !== "undefined" && (window.__mapClock || window.__trainClock)) || null;
  if (!c?.at) return new Date();
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

// 昼の色 day・夜の色 night から、いまの割合の色
export function toneOf(f, day, night) {
  let c = lerpHex(day, SUNSET, 0.16 * f.warm);
  c = lerpHex(c, "#000000", 0.06 * f.warm);
  c = lerpHex(c, DUSK, 0.28 * f.twilight);
  return lerpHex(c, lerpHex(night, NAVY, 0.25), f.night);
}

/**
 * 見え方。mode は auto（時刻）・day・evening・night・theme（dark なら夜、でなければ昼）
 * @returns { mode, phase: "day"|"evening"|"night", key, sun, f, pal, relief, light, sky, hillshade, lamp, passage, tone(day, night) }
 */
export function lookFor(mode, { dark = false, date = lookClock() } = {}) {
  const sun = mode === "auto" ? sunPosition(date) : FIXED[mode] || FIXED[dark ? "night" : "day"];
  const f = lookFactors(sun.elevation);
  const tone = (d, n) => toneOf(f, d, n);
  const pal = {};
  for (const k of Object.keys(PALETTES.light)) {
    const d = PALETTES.light[k];
    const n = PALETTES.dark[k];
    pal[k] = d.startsWith("#") && n.startsWith("#") ? tone(d, n) : f.night > 0.5 ? n : d;
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
  const light = {
    anchor: "map",
    color,
    intensity: Math.round((0.38 + 0.1 * f.warm - 0.13 * f.night) * 1000) / 1000,
    position: [1.4, moon ? (sun.azimuth + 180) % 360 : sun.azimuth, moon ? 40 : Math.min(80, Math.max(12, 90 - sun.elevation))],
  };
  // 空（画面の上のもや）：上と地平線の色
  const top = lerpHex(lerpHex(lerpHex("#dce7f0", "#f2c3a3", f.warm), "#56508f", f.twilight), "#060b18", f.night);
  const horizon = lerpHex(lerpHex(lerpHex(pal.outside, "#ffd7ae", f.warm), "#f19a76", f.twilight), "#13203a", f.night);
  const phase = f.night > 0.5 ? "night" : f.warm > 0.35 || f.twilight > 0.35 ? "evening" : "day";
  return {
    mode, phase, sun, f, pal, relief, light, tone,
    sky: { top, horizon },
    hillshade: {
      exaggeration: 0.55 + 0.05 * f.night,
      shadow: lerpHex(lerpHex("#4d6378", "#6b4a5c", f.warm), "#000000", f.night),
      highlight: lerpHex(lerpHex("#ffffff", "#ffe4c8", f.warm), "#2c3540", f.night),
      accent: lerpHex(lerpHex("#6f8398", "#8a6470", f.warm), "#000000", f.night),
    },
    lamp: Math.round(smooth(-2, -7, sun.elevation) * 100) / 100, // 街灯のあかり（日の入りのあとから）
    passage: { color: lerpHex("#2b3a4a", "#000000", f.night), opacity: 0.22 + 0.13 * f.night },
    // 見え方が変わったかどうかの目安（太陽の高さ 0.5°・方位 2° ごと）
    key: `${mode}|${dark ? 1 : 0}|${Math.round(sun.elevation * 2)}|${Math.round(sun.azimuth / 2)}`,
  };
}
