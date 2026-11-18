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

// 東急の発車標の作り（2026-11-18、ユーザー「電光掲示板とか完全再現してほしい」＋動画 IMG_1009 の 15〜16 秒・85 秒）：看板の led があるとき
//   種別は色の札（急行＝赤、各停＝青）に白い字、行き先は大井町線の急行だけ赤・ほかは緑、時刻は緑、
//   clock（[x, y, 字の高さ]：いまの時刻を赤い字で）、scroll（[x, y, 幅, 字の高さ]：下の段を右から左へ流れる案内。1 秒ごとに進む）
const BADGE = { 急行: "#e23a30", 各停: "#2b62c9" };
const LED = { white: "#f4f4f0", green: "#7dff6a", red: "#ff5468", clock: "#ff4a36", scroll: "#8dff70" };
const OIMACHI = new Set(["2", "3"]);
const SCROLL_TEXT = "本日も東急線をご利用いただきまして、ありがとうございます。　　駆け込み乗車は危険ですので、おやめください。　　ホームでは黄色い点字ブロックの内側をお歩きください。　　";
const SCROLL_SPEED = 0.42; // m/s（看板の上で）

// 看板のうち dep のあるもの：{ f, fr（面の向き）, g（高さの基準の標高）, halves: [{ no, x, y, w }], led }
export function prepareDepartureBoards(features) {
  return (features || [])
    .filter((f) => f.type === "sign" && Array.isArray(f.dep) && f.dep.length && f.elev != null)
    .map((f) => ({ f, fr: signFrame(f), g: f.elev, halves: f.dep.map(([no, x, y, w]) => ({ no: String(no), x, y, w })), led: f.led || null }));
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

// 看板の面（表 d = +、裏は左右を入れかえて）に四角を並べる。clip があれば x の範囲 [x0, x1] で切る
function drawRects(m, B, rects, col, lift = 0.006, clip = null) {
  const { f, fr, g } = B;
  const W = f.width, T = f.thickness;
  const N = [fr.n[0] * fr.en[0], fr.n[1] * fr.en[0], fr.en[1]];
  const sides = [{ d: lift, back: false }];
  if (f.back) sides.push({ d: -T - lift, back: true });
  for (const S of sides) {
    const X = (v) => (S.back ? W - v : v);
    const nn = S.back ? [-N[0], -N[1], -N[2]] : N;
    const at = (xx, yy) => {
      const [p, z] = fr.at(X(xx), yy, S.d);
      return [p, g + z];
    };
    for (const [rx, ry, rw, rh] of rects) {
      let x0 = rx, x1 = rx + rw;
      if (clip) {
        x0 = Math.max(x0, clip[0]);
        x1 = Math.min(x1, clip[1]);
        if (x1 - x0 < 1e-4) continue;
      }
      m.quad([at(x0, ry), at(x1, ry), at(x1, ry + rh), at(x0, ry + rh)], nn, col);
    }
  }
}

// 字を看板の面に（幅 w に収まらなければ横を詰める。align "c" はまん中、"r" は右）。描いた幅を返す
function drawText(m, B, txt, x, y, w, col, size = SIZE, align = "l", lift = 0.006, led = true) {
  const R = textCells(txt, size, led ? { led: true } : { b: 800 });
  if (!R || !R.rects.length) return 0;
  const sx = R.w > w ? w / R.w : 1;
  const used = R.w * sx;
  const ox = align === "c" ? x + (w - used) / 2 : align === "r" ? x + w - used : x;
  drawRects(m, B, R.rects.map(([rx, ry, rw, rh]) => [ox + rx * sx, y + ry, rw * sx, rh]), col, lift);
  return used;
}

// いまの発車の字：{ solid, glass }（Mesh の result）
export function departuresMesh(boards, data, clock) {
  const m = new Mesh();
  for (const B of boards) {
    const L = B.led;
    const size = L?.size || SIZE, row = L?.row || ROW;
    for (const h of B.halves) {
      const rows = nextDepartures(data, h.no, clock, 2);
      if (!rows.length) {
        drawText(m, B, "本日の運転は終了しました", h.x, h.y, h.w, unlit(COLS.note), size);
        continue;
      }
      rows.forEach(([min, ti, di], j) => {
        const type = data.types[ti] || "";
        const dest = data.termini[di] || "";
        const time = `${Math.floor(min / 60) % 24}:${String(min % 60).padStart(2, "0")}`;
        const y = h.y - j * row;
        if (L) {
          // 札（種別）・行き先・時刻。札は字より少し大きい色の四角
          const wT = size * 2.25, gap = size * 0.45, wM = size * 2.9;
          const wD = Math.max(size, h.w - wT - wM - 2 * gap);
          if (BADGE[type]) {
            drawRects(m, B, [[h.x, y - size * 0.06, wT, size * 1.08]], unlit(BADGE[type]), 0.004);
            drawText(m, B, type, h.x + size * 0.1, y, wT - size * 0.2, unlit(LED.white), size * 0.92, "c", 0.007, false);
          } else drawText(m, B, type, h.x, y, wT, unlit(LED.green), size);
          const dc = type === "急行" && OIMACHI.has(h.no) ? LED.red : LED.green;
          drawText(m, B, dest, h.x + wT + gap, y, wD, unlit(dc), size);
          drawText(m, B, time, h.x + wT + wD + 2 * gap, y, wM, unlit(LED.green), size, "r");
        } else {
          const wT = h.w * 0.2, wD = h.w * 0.44, wM = h.w * 0.26, gap = h.w * 0.05;
          drawText(m, B, type, h.x, y, wT, unlit(COLS[type] || COLS.note));
          drawText(m, B, dest, h.x + wT + gap, y, wD, unlit(COLS.dest));
          drawText(m, B, time, h.x + wT + wD + 2 * gap, y, wM, unlit(COLS.time));
        }
      });
    }
    if (L?.clock) {
      const [cx, cy, ch] = L.clock;
      const t = Math.floor(clock.sec / 60);
      drawText(m, B, `${Math.floor(t / 60) % 24}:${String(t % 60).padStart(2, "0")}`, cx, cy, ch * 3.2, unlit(LED.clock), ch, "c");
    }
    if (L?.scroll) {
      const [sx0, sy, sw, sh] = L.scroll;
      const R = textCells(SCROLL_TEXT, sh, { led: true });
      if (R && R.rects.length) {
        // 右から左へ流れる。字の列を 2 回ならべて切れ目なく
        const span = R.w;
        const off = (Math.floor(clock.sec) * SCROLL_SPEED) % span;
        const rects = [];
        for (const k of [0, 1]) for (const [rx, ry, rw, rh] of R.rects) {
          const x = sx0 + rx + k * span - off;
          if (x > sx0 + sw || x + rw < sx0) continue;
          rects.push([x, sy + ry, rw, rh]);
        }
        drawRects(m, B, rects, unlit(LED.scroll), 0.006, [sx0, sx0 + sw]);
      }
    }
  }
  return { solid: m.result(), glass: new Mesh().result() };
}

// 作り直す鍵：分が変わる（発車の 30 秒あと・時計の分）ごと。流れる案内のある発車標があれば 1 秒ごと
export const departuresKey = ({ day, sec }, boards = null) =>
  `${day}:${Math.floor((sec - 30) / 60)}:${Math.floor(sec / 60)}${boards && boards.some((B) => B.led?.scroll) ? ":" + Math.floor(sec) : ""}`;
