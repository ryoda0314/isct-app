// 発車標の光る字（2026-11-12、ユーザー「ここには実際の時刻表を表示したい。電車の時刻表持ってるじゃん」）：大岡山発の時刻表
// （public/map-3d/departures.json。scripts/gen-campus-departures.mjs が lib/data/static-timetables.generated.json＝駅探から作る）から、
// いまの時刻（campus3dTrains の serviceClock：世界の時計・デバッグの時刻に合う）の次の 2 本（種別・行き先・時刻）を、看板（sign）の
// dep（[[番線, x, y, 幅]]：光る字の左下・1 段目の高さ。2 段目は 0.21m 下）のところに描く。看板の板・見出しは campus3dMesh の addSign。
// 字の形は campus3dSignText（光る点の字）。描くのは campus3dLayer の createDoorsLayer（自動ドアと同じ）。分が変わったときだけ作り直す
import { signFrame } from "./campus3dFeatures.js";
import { Mesh } from "./campus3dMesh.js";
import { textCells } from "./campus3dSignText.js";

export const DEPARTURES_URL = "/map-3d/departures.json";
export const LED_LAYER_ID = "cb-led";
const ROW = 0.21; // 段の間隔（m）
const SIZE = 0.15; // 字の高さ（m）
const COLS = { 急行: "#ff4d3a", 各停: "#7dff6a", dest: "#ffa033", time: "#7dff6a", note: "#ffa033" };
// 光を受けない色（屋内の光る字）
const unlit = (h) => {
  const n = parseInt(h.slice(1, 7), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255, 0.5];
};

// 看板のうち dep のあるもの：{ f, fr（面の向き）, g（高さの基準の標高）, halves: [{ no, x, y, w }] }
export function prepareDepartureBoards(features) {
  return (features || [])
    .filter((f) => f.type === "sign" && Array.isArray(f.dep) && f.dep.length && f.elev != null)
    .map((f) => ({ f, fr: signFrame(f), g: f.elev, halves: f.dep.map(([no, x, y, w]) => ({ no: String(no), x, y, w })) }));
}

// 番線 no の、時刻 clock（{ day, sec }：運行日の秒）より後の発車 n 本：[[分, 種別, 行き先]]。発車の分の 30 秒あとまでは出しておく
export function nextDepartures(data, no, { day, sec }, n = 2) {
  const list = data?.days?.[day]?.[no] || data?.days?.weekday?.[no] || [];
  let lo = 0, hi = list.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (list[mid][0] * 60 + 30 <= sec) lo = mid + 1;
    else hi = mid;
  }
  return list.slice(lo, lo + n);
}

// 字を看板の面（表 d = +、裏は左右を入れかえて）に
function drawText(m, B, txt, x, y, w, col) {
  const R = textCells(txt, SIZE, { led: true });
  if (!R || !R.rects.length) return;
  const { f, fr, g } = B;
  const W = f.width, T = f.thickness;
  const sx = R.w > w ? w / R.w : 1;
  const N = [fr.n[0] * fr.en[0], fr.n[1] * fr.en[0], fr.en[1]];
  const sides = [{ d: 0.006, back: false }];
  if (f.back) sides.push({ d: -T - 0.006, back: true });
  for (const S of sides) {
    const X = (v) => (S.back ? W - v : v);
    const nn = S.back ? [-N[0], -N[1], -N[2]] : N;
    const at = (xx, yy) => {
      const [p, z] = fr.at(X(xx), yy, S.d);
      return [p, g + z];
    };
    for (const [rx, ry, rw, rh] of R.rects) {
      const x0 = x + rx * sx, x1 = x + (rx + rw) * sx;
      m.quad([at(x0, y + ry), at(x1, y + ry), at(x1, y + ry + rh), at(x0, y + ry + rh)], nn, col);
    }
  }
}

// いまの発車の字：{ solid, glass }（Mesh の result）
export function departuresMesh(boards, data, clock) {
  const m = new Mesh();
  for (const B of boards) {
    for (const h of B.halves) {
      const rows = nextDepartures(data, h.no, clock, 2);
      if (!rows.length) {
        drawText(m, B, "本日の運転は終了しました", h.x, h.y, h.w, unlit(COLS.note));
        continue;
      }
      rows.forEach(([min, ti, di], j) => {
        const type = data.types[ti] || "";
        const dest = data.termini[di] || "";
        const time = `${Math.floor(min / 60) % 24}:${String(min % 60).padStart(2, "0")}`;
        const y = h.y - j * ROW;
        const wT = h.w * 0.2, wD = h.w * 0.44, wM = h.w * 0.26, gap = h.w * 0.05;
        drawText(m, B, type, h.x, y, wT, unlit(COLS[type] || COLS.note));
        drawText(m, B, dest, h.x + wT + gap, y, wD, unlit(COLS.dest));
        drawText(m, B, time, h.x + wT + wD + 2 * gap, y, wM, unlit(COLS.time));
      });
    }
  }
  return { solid: m.result(), glass: new Mesh().result() };
}

// 分が変わる（発車の 30 秒あと）ごとに変わる鍵
export const departuresKey = ({ day, sec }) => `${day}:${Math.floor((sec - 30) / 60)}`;
