// 計算式の時計（2026-11-13、ユーザー「小物も作って」。Taki Plaza 2 階の窓ぎわの本棚の上。動画 IMG_1080 の 6〜18 秒：黒い面に白い線の字で
// 「8+9÷1 h」「7×9−8 min」＝17 時 55 分）。時と分を、1〜9 の数 3 つと演算 2 つの式（かけ算・わり算が先。途中も負にならず割り切れる）で出す。
// 式は分ごとに変わる（同じ値の式の中から分の番号で選ぶ）。時刻は世界の時計（campus3dClock の worldNow。デバッグの時刻にも合う）の日本時間。
// 箱と黒い面は campus3dInterior（物 mathclock。面の位置を buildMesh の clocks に）、ここは面の上の光る線（点いていない線もうすく）と
// 「h」「min」。描くのは campus3dLayer の createDoorsLayer（自動ドアと同じ）。分が変わったときだけ作り直す
import { Mesh, planeText } from "./campus3dMesh.js";

export const MCLOCK_LAYER_ID = "cb-mclock";
const OPS = ["+", "-", "*", "/"];
const high = (o) => o === "*" || o === "/";
const apply = (x, o, y) => {
  if (o === "+") return x + y;
  if (o === "-") return x - y;
  if (o === "*") return x * y;
  return y === 0 || x % y ? NaN : x / y;
};
// a o1 b o2 c の値（かけ算・わり算が先。途中が負・割り切れないなら NaN）
export function evalExpr(a, o1, b, o2, c) {
  if (high(o2) && !high(o1)) {
    const r = apply(b, o2, c);
    if (!(r >= 0)) return NaN;
    const v = apply(a, o1, r);
    return v >= 0 ? v : NaN;
  }
  const l = apply(a, o1, b);
  if (!(l >= 0)) return NaN;
  const v = apply(l, o2, c);
  return v >= 0 ? v : NaN;
}
// 値 0〜59 ごとの式の一覧
const TABLE = (() => {
  const t = Array.from({ length: 60 }, () => []);
  for (let a = 1; a <= 9; a++)
    for (const o1 of OPS)
      for (let b = 1; b <= 9; b++)
        for (const o2 of OPS)
          for (let c = 1; c <= 9; c++) {
            const v = evalExpr(a, o1, b, o2, c);
            if (Number.isInteger(v) && v < 60) t[v].push([a, o1, b, o2, c]);
          }
  return t;
})();
export const mathExprs = (n) => TABLE[n] || [];
const hash = (i, j) => {
  let h = (Math.imul(i | 0, 374761393) + Math.imul(j | 0, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};
// 値 n の式（seed で選ぶ）：[a, o1, b, o2, c]
export function mathExpr(n, seed) {
  const L = TABLE[n];
  return L && L.length ? L[Math.floor(hash(seed, n * 7 + 3) * L.length)] : null;
}
// 日本時間の時・分と、式を選ぶ番号（1970 年からの分）
export function mathClockTime(ms) {
  const k = Math.floor((ms + 9 * 3600000) / 60000);
  return { h: Math.floor(k / 60) % 24, m: ((k % 60) + 60) % 60, k };
}
// 分が変わるごとに変わる鍵
export const mathClockKey = (ms) => (Number.isFinite(ms) ? Math.floor(ms / 60000) : -1);

const LIT = [0.97, 0.97, 0.96, 0.5]; // 点いた線（光を受けない白）
const DIM = [0.15, 0.155, 0.16, 0.5]; // 点いていない線（黒い面の上のうすい灰）
// 7 つの線（a 上・b 右上・c 右下・d 下・e 左下・f 左上・g まん中）の点く線
const DIGIT = ["abcdef", "bc", "abdeg", "abcdg", "bcfg", "acdfg", "acdefg", "abc", "abcdefg", "abcdfg"];
// 幅 w・高さ h の升の 7 つの線の四角（[x0, y0, x1, y1]）。線の太さ t
function segs(w, h, t) {
  const g = t * 0.3;
  return {
    a: [t + g, h - t, w - t - g, h], g: [t + g, h / 2 - t / 2, w - t - g, h / 2 + t / 2], d: [t + g, 0, w - t - g, t],
    f: [0, h / 2 + g, t, h - t - g], b: [w - t, h / 2 + g, w, h - t - g], e: [0, t + g, t, h / 2 - g], c: [w - t, t + g, w, h / 2 - g],
  };
}

// いまの式の字：clocks（{ o 面の左下, u 右の向き, n 前の向き, z0, w, h, d }）。{ solid, glass }（Mesh の result）
export function mathClockMesh(clocks, ms) {
  const m = new Mesh();
  if (!Number.isFinite(ms)) return { solid: m.result(), glass: new Mesh().result() };
  const { h, m: mi, k } = mathClockTime(ms);
  const rows = [mathExpr(h, k * 2 + 1), mathExpr(mi, k * 2)];
  for (const C of clocks || []) {
    const N = [C.n[0], C.n[1], 0];
    const Q = (x, y, dd) => [[C.o[0] + C.u[0] * x + C.n[0] * (C.d + dd), C.o[1] + C.u[1] * x + C.n[1] * (C.d + dd)], C.z0 + y];
    const rect = (x0, y0, x1, y1, dd, col) => m.quad([Q(x0, y0, dd), Q(x1, y0, dd), Q(x1, y1, dd), Q(x0, y1, dd)], N, col);
    // 斜めの線（x0, y0）→（x1, y1）、太さ t
    const slant = (x0, y0, x1, y1, t, dd, col) => {
      const L = Math.hypot(x1 - x0, y1 - y0) || 1;
      const ox = (-(y1 - y0) / L) * (t / 2), oy = ((x1 - x0) / L) * (t / 2);
      m.quad([Q(x0 - ox, y0 - oy, dd), Q(x1 - ox, y1 - oy, dd), Q(x1 + ox, y1 + oy, dd), Q(x0 + ox, y0 + oy, dd)], N, col);
    };
    const dh = C.h * 0.33; // 字の高さ
    const dw = dh * 0.56, ow = dh * 0.5, gap = dh * 0.13, t = dh * 0.09;
    const x0 = C.w * 0.09;
    const lines = [{ e: rows[0], y: C.h * 0.55, unit: "h" }, { e: rows[1], y: C.h * 0.12, unit: "min" }];
    for (const Ln of lines) {
      let x = x0;
      const cells = Ln.e ? [Ln.e[0], Ln.e[1], Ln.e[2], Ln.e[3], Ln.e[4]] : [8, "+", 8, "+", 8];
      for (const cell of cells) {
        if (typeof cell === "number") {
          const S = segs(dw, dh, t);
          const on = Ln.e ? DIGIT[cell] : "";
          for (const [key, q] of Object.entries(S)) {
            rect(x + q[0], Ln.y + q[1], x + q[2], Ln.y + q[3], on.includes(key) ? 0.0012 : 0.0006, on.includes(key) ? LIT : DIM);
          }
          x += dw + gap;
          continue;
        }
        // 演算の升：点いていない「+」「×」「/」をうすく、点いたものを白く
        const cx = x + ow / 2, cy = Ln.y + dh / 2, s = ow * 0.42;
        const draw = (op, dd, col) => {
          if (op === "+" || op === "-") rect(cx - s, cy - t / 2, cx + s, cy + t / 2, dd, col);
          if (op === "+") rect(cx - t / 2, cy - s, cx + t / 2, cy + s, dd, col);
          if (op === "*") {
            slant(cx - s * 0.75, cy - s * 0.75, cx + s * 0.75, cy + s * 0.75, t, dd, col);
            slant(cx - s * 0.75, cy + s * 0.75, cx + s * 0.75, cy - s * 0.75, t, dd, col);
          }
          if (op === "/") {
            slant(cx - s * 0.7, cy - s * 1.1, cx + s * 0.7, cy + s * 1.1, t, dd, col);
            rect(cx - s * 0.8 - t / 2, cy + s * 0.55 - t / 2, cx - s * 0.8 + t / 2, cy + s * 0.55 + t / 2, dd, col);
            rect(cx + s * 0.8 - t / 2, cy - s * 0.55 - t / 2, cx + s * 0.8 + t / 2, cy - s * 0.55 + t / 2, dd, col);
          }
        };
        for (const op of ["+", "*", "/"]) draw(op, 0.0006, DIM);
        if (Ln.e) draw(cell, 0.0012, LIT);
        x += ow + gap;
      }
      // 単位（h・min）：小さな小文字
      const us = dh * 0.5;
      const plane = { P: (xx, yy, dd) => Q(xx, yy, dd), N, U: [C.u[0], C.u[1], 0], V: [0, 0, 1] };
      planeText(m, plane, Ln.unit, x + gap * 0.5, Ln.y, us, { stroke: 0.13, d0: 0.0006, d1: 0.0014 }, LIT, LIT);
    }
  }
  return { solid: m.result(), glass: new Mesh().result() };
}
