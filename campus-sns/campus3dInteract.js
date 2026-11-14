// 歩いて見るときに使える物（2026-11-15、持ち物：campus3dInventory.js）：自販機（階の物 drinks・vending）で飲み物を買う、券売機（tvm）で
// IC カードにチャージ、改札（駅の自動改札機 gate・図書館のフラップゲート flapgate）にカードをかざすと羽が開く。
// 改札の通り道（lane）は、となりあう 2 台の台のあいだ。羽は自動ドア（campus3dDoors）の両引きの板として描き、閉じているあいだは
// 歩く当たり（walkWorld の setDyn）でふさぐ。駅は IC カード（ゲーム内の残高から引く）、図書館は学生証（ゲーム内）
import { pointInRing, toXY } from "./campus3dFeatures.js";
import { floorG0 } from "./campus3dInterior.js";

export const USE_REACH = 3; // 照準が届く距離（m）
export const GATE_OPEN_MS = 4500; // かざしてから羽が開いている時間
const FLAP_Z0 = 0.3, FLAP_Z1 = 0.95; // 羽の下・上（床から m）
const BODY = 0.3; // 歩く人の体の半径（羽の当たりを広げる）

const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const len = (v) => Math.hypot(v[0], v[1]);
const dot = (a, b) => a[0] * b[0] + a[1] * b[1];
const centroid = (r) => r.reduce((s, p) => [s[0] + p[0] / r.length, s[1] + p[1] / r.length], [0, 0]);

// 4 点の四角の長い向き u（通る向き）・短い向き n・長さ L・幅 W
function frameOf(r) {
  const e0 = sub(r[1], r[0]), e1 = sub(r[2], r[1]);
  const [ea, eb] = len(e0) >= len(e1) ? [e0, e1] : [e1, e0];
  const L = len(ea), W = len(eb);
  const u = [ea[0] / L, ea[1] / L];
  return { u, n: [-u[1], u[0]], L, W, c: centroid(r) };
}

// 使える物の並び：{ machines（自販機・券売機：{ kind "vend"|"tvm", r, c, z0, z1 }）, lanes（改札の通り道） }
export function collectInteract(features, groundAt) {
  const machines = [];
  const lanes = [];
  for (const f of features || []) {
    if (f.type !== "floor" || !f.items?.length) continue;
    const g0 = floorG0(f, groundAt);
    if (!Number.isFinite(g0)) continue;
    const zf = g0 + f.z;
    const cabs = [];
    for (const it of f.items) {
      if (it.coords?.length !== 4) continue;
      const r = it.coords.map(toXY);
      if (it.kind === "drinks" || it.kind === "vending") machines.push({ kind: "vend", r, c: centroid(r), z0: zf + (it.z0 || 0), z1: zf + Math.max(it.z1 || 1.8, 1.2) });
      else if (it.kind === "tvm") machines.push({ kind: "tvm", r, c: centroid(r), z0: zf + (it.z0 || 0), z1: zf + Math.max(it.z1 || 1.6, 1.2) });
      else if (it.kind === "gate" || it.kind === "flapgate") cabs.push({ r, ...frameOf(r), card: it.kind === "gate" ? "ic" : "student" });
    }
    // となりあう 2 台（向きがそろい、横に 0.35〜1.2m あいて、通る向きにはずれていない）のあいだが通り道。台ごとに両側のいちばん近い台
    const seen = new Set();
    cabs.forEach((A, i) => {
      for (const side of [1, -1]) {
        let best = null;
        cabs.forEach((B, j) => {
          if (j === i || Math.abs(dot(A.u, B.u)) < 0.98) return;
          const d = sub(B.c, A.c);
          const lat = dot(d, A.n) * side;
          const gap = lat - (A.W + B.W) / 2;
          if (lat <= 0 || gap < 0.35 || gap > 1.2 || Math.abs(dot(d, A.u)) > 0.5) return;
          if (!best || lat < best.lat) best = { j, lat, gap };
        });
        if (!best) continue;
        const key = [i, best.j].sort((x, y) => x - y).join(":");
        if (seen.has(key)) continue;
        seen.add(key);
        const B = cabs[best.j];
        const n = [A.n[0] * side, A.n[1] * side];
        const mid = [(A.c[0] + B.c[0]) / 2, (A.c[1] + B.c[1]) / 2];
        const m = [mid[0] + n[0] * ((A.W - B.W) / 4), mid[1] + n[1] * ((A.W - B.W) / 4)]; // 2 台の内の面のまん中
        const half = best.gap / 2;
        lanes.push({
          card: A.card === B.card ? A.card : "ic", floor: f.id, zf, m, u: A.u, n, half,
          a: [m[0] - n[0] * half, m[1] - n[1] * half], b: [m[0] + n[0] * half, m[1] + n[1] * half],
          cabs: [A.r, B.r],
        });
      }
    });
  }
  return { machines, lanes };
}

// 改札の羽を自動ドアの板として：{ a, b, z0, z1, n, off, kind "bi", gate }（gate はその通り道）
export function laneDoors(lanes) {
  return lanes.map((l) => ({ a: l.a, b: l.b, z0: l.zf + FLAP_Z0, z1: l.zf + FLAP_Z1, n: l.u, off: 0, kind: "bi", gate: l }));
}

// 閉じた羽がふさぐか（walkWorld の setDyn。点と足の高さ）。open は自動ドアの開き具合の並び、doors は自動ドアの並び（gate のあるもの）
export function gateBlocked(doors, open, x, y, z) {
  for (let i = 0; i < doors.length; i++) {
    const d = doors[i];
    const l = d.gate;
    if (!l || (open[i] || 0) > 0.6) continue;
    if (Math.abs(z - l.zf) > 0.8) continue;
    const p = [x - l.m[0], y - l.m[1]];
    if (Math.abs(dot(p, l.u)) < 0.1 + BODY && Math.abs(dot(p, l.n)) < l.half + 0.05) return true;
  }
  return false;
}

// 視線（o・d）の先の使える物：{ kind "vend"|"tvm"|"gate", target, p }。改札は通り道（羽のあたり）か台に当たったら、その通り道
export function pickInteract(list, o, d, reach = USE_REACH) {
  if (!list) return null;
  const nearM = list.machines.filter((m) => len(sub(m.c, o)) < reach + 1.5);
  const nearL = list.lanes.filter((l) => len(sub(l.m, o)) < reach + 1.5);
  if (!nearM.length && !nearL.length) return null;
  for (let t = 0.15; t <= reach; t += 0.04) {
    const p = [o[0] + d[0] * t, o[1] + d[1] * t, o[2] + d[2] * t];
    for (const m of nearM) if (p[2] >= m.z0 && p[2] <= m.z1 && pointInRing(p[0], p[1], m.r)) return { kind: m.kind, target: m, p };
    for (const l of nearL) {
      if (p[2] < l.zf || p[2] > l.zf + 1.25) continue;
      const q = [p[0] - l.m[0], p[1] - l.m[1]];
      if (Math.abs(dot(q, l.u)) < 0.6 && Math.abs(dot(q, l.n)) < l.half) return { kind: "gate", target: l, p };
      if (l.cabs.some((r) => pointInRing(p[0], p[1], r))) return { kind: "gate", target: l, p };
    }
  }
  return null;
}
