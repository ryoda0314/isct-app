// キャンパスロワイヤルの降下（campus3dRoyale.js の stepDrop）を、アプリと同じ歩ける世界で見る。node scripts/test-campus-royale-drop.mjs
import assert from "node:assert/strict";
import test from "node:test";
import { toLngLat } from "../campus-sns/campus3dFeatures.js";
import { stepDrop } from "../campus-sns/campus3dRoyale.js";
import { DROP, LOBBY, PLANE } from "../campus-sns/campus3dRoyaleRules.js";
import { buildCampusWorld } from "./lib-campus-royale-world.mjs";

const { world, groundAt } = await buildCampusWorld();
const dt = 1 / 60;

// x, y の上空 PLANE.z から落とす。inp(t) はその時刻の入力
function fall(x, y, inp = () => ({}), max = 90) {
  const d = { chute: false, fallT: 0 };
  let s = { x, y, z: PLANE.z, vx: 0, vy: 0, vz: 0, yaw: 0, onGround: false };
  let openAt = null, openAgl = null;
  for (let t = 0; t < max; t += dt) {
    const r = stepDrop(d, s, inp(t), dt, world);
    if (d.chute && openAt == null) { openAt = t; openAgl = r.agl; }
    s = r.s;
    if (r.landed) return { s, t, openAt, openAgl, d };
  }
  return { s, t: max, openAt, openAgl, d, timeout: true };
}

test("何もしなければ足場から 60 m で開いて、ウッドデッキに降りる（約 15 秒）", () => {
  const r = fall(LOBBY.x, LOBBY.y);
  assert.ok(!r.timeout);
  const deck = world.floorBelow(LOBBY.x, LOBBY.y, groundAt(toLngLat([LOBBY.x, LOBBY.y])) + 2);
  assert.ok(Math.abs(r.s.z - deck.z) < 0.05, `降りた高さ ${r.s.z.toFixed(2)}・デッキ ${deck.z.toFixed(2)}`);
  assert.ok(r.openAgl <= DROP.autoOpen + 0.01 && r.openAgl > DROP.autoOpen - 2, `開いた高さ ${r.openAgl.toFixed(1)} m`);
  assert.ok(r.t > 12 && r.t < 19, `${r.t.toFixed(1)} 秒`);
  assert.ok(!world.blocked(r.s.x, r.s.y, r.s.z));
});

test("急降下なら早く、早く開けば長く飛べる（3.4 の目安）", () => {
  const dive = fall(LOBBY.x, LOBBY.y, () => ({ dive: true }));
  const glide = fall(LOBBY.x, LOBBY.y, (t) => ({ open: t > 1.05 }));
  const plain = fall(LOBBY.x, LOBBY.y);
  assert.ok(dive.t < plain.t - 2 && dive.t < 14, `急降下 ${dive.t.toFixed(1)} 秒`);
  assert.ok(glide.t > 26 && glide.t < 40, `早く開く ${glide.t.toFixed(1)} 秒`);
  assert.ok(glide.openAt >= DROP.manualAfter && glide.openAt < DROP.manualAfter + 0.2, "手で開けるのは 1 秒たってから");
});

test("屋上の上で落ちれば屋上に立つ（西3号館）", () => {
  const top = world.floorBelow(-64, -18, 400);
  const g = groundAt(toLngLat([-64, -18]));
  assert.ok(top.z > g + 25, `屋上 ${top.z.toFixed(1)}・地面 ${g.toFixed(1)}`);
  const r = fall(-64, -18);
  assert.ok(Math.abs(r.s.z - top.z) < 0.05, `降りた ${r.s.z.toFixed(2)}`);
  assert.ok(!world.blocked(r.s.x, r.s.y, r.s.z));
});

test("前へ飛び続けても建物の中には入らない", () => {
  // 西3号館の東 60 m の上空から西へ（向き 270）パラシュートで進む
  const r = fall(-4, -18, (t) => ({ fwd: 1, open: t > 1.05 }), 120);
  assert.ok(!r.timeout);
  assert.ok(!world.blocked(r.s.x, r.s.y, r.s.z), `降りた所 (${r.s.x.toFixed(1)}, ${r.s.y.toFixed(1)}, ${r.s.z.toFixed(1)})`);
  const f = world.floorBelow(r.s.x, r.s.y, r.s.z + 0.05);
  assert.ok(f && Math.abs(f.z - r.s.z) < 0.05);
});

void PLANE;
