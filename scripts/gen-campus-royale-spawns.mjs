// キャンパスロワイヤルの物資の置き場所の表（campus-sns/campus3dRoyaleSpawns.js）を作る。node scripts/gen-campus-royale-spawns.mjs
// 1. アプリと同じ歩ける世界を組む（scripts/lib-campus-royale-world.mjs）
// 2. 入口（ウッドデッキ）から歩いて行ける所を幅優先で探す：1.5 m ずつ 8 方向へ、0.5 m きざみで world.move（壁ぞいにすべる＝ドアを通れる）。
//    ふちから落ちるのはよい（一方通行）。エレベーターでしか行けない階は入らない
// 3. 行ける所から、屋外と屋内（屋根の下）を分けて、間をあけて選ぶ（屋外 ≒ 200・屋内 ≒ 180）。拠点の 40 m 以内に印、まわり 3 m があいた屋外に「広い所」の印
// features.json が変わったら回し直す（scripts/test-campus-royale-spawns.mjs が古くなったのを見つける）
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pointInRing, toLngLat, toXY } from "../campus-sns/campus3dFeatures.js";
import { floorG0 } from "../campus-sns/campus3dInterior.js";
import { LOBBY, PLAY_RECT, SPOT } from "../campus-sns/campus3dRoyaleRules.js";
import { buildCampusWorld } from "./lib-campus-royale-world.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "campus-sns", "campus3dRoyaleSpawns.js");
const CELL = 1.5; // 探す升目
const SUB = 0.5; // 1 回の move の長さ
const TARGET = { out: 200, in: 180 };
const HUB_R = 40;
const log = (...a) => console.log(...a);

// 拠点：id の頭・名前から、その建物群のまん中を測る（測れなければ目安の位置）
const HUB_DEFS = [
  { id: "honkan", name: "本館", ids: ["hon-"], re: /^本館/, at: [25, -20] },
  { id: "deck", name: "ウッドデッキ・70周年記念講堂", ids: ["deck-", "k70-"], at: [46, 121] },
  { id: "taki", name: "Taki Plaza", ids: ["taki-"], at: [100, 155] },
  { id: "centennial", name: "百年記念館", re: /百年記念館/, at: [124, 223] },
  { id: "station", name: "大岡山駅前", ids: ["ok-", "mc-", "ts-"], at: [190, 270] },
  { id: "w8", name: "西8号館", ids: ["w8e-", "w8w-", "w8-"], re: /西8号館/, at: [-95, 14] },
  { id: "west", name: "西講義棟・西2・西3号館", ids: ["wl1-", "wl2-"], re: /西[23]号館|西講義棟/, at: [-90, -25] },
  { id: "w5w9", name: "西5・西9号館", re: /西[59]号館/, at: [-70, 130] },
  { id: "south", name: "南2・南4号館", ids: ["s4-"], re: /南[24]号館/, at: [68, -180] },
  { id: "ishikawadai", name: "石川台", ids: ["i1-", "i2-", "i5-", "i6-", "i8-"], re: /石川台/, at: [90, -420] },
  { id: "field", name: "グラウンド", ids: ["gr-"], at: null },
  { id: "gym", name: "屋内運動場", ids: ["gst-"], re: /屋内運動場/, at: null },
];

// 決まった順の乱数（並べかえ用）
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const r1 = (v) => Math.round(v * 10) / 10;

const t0 = Date.now();
const { world, view, features, groundAt, sha } = await buildCampusWorld({ log });

// ── 拠点 ──
const hubs = [];
for (const h of HUB_DEFS) {
  const pts = [];
  for (const f of features) {
    if (!f.coords?.length || !["building", "floor", "terrace", "surface"].includes(f.type)) continue;
    const hit = (h.ids || []).some((p) => f.id.startsWith(p)) || (h.re && h.re.test(f.name || ""));
    if (!hit) continue;
    const xy = f.coords.filter((c) => Array.isArray(c) && typeof c[0] === "number").map(toXY);
    if (!xy.length) continue;
    pts.push([xy.reduce((s, p) => s + p[0], 0) / xy.length, xy.reduce((s, p) => s + p[1], 0) / xy.length]);
  }
  let at = h.at;
  if (pts.length) {
    // 外れ値に引っぱられないよう、まん中の値（中央値）
    const med = (a) => a.sort((u, v) => u - v)[Math.floor(a.length / 2)];
    at = [med(pts.map((p) => p[0])), med(pts.map((p) => p[1]))];
  }
  if (!at) { log(`拠点 ${h.name}：見つからないので入れない`); continue; }
  hubs.push({ id: h.id, name: h.name, x: r1(at[0]), y: r1(at[1]), n: pts.length });
}
log("拠点", hubs.map((h) => `${h.name}(${h.x},${h.y}; ${h.n})`).join(" / "));

// ── 歩いて行ける所 ──
const inArea = (x, y) => x >= PLAY_RECT[0] - 30 && x <= PLAY_RECT[2] + 30 && y >= PLAY_RECT[1] - 30 && y <= PLAY_RECT[3] + 30;
const keyOf = (x, y, z) => `${Math.round(x / CELL)},${Math.round(y / CELL)},${Math.round(z / 2)}`;
const g0 = groundAt(toLngLat([LOBBY.x, LOBBY.y]));
const f0 = world.floorBelow(LOBBY.x, LOBBY.y, g0 + 1);
const start = { x: LOBBY.x, y: LOBBY.y, z: f0.z, deck: f0.deck };
const seen = new Map([[keyOf(start.x, start.y, start.z), start]]);
const queue = [start];
const DIRS = [];
for (let k = 0; k < 8; k++) DIRS.push([Math.cos((k * Math.PI) / 4), Math.sin((k * Math.PI) / 4)]);
let qi = 0;
const tb = Date.now();
while (qi < queue.length) {
  const s = queue[qi++];
  if (qi % 20000 === 0) log(`  探した ${qi} / 見つけた ${seen.size}（${((Date.now() - tb) / 1000).toFixed(0)} 秒）`);
  for (const [ux, uy] of DIRS) {
    let x = s.x, y = s.y, z = s.z, deck = s.deck, ok = true, went = 0;
    for (let i = 0; i < CELL / SUB; i++) {
      const r = world.move(x, y, z, ux * SUB, uy * SUB, { onGround: true, deck });
      if (!r.floor) { ok = false; break; }
      went += Math.hypot(r.x - x, r.y - y);
      x = r.x; y = r.y;
      z = r.floor.z; // 段に沿う・ふちからは落ちる
      deck = r.floor.deck;
    }
    if (!ok || went < CELL * 0.4 || !inArea(x, y)) continue;
    const k = keyOf(x, y, z);
    if (seen.has(k)) continue;
    const n = { x, y, z, deck };
    seen.set(k, n);
    queue.push(n);
  }
}
log(`行ける所 ${seen.size}（${((Date.now() - tb) / 1000).toFixed(0)} 秒）`);

// ── 屋内・屋外・広い所 ──
const floors = view.filter((f) => f.type === "floor" && f.coords?.length > 2).map((f) => ({ f, ring: f.coords.map(toXY), holes: (f.holes || []).map((h) => (h.coords || h).map(toXY)), z: floorG0(f, groundAt) + f.z }));
const floorOf = (x, y, z) => floors.find((F) => Math.abs(F.z - z) < 1.2 && pointInRing(x, y, F.ring) && !F.holes.some((h) => pointInRing(x, y, h)));
// 書き出す位置（0.1 m に丸める）で、足場があり、まわり 0.5 m も壁でない点だけ（物資が壁にめりこまない・丸めで壁に入らない）
const clear = (x, y, z) => {
  const f = world.floorBelow(x, y, z + 0.6);
  if (!f || Math.abs(f.z - z) > 0.3 || world.blocked(x, y, f.z)) return null;
  for (let k = 0; k < 6; k++) {
    const a = (k * Math.PI) / 3;
    if (world.blocked(x + Math.cos(a) * 0.5, y + Math.sin(a) * 0.5, f.z)) return null;
  }
  return f.z;
};
const cands = { out: [], in: [] };
for (const s0 of seen.values()) {
  const s = { ...s0, x: r1(s0.x), y: r1(s0.y) };
  if (!(s.x >= PLAY_RECT[0] && s.x <= PLAY_RECT[2] && s.y >= PLAY_RECT[1] && s.y <= PLAY_RECT[3])) continue;
  const z = clear(s.x, s.y, s0.z);
  if (z == null) continue;
  s.z = r1(z);
  const indoor = world.coverAt(s.x, s.y) > s.z + 1.8;
  const F = indoor ? floorOf(s.x, s.y, s.z) : null;
  (indoor ? cands.in : cands.out).push({ ...s, indoor, floor: F?.f.id || null });
}
log(`候補 屋外 ${cands.out.length}・屋内 ${cands.in.length}`);

// 間をあけて選ぶ（決まった順に並べて、近すぎるものを飛ばす）。同じ場所の上下の階（2.5 m 以上ちがう）はぶつからない
function sample(list, D, seed) {
  const r = rng(seed);
  const order = list.map((p) => [r(), p]).sort((a, b) => a[0] - b[0]).map((a) => a[1]);
  const cell = new Map();
  const picked = [];
  const ck = (x, y) => `${Math.floor(x / D)},${Math.floor(y / D)}`;
  for (const p of order) {
    const cx = Math.floor(p.x / D), cy = Math.floor(p.y / D);
    let near = false;
    for (let i = cx - 1; i <= cx + 1 && !near; i++) for (let j = cy - 1; j <= cy + 1 && !near; j++) {
      for (const q of cell.get(`${i},${j}`) || []) if (Math.hypot(q.x - p.x, q.y - p.y) < D && Math.abs(q.z - p.z) < 2.5) { near = true; break; }
    }
    if (near) continue;
    picked.push(p);
    const k = ck(p.x, p.y);
    if (!cell.has(k)) cell.set(k, []);
    cell.get(k).push(p);
  }
  return picked;
}
// 数が目標に近くなる間かくを二分探索
function sampleTo(list, target, seed) {
  if (!list.length) return { picked: [], D: 0 };
  let lo = 5, hi = 200, best = null;
  for (let it = 0; it < 24; it++) {
    const D = (lo + hi) / 2;
    const p = sample(list, D, seed);
    if (!best || Math.abs(p.length - target) < Math.abs(best.picked.length - target)) best = { picked: p, D };
    if (p.length > target) lo = D; else hi = D;
  }
  return best;
}
const outS = sampleTo(cands.out, TARGET.out, 11);
// 屋内は 1 つの階に 4 点まで
let inS = sampleTo(cands.in, TARGET.in, 23);
const perFloor = new Map();
inS.picked = inS.picked.filter((p) => {
  const k = p.floor || `cover:${Math.round(p.x / 12)},${Math.round(p.y / 12)}`;
  const n = perFloor.get(k) || 0;
  if (n >= 4) return false;
  perFloor.set(k, n + 1);
  return true;
});
log(`選んだ 屋外 ${outS.picked.length}（間 ${outS.D.toFixed(1)} m）・屋内 ${inS.picked.length}（間 ${inS.D.toFixed(1)} m・階 ${new Set(inS.picked.map((p) => p.floor).filter(Boolean)).size}）`);

const openAround = (p) => {
  for (let k = 0; k < 8; k++) {
    const a = (k * Math.PI) / 4;
    const x = p.x + Math.cos(a) * 3, y = p.y + Math.sin(a) * 3;
    const f = world.floorBelow(x, y, p.z + 0.6);
    if (!f || Math.abs(f.z - p.z) > 1.2 || world.blocked(x, y, f.z)) return false;
  }
  return true;
};
// 屋内と屋外をまぜても、同じ高さで 5 m あける（屋内を残す）
const all = [...inS.picked];
for (const p of outS.picked) if (!all.some((q) => Math.abs(q.z - p.z) < 2.5 && Math.hypot(q.x - p.x, q.y - p.y) < 5)) all.push(p);
all.sort((a, b) => a.y - b.y || a.x - b.x);
const spawns = all.map((p) => {
  let flags = 0;
  if (p.indoor) flags |= SPOT.indoor;
  if (hubs.some((h) => Math.hypot(h.x - p.x, h.y - p.y) <= HUB_R)) flags |= SPOT.hub;
  if (!p.indoor && openAround(p)) flags |= SPOT.open;
  return [p.x, p.y, p.z, flags];
});
const perHub = hubs.map((h) => `${h.name} ${spawns.filter((s) => Math.hypot(h.x - s[0], h.y - s[1]) <= HUB_R).length}`);
log("拠点ごと", perHub.join(" / "));
log("広い所", spawns.filter((s) => s[3] & SPOT.open).length);

// 版：中身が前と違えば 1 つ上げる
let ver = 1;
if (fs.existsSync(OUT)) {
  const old = fs.readFileSync(OUT, "utf8");
  const v = +(old.match(/SPAWNS_VER = (\d+)/)?.[1] || 0);
  const same = old.includes(JSON.stringify(spawns)) && old.includes(JSON.stringify(hubs.map(({ n, ...h }) => h)));
  ver = same ? v : v + 1;
}
const body = `// 生成物：scripts/gen-campus-royale-spawns.mjs が作る（手で直さない）。キャンパスロワイヤルの物資の置き場所と拠点。
// SPAWNS は [x, y, z, flags]（平面の m・足もとの標高 m。flags は campus3dRoyaleRules の SPOT：1 屋内・2 拠点・4 屋外の広い所）。並びの番号が物資の番号。
// 部屋サーバー（cf-walk-rooms）も読むので、ほかのファイルは import しない。features.json の印 ${sha}（${new Date().toISOString().slice(0, 10)}）
export const SPAWNS_VER = ${ver};
export const SPAWNS_SRC = "${sha}";
export const HUBS = ${JSON.stringify(hubs.map(({ n, ...h }) => h))};
export const SPAWNS = ${JSON.stringify(spawns)};
`;
fs.writeFileSync(OUT, body);
log(`書いた ${path.relative(ROOT, OUT)}：${spawns.length} 点・版 ${ver}（全体 ${((Date.now() - t0) / 1000).toFixed(0)} 秒）`);
