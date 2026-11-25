// キャンパスロワイヤルの弾の当たり（campus3dRoyale.js の rayTarget・wallDist）。体・頭・外れ、壁の向こうには当たらないことを、
// アプリと同じ歩ける世界で見る。node scripts/test-campus-royale-shot.mjs
import assert from "node:assert/strict";
import test from "node:test";
import { toLngLat } from "../campus-sns/campus3dFeatures.js";
import { rayTarget, wallDist } from "../campus-sns/campus3dRoyale.js";
import { HIT } from "../campus-sns/campus3dRoyaleRules.js";
import { buildCampusWorld } from "./lib-campus-royale-world.mjs";

const { world, groundAt } = await buildCampusWorld();
const gAt = (x, y) => groundAt(toLngLat([x, y]));
const dirTo = (o, p) => { const d = [p[0] - o[0], p[1] - o[1], p[2] - o[2]]; const l = Math.hypot(...d); return [d[0] / l, d[1] / l, d[2] / l]; };

test("体・頭・外れ・いちばん近い人", () => {
  const o = [0, 0, 1.62];
  const peers = [{ id: 2, x: 0, y: 10, z: 0, st: 0 }, { id: 3, x: 0, y: 20, z: 0, st: 0 }];
  const body = rayTarget(o, dirTo(o, [0, 10, 1.0]), peers, 100);
  assert.equal(body.id, 2);
  assert.equal(body.head, false);
  assert.ok(Math.abs(body.t - (10 - HIT.bodyR)) < 0.1, `体まで ${body.t.toFixed(2)}`);
  const head = rayTarget(o, dirTo(o, [0, 10, HIT.headZ]), peers, 100);
  assert.ok(head.id === 2 && head.head);
  assert.equal(rayTarget(o, dirTo(o, [1, 10, 1.0]), peers, 100), null, "横 1 m は外れ");
  assert.equal(rayTarget(o, dirTo(o, [0, 10, 1.0]), peers, 9), null, "届く距離の外");
  // 2 人とも線の上なら近いほう（body）。奥の人だけなら奥の人。体の半径 0.32 m の外は外れ
  assert.equal(rayTarget(o, dirTo(o, [0.2, 20, 1.0]), [peers[1]], 100).id, 3);
  assert.equal(rayTarget(o, dirTo(o, [0.5, 20, 1.0]), [peers[1]], 100), null);
  assert.equal(rayTarget(o, dirTo(o, [0, 10, 3]), peers, 100), null, "頭の上は外れ");
  // 落下中（腹ばい）の人は丸ごと
  assert.equal(rayTarget(o, dirTo(o, [0, 10, 0.95]), [{ id: 4, x: 0, y: 10, z: 0, st: 8 }], 100).id, 4);
});

test("建物の向こうの人には当たらない（本館をはさむ）", () => {
  const S = [30, 45], T = [30, -125];
  const o = [S[0], S[1], gAt(...S) + 1.62];
  const p = [T[0], T[1], gAt(...T) + 1.0];
  assert.ok(!world.blocked(S[0], S[1], gAt(...S)), "撃つ人は外にいる");
  const d = dirTo(o, p);
  const L = Math.hypot(p[0] - o[0], p[1] - o[1], p[2] - o[2]);
  const t = wallDist(world, o, d, L, gAt);
  assert.ok(t < L - 5, `壁まで ${t.toFixed(1)} m（人まで ${L.toFixed(1)} m）`);
  const target = rayTarget(o, d, [{ id: 9, x: T[0], y: T[1], z: gAt(...T), st: 0 }], 200);
  assert.ok(target && target.t > t, "人は壁より奥 → 外れになる");
});

test("ひらけた所（グラウンド）では壁に当たらない", () => {
  const S = [-200, 54], T = [-150, 54];
  const o = [S[0], S[1], gAt(...S) + 1.62], p = [T[0], T[1], gAt(...T) + 1.62];
  const d = dirTo(o, p), L = Math.hypot(p[0] - o[0], p[1] - o[1], p[2] - o[2]);
  assert.equal(wallDist(world, o, d, L, gAt), L);
});

test("地面に向けて撃つと地面で止まる", () => {
  const S = [-180, 54];
  const o = [S[0], S[1], gAt(...S) + 1.62];
  // 目の高さ 1.62 m から 10 m 先の地面の 1 m 下を狙う → 地面に当たるのは水平に約 6.2 m（線に沿って約 6.4 m）
  const p = [S[0], S[1] + 10, gAt(S[0], S[1] + 10) - 1];
  const d = dirTo(o, p);
  const t = wallDist(world, o, d, 50, gAt);
  const L = Math.hypot(p[0] - o[0], p[1] - o[1], p[2] - o[2]);
  const expect = (L * (o[2] - gAt(...S))) / (o[2] - p[2]);
  assert.ok(Math.abs(t - expect) < 0.8, `地面まで ${t.toFixed(1)} m（計算 ${expect.toFixed(1)} m）`);
});
