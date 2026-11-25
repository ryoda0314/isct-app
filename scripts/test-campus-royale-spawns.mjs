// キャンパスロワイヤルの物資の置き場所（campus3dRoyaleSpawns.js）が、いまの features.json でも立てる場所かを見る。
// 落ちたら node scripts/gen-campus-royale-spawns.mjs で作り直す（版が上がる）。node scripts/test-campus-royale-spawns.mjs
import assert from "node:assert/strict";
import test from "node:test";
import { PLAY_RECT, SPOT } from "../campus-sns/campus3dRoyaleRules.js";
import { HUBS, SPAWNS, SPAWNS_VER } from "../campus-sns/campus3dRoyaleSpawns.js";
import { buildCampusWorld } from "./lib-campus-royale-world.mjs";

const { world } = await buildCampusWorld();

test("数・範囲・印", () => {
  assert.ok(SPAWNS_VER >= 1);
  assert.ok(SPAWNS.length >= 300 && SPAWNS.length <= 420, `${SPAWNS.length} 点`);
  const indoor = SPAWNS.filter((s) => s[3] & SPOT.indoor).length;
  assert.ok(indoor >= 60 && indoor <= SPAWNS.length - 100, `屋内 ${indoor}`);
  assert.ok(SPAWNS.filter((s) => s[3] & SPOT.open).length >= 50, "円の中心の候補（屋外の広い所）");
  for (const [x, y] of SPAWNS) assert.ok(x >= PLAY_RECT[0] && x <= PLAY_RECT[2] && y >= PLAY_RECT[1] && y <= PLAY_RECT[3]);
  assert.ok(HUBS.length >= 8 && HUBS.every((h) => typeof h.name === "string" && Number.isFinite(h.x) && Number.isFinite(h.y)));
});

test("どの点も、いまの世界で足場があって壁の中でない（features.json が変わって古くなっていない）", () => {
  const bad = [];
  SPAWNS.forEach(([x, y, z], i) => {
    const f = world.floorBelow(x, y, z + 0.6);
    if (!f || Math.abs(f.z - z) > 0.6 || world.blocked(x, y, f.z)) bad.push(`${i}:(${x},${y},${z}) ${f ? f.z.toFixed(2) : "足場なし"}`);
  });
  assert.ok(bad.length <= Math.ceil(SPAWNS.length * 0.01), `古い点 ${bad.length}：${bad.slice(0, 8).join(" / ")}`);
});

test("点どうしは近すぎない（同じ階で 5 m 以上）", () => {
  for (let i = 0; i < SPAWNS.length; i++) for (let j = i + 1; j < SPAWNS.length; j++) {
    const a = SPAWNS[i], b = SPAWNS[j];
    if (Math.abs(a[2] - b[2]) < 2.5) assert.ok(Math.hypot(a[0] - b[0], a[1] - b[1]) >= 5, `${i} と ${j}`);
  }
});
