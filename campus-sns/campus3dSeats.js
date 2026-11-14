// 歩いて見るときに椅子に座る（2026-11-14 ユーザー「椅子に座れるようにしてほしいかも」）。
// 座れるもの：階の物（items）の chair・woodchair・lounge（ソファー）・stool・bench・tentsofa（両側に座れるソファー）・sofa・seat と、
// 外のベンチ（wall の kind "bench"：点の並びに沿った座面。高さ height・奥行き thickness）。
// 照準（画面のまん中の十字・タップした所）の先 SEAT_REACH m 以内に当たった座れるものに、クリック・タップで座る（エレベーターのボタンと同じ）。
// 座ると目は座面から SEAT_EYE m 上。背のある椅子・ソファーは前を向き、背のないもの（スツール・箱の座）は今の向きのまま。立つと座ったものの前へ
import { pointInRing, toXY } from "./campus3dFeatures.js";
import { floorG0 } from "./campus3dInterior.js";

export const SEAT_REACH = 3; // 照準が届く距離（m）
export const SEAT_EYE = 0.78; // 座った人の目の、座面からの高さ（m）
const STAND_OUT = 0.45; // 立つと座ったものの前のふちからこれだけ外（m）

const SIT_KINDS = new Set(["chair", "woodchair", "lounge", "stool", "bench", "tentsofa", "sofa", "seat"]);
const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const len = (v) => Math.hypot(v[0], v[1]);
const unit = (v) => { const l = len(v) || 1; return [v[0] / l, v[1] / l]; };
const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
const centroid = (r) => r.reduce((s, p) => [s[0] + p[0] / r.length, s[1] + p[1] / r.length], [0, 0]);
const yawOf = (d) => ((Math.atan2(d[0], d[1]) * 180) / Math.PI + 360) % 360; // 北から右回り
// 点 p から線分 a–b へいちばん近い点と、a からの長さ
function onSeg(p, a, b) {
  const d = sub(b, a);
  const L2 = d[0] * d[0] + d[1] * d[1] || 1e-9;
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * d[0] + (p[1] - a[1]) * d[1]) / L2));
  return { q: [a[0] + d[0] * t, a[1] + d[1] * t], s: t * Math.sqrt(L2) };
}

// 座面の高さ（物の下の端から m。描き方 campus3dInterior の座面と同じ）
function seatHeight(kind, H) {
  if (kind === "stool" || kind === "seat") return H; // 上の面が座面
  if (kind === "tentsofa") return 0.38;
  if (kind === "lounge" || kind === "sofa") return Math.min(0.42, H * 0.55);
  if (kind === "bench") return Math.min(0.43, H * 0.5);
  return Math.min(0.45, H * 0.56); // chair・woodchair
}

// 座れるものの並び。groundAt は掘る前の地面（階の高さの基準）
export function collectSeats(features, groundAt) {
  const out = [];
  for (const f of features || []) {
    if (f.type === "floor" && f.items?.length) {
      const g0 = floorG0(f, groundAt);
      if (!Number.isFinite(g0)) continue;
      const zf = g0 + f.z;
      for (const it of f.items) {
        if (!SIT_KINDS.has(it.kind) || it.coords?.length !== 4) continue;
        const r = it.coords.map(toXY);
        const z0 = zf + (it.z0 || 0);
        const sh = seatHeight(it.kind, (it.z1 || 0.8) - (it.z0 || 0));
        out.push({ kind: it.kind, r, c: centroid(r), z0, seat: z0 + sh, top: zf + Math.max(it.z1 || 0.8, (it.z0 || 0) + sh + 0.1) });
      }
    } else if (f.type === "wall" && f.kind === "bench" && f.coords?.length >= 2) {
      // 外のベンチ：地面の高さはここでは決めない（座るとき・当たりは歩く人の足もとの高さで）
      const P = f.coords.map(toXY);
      const h = Number.isFinite(+f.height) ? +f.height : 0.42;
      const t = Number.isFinite(+f.thickness) ? +f.thickness : 0.42;
      for (let i = 0; i + 1 < P.length; i++) out.push({ kind: "wallbench", a: P[i], b: P[i + 1], c: mid(P[i], P[i + 1]), half: len(sub(P[i + 1], P[i])) / 2, h, t });
    }
  }
  return out;
}

// 視線（o：目 [x, y, z]、d：向き。単位）の先の座れるもの。zw は歩く人の足もとの高さ（外のベンチの高さの基準）。
// 当たれば { seat, p（当たった点 [x, y, z]） }
export function seatPick(seats, o, d, zw, reach = SEAT_REACH) {
  const near = seats.filter((s) => len(sub(s.c, o)) < reach + (s.kind === "wallbench" ? s.half + 0.5 : 1.5));
  if (!near.length) return null;
  for (let t = 0.15; t <= reach; t += 0.04) {
    const p = [o[0] + d[0] * t, o[1] + d[1] * t, o[2] + d[2] * t];
    for (const s of near) {
      if (s.kind === "wallbench") {
        if (p[2] < zw - 0.05 || p[2] > zw + s.h + 0.12) continue;
        if (len(sub(onSeg(p, s.a, s.b).q, p)) <= s.t / 2 + 0.05) return { seat: s, p };
        continue;
      }
      if (p[2] < s.z0 - 0.02 || p[2] > s.top + 0.02) continue;
      if (pointInRing(p[0], p[1], s.r)) return { seat: s, p };
    }
  }
  return null;
}

// 座る位置と向き：{ x, y, z（足もとの高さ）, eye（足もとから目まで）, yaw（null は今の向きのまま）, stand: [x, y]（立つ所） }。
// p は照準の当たった点、from は歩く人の今の [x, y, z]
export function sitPose(seat, p, from) {
  if (seat.kind === "wallbench") {
    const { s } = onSeg(p, seat.a, seat.b);
    const L = seat.half * 2;
    const u = unit(sub(seat.b, seat.a));
    const k = Math.max(Math.min(0.25, L / 2), Math.min(L - Math.min(0.25, L / 2), s));
    const at = [seat.a[0] + u[0] * k, seat.a[1] + u[1] * k];
    // 背のないベンチ：来た側を向いて座る
    let n = [-u[1], u[0]];
    if ((from[0] - at[0]) * n[0] + (from[1] - at[1]) * n[1] < 0) n = [-n[0], -n[1]];
    return { x: at[0], y: at[1], z: from[2], eye: seat.h + SEAT_EYE, yaw: yawOf(n), stand: [at[0] + n[0] * (seat.t / 2 + STAND_OUT), at[1] + n[1] * (seat.t / 2 + STAND_OUT)] };
  }
  const r = seat.r;
  const zFoot = seat.z0;
  const eye = seat.seat - zFoot + SEAT_EYE;
  const ce = seat.c;
  const u = unit(sub(r[1], r[0])), L = len(sub(r[1], r[0]));
  const v = unit(sub(r[2], r[1])), W = len(sub(r[2], r[1]));
  const along = (pt, margin) => { const s = (pt[0] - ce[0]) * u[0] + (pt[1] - ce[1]) * u[1]; const hl = Math.max(0, L / 2 - margin); return Math.max(-hl, Math.min(hl, s)); };
  if (seat.kind === "chair" || seat.kind === "woodchair" || seat.kind === "lounge") {
    // 1 本目の辺が背：背 → 前の向き。長いソファーは照準の所に（端から 0.3m は空ける）
    const back = mid(r[0], r[1]), front = mid(r[2], r[3]);
    const fd = unit(sub(front, back));
    const depth = len(sub(front, back));
    const sx = seat.kind === "lounge" && L > 1.2 ? along(p, 0.3) : 0;
    const at = [ce[0] + u[0] * sx + fd[0] * depth * 0.08, ce[1] + u[1] * sx + fd[1] * depth * 0.08];
    return { x: at[0], y: at[1], z: zFoot, eye, yaw: yawOf(fd), stand: [at[0] + fd[0] * (depth / 2 + STAND_OUT), at[1] + fd[1] * (depth / 2 + STAND_OUT)] };
  }
  if (seat.kind === "bench") {
    // 駅のベンチ：1 本目の辺の左が前
    const fd = [-u[1], u[0]];
    const sx = along(p, 0.25);
    const at = [ce[0] + u[0] * sx, ce[1] + u[1] * sx];
    return { x: at[0], y: at[1], z: zFoot, eye, yaw: yawOf(fd), stand: [at[0] + fd[0] * (W / 2 + STAND_OUT), at[1] + fd[1] * (W / 2 + STAND_OUT)] };
  }
  if (seat.kind === "tentsofa") {
    // 両側に座れる：照準の当たった側（まん中の背から外を向く）
    const sy = (p[0] - ce[0]) * v[0] + (p[1] - ce[1]) * v[1] >= 0 ? 1 : -1;
    const fd = [v[0] * sy, v[1] * sy];
    const sx = along(p, 0.3);
    const at = [ce[0] + u[0] * sx + fd[0] * W * 0.27, ce[1] + u[1] * sx + fd[1] * W * 0.27];
    return { x: at[0], y: at[1], z: zFoot, eye, yaw: yawOf(fd), stand: [ce[0] + u[0] * sx + fd[0] * (W / 2 + STAND_OUT), ce[1] + u[1] * sx + fd[1] * (W / 2 + STAND_OUT)] };
  }
  // 背のないもの（stool・sofa・seat）：まん中（長いものは照準の所）に、今の向きのまま。立つと来た側へ
  const long = Math.max(L, W) > 1.0;
  const ax = long ? (L >= W ? u : v) : null;
  let at = ce;
  if (ax) {
    const hl = Math.max(0, Math.max(L, W) / 2 - 0.3);
    const s = Math.max(-hl, Math.min(hl, (p[0] - ce[0]) * ax[0] + (p[1] - ce[1]) * ax[1]));
    at = [ce[0] + ax[0] * s, ce[1] + ax[1] * s];
  }
  let back = sub(from, at);
  if (len(back) < 0.05) back = [0, -1];
  const bd = unit(back);
  const rad = Math.max(L, W) / 2;
  return { x: at[0], y: at[1], z: zFoot, eye, yaw: null, stand: [at[0] + bd[0] * (Math.min(rad, 0.4) + STAND_OUT), at[1] + bd[1] * (Math.min(rad, 0.4) + STAND_OUT)] };
}
