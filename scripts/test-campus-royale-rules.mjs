// campus3dRoyaleRules.js（キャンパスロワイヤルのルール）のテスト。node scripts/test-campus-royale-rules.mjs
// 置き場所はテスト用の格子（本物の表は test-campus-royale-spawns.mjs で見る）
import assert from "node:assert/strict";
import test from "node:test";
import * as R from "../campus-sns/campus3dRoyaleRules.js";

// 8 m の格子。外側の輪は屋内、まん中の 5×5 は拠点、ほかは屋外の広い所
const grid = [];
for (let i = -40; i <= 40; i++) for (let j = -40; j <= 40; j++) {
  const x = 30 + i * 8, y = 55 + j * 8;
  const flags = Math.abs(i) <= 2 && Math.abs(j) <= 2 ? R.SPOT.hub | R.SPOT.open : Math.abs(i) > 36 ? R.SPOT.indoor : R.SPOT.open;
  grid.push([x, y, 30, flags]);
}
const hubs = [{ id: "a", name: "A", x: 30, y: 55 }, { id: "b", name: "B", x: 110, y: 135 }, { id: "c", name: "C", x: -60, y: -20 }];
const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps, `${a} ≒ ${b}`);

test("人数の段", () => {
  assert.deepEqual([1, 2, 4, 5, 10, 11, 24].map(R.tierFor), ["S", "S", "S", "M", "M", "L", "L"]);
});

test("同じシードなら同じ計画、シードが違えば飛行機の線が変わる", () => {
  for (const tier of ["S", "M", "L"]) {
    const a = R.matchPlan(921, tier, grid, hubs);
    assert.deepEqual(a, R.matchPlan(921, tier, grid, hubs));
    assert.notDeepEqual(a.plane, R.matchPlan(922, tier, grid, hubs).plane);
    assert.equal(a.zones.length, R.ZONE_STAGES.length + 1);
    assert.equal(R.zoneAt(a, 0).dps, 0);
    assert.equal(a.r0, R.TIERS[tier].r0);
  }
  assert.deepEqual(R.matchPlan(5, "L", grid, hubs).center0, R.L_CENTER);
  assert.ok(hubs.some((h) => h.x === R.matchPlan(5, "S", grid, hubs).center0[0]), "S・M のはじめの中心は拠点のどれか");
});

test("飛行機は外の円から入って出る・速さ・中心の近くを通る", () => {
  for (let seed = 0; seed < 40; seed++) for (const tier of ["S", "M", "L"]) {
    const p = R.matchPlan(seed, tier, grid, hubs);
    const [cx, cy] = p.center0, { a, b, dur } = p.plane;
    near(Math.hypot(a[0] - cx, a[1] - cy), p.r0 + R.PLANE.margin, 1e-6);
    near(Math.hypot(b[0] - cx, b[1] - cy), p.r0 + R.PLANE.margin, 1e-6);
    near(Math.hypot(b[0] - a[0], b[1] - a[1]) / dur, R.PLANE.speed, 1e-9);
    // 線と中心の距離は 0.3×r0 以内
    const d = Math.abs((b[0] - a[0]) * (a[1] - cy) - (a[0] - cx) * (b[1] - a[1])) / Math.hypot(b[0] - a[0], b[1] - a[1]);
    assert.ok(d <= R.PLANE.offK * p.r0 + 1e-6, `線と中心 ${d.toFixed(1)} m`);
    const mid = R.planeAt(p, dur / 2);
    assert.ok(mid.on && mid.z === R.PLANE.z);
    assert.equal(R.planeAt(p, dur + 0.01).on, false);
    assert.ok(!R.canJump(p, R.PLANE.jumpAfter - 0.01) && R.canJump(p, R.PLANE.jumpAfter + 0.01));
    near(R.ejectAt(p), dur - R.PLANE.forceBefore);
  }
});

test("円は必ず前の円の中・半分の時刻で半分・最後は半径 0 で屋外の点", () => {
  for (let seed = 0; seed < 40; seed++) for (const tier of ["S", "M", "L"]) {
    const p = R.matchPlan(seed, tier, grid, hubs);
    const k = R.TIERS[tier].time;
    p.zones.forEach((z, i) => {
      assert.ok(Math.hypot(z.from.x - z.to.x, z.from.y - z.to.y) + z.to.r <= z.from.r + 1e-6, `段 ${i} が前の円からはみ出す`);
      if (i === 0) {
        near(z.end, p.plane.dur + R.ZONE_GRACE);
        return;
      }
      const st = R.ZONE_STAGES[i - 1];
      near(z.shrink - z.start, st.wait * k);
      near(z.end - z.shrink, st.shrink * k);
      near(z.to.r, p.r0 * st.k);
      near(R.zoneAt(p, z.start + 0.001).r, z.from.r);
      const half = R.zoneAt(p, (z.shrink + z.end) / 2);
      assert.ok(half.shrinking);
      assert.equal(half.stage, i);
      assert.equal(half.dps, st.dps);
      near(half.r, (z.from.r + z.to.r) / 2, 1e-6);
      near(half.x, (z.from.x + z.to.x) / 2, 1e-6);
    });
    const last = R.zoneAt(p, R.zonesEnd(p) + 1);
    assert.equal(last.r, 0);
    assert.ok(last.last && !last.shrinking);
    assert.ok(grid.some(([x, y, , f]) => x === last.x && y === last.y && f & R.SPOT.open), "最後の円の中心は屋外の広い所の点");
  }
});

test("降下中は「次の円」に最初の縮んだ円を見せ、縮むまでの時刻を出す", () => {
  const p = R.matchPlan(3, "M", grid, hubs);
  const z = R.zoneAt(p, 1);
  assert.equal(z.stage, 0);
  assert.deepEqual(z.next, p.zones[1].to);
  near(z.until, p.zones[1].shrink);
});

test("円の中・外（作り込んだ範囲の外は外）", () => {
  const z = { x: 0, y: 0, r: 2000 };
  assert.ok(R.inZone(z, 0, 0));
  assert.ok(!R.inZone(z, R.PLAY_RECT[2] + 1, 0));
  assert.ok(!R.inZone({ x: 0, y: 0, r: 10 }, 11, 0));
});

test("物資の割合は重みどおり（屋外の点・1 万回）", () => {
  const plain = Array.from({ length: 400 }, (_, i) => [30 + (i % 20) * 6, 55 + Math.floor(i / 20) * 6, 30, R.SPOT.open]);
  const n = { weapon: 0, ammo: 0, heal: 0, helmet: 0, none: 0 };
  const w = Object.fromEntries(R.WEAPON_KINDS.map((k) => [k, 0]));
  let total = 0;
  for (let seed = 0; seed < 25; seed++) {
    const p = R.matchPlan(seed, "L", plain, []);
    for (let id = 0; id < plain.length; id++) {
      const it = p.loot.get(id);
      total++;
      if (!it) { n.none++; continue; }
      n[R.catOf(it.kind)]++;
      if (R.catOf(it.kind) === "weapon") {
        w[it.kind]++;
        assert.equal(it.n, R.WEAPONS[it.kind].mag, "ブラスターは弾倉 1 つぶんの弾つき");
      }
      if (R.catOf(it.kind) === "ammo") assert.equal(it.n, R.AMMO_PACK[it.kind]);
    }
  }
  const sum = Object.values(R.LOOT.kinds).reduce((a, b) => a + b, 0);
  for (const k of Object.keys(n)) near(n[k] / total, R.LOOT.kinds[k] / sum, 0.02);
  const ws = Object.values(w).reduce((a, b) => a + b, 0), wsum = Object.values(R.LOOT.weapons).reduce((a, b) => a + b, 0);
  for (const k of R.WEAPON_KINDS) near(w[k] / ws, R.LOOT.weapons[k] / wsum, 0.03);
});

test("拠点の点は 4 割以上がブラスター、屋内はブラスターが出やすい、はじめの円の外には出ない", () => {
  let indoorW = 0, indoorN = 0, outW = 0, outN = 0;
  for (let seed = 0; seed < 30; seed++) {
    const p = R.matchPlan(seed, "L", grid, hubs);
    const hubIds = grid.map((s, i) => [s, i]).filter(([s]) => s[3] & R.SPOT.hub).map(([, i]) => i);
    const hw = hubIds.filter((i) => R.catOf(p.loot.get(i)?.kind) === "weapon").length;
    assert.ok(hw / hubIds.length >= R.LOOT.hubWeaponMin - 1e-9, `拠点のブラスター ${hw}/${hubIds.length}`);
    grid.forEach((s, i) => {
      const isW = R.catOf(p.loot.get(i)?.kind) === "weapon";
      if (s[3] & R.SPOT.hub) return;
      if (s[3] & R.SPOT.indoor) { indoorN++; indoorW += isW; } else { outN++; outW += isW; }
    });
    const ps = R.matchPlan(seed, "S", grid, hubs);
    for (const id of ps.loot.keys()) assert.ok(Math.hypot(grid[id][0] - ps.center0[0], grid[id][1] - ps.center0[1]) <= ps.r0 + R.LOOT.margin + 1e-6);
  }
  assert.ok(indoorW / indoorN > (outW / outN) * 1.15, `屋内 ${(indoorW / indoorN).toFixed(3)} 屋外 ${(outW / outN).toFixed(3)}`);
});

test("練習の的は中心から 25〜100 m の屋外、物資の点には立たない", () => {
  const p = R.matchPlan(8, "S", grid, hubs);
  assert.equal(p.dummies.length, R.MATCH.practiceDummies);
  const lootAt = new Set([...p.loot.keys()].map((id) => `${grid[id][0]},${grid[id][1]}`));
  for (const [x, y] of p.dummies) {
    const d = Math.hypot(x - p.center0[0], y - p.center0[1]);
    assert.ok(d >= 25 && d <= 100);
    assert.ok(!lootAt.has(`${x},${y}`), `的 (${x}, ${y}) が物資の点に立っている`);
  }
});

test("近くの点がほとんど物資なら、的の立つ物資の点は dummyLoot に入る", () => {
  const sparse = [];
  for (let i = -8; i <= 8; i++) for (let j = -8; j <= 8; j++) sparse.push([30 + i * 30, 55 + j * 30, 30, R.SPOT.open]);
  for (const seed of [8, 9, 10, 11]) {
    const p = R.matchPlan(seed, "S", sparse, hubs);
    assert.equal(p.dummies.length, R.MATCH.practiceDummies);
    const under = new Set(p.dummyLoot);
    assert.ok(under.size > 0, "この格子では物資の点にも的が立つ");
    for (const [x, y] of p.dummies) {
      const id = sparse.findIndex((s) => s[0] === x && s[1] === y);
      assert.ok(id >= 0);
      assert.equal(p.loot.has(id), under.has(id), `的の点 ${id}：物資があれば dummyLoot に入る`);
    }
  }
});

test("ダメージ：距離の倍率・頭・ヘルメット・散弾", () => {
  assert.equal(R.damageOf("pistol", 10), 24);
  assert.equal(R.damageOf("pistol", 25), 24);
  assert.equal(R.damageOf("pistol", 47.5), Math.round(24 * 0.8));
  assert.equal(R.damageOf("pistol", 70), Math.round(24 * 0.6));
  assert.equal(R.damageOf("pistol", 200), Math.round(24 * 0.6));
  assert.equal(R.damageOf("pistol", 10, 1), 36);
  assert.equal(R.damageOf("pistol", 10, 1, 1, true), 24);
  assert.equal(R.damageOf("sniper", 390, 1), 180);
  assert.equal(R.damageOf("sniper", 390, 1, 1, true), 117);
  assert.equal(R.damageOf("shotgun", 5, 0, 8), 80);
  assert.equal(R.damageOf("shotgun", 5, 3, 8), Math.round(10 * (5 + 3 * 1.25)));
  assert.equal(R.damageOf("shotgun", 30, 0, 8), Math.round(10 * 0.2 * 8));
  assert.equal(R.damageOf("fist", 1), 18);
  assert.equal(R.damageOf("nothing", 1), 0);
});

test("ばらつき・回復", () => {
  near(R.spreadOf("ar", { moving: true, air: true, ads: true }), 1.2 * 0.5 * 1.6 * 2.2);
  near(R.spreadOf("sniper", { ads: true }), 0.15);
  near(R.spreadOf("sniper"), 4);
  assert.equal(R.spreadOf("fist"), 0);
  assert.deepEqual(R.healed("tea", 90, 0), { hp: 100, sh: 0 });
  assert.deepEqual(R.healed("bento", 10, 5), { hp: 100, sh: 5 });
  assert.deepEqual(R.healed("coffee", 50, 90), { hp: 50, sh: 100 });
  assert.deepEqual(R.healed("energy", 50, 10), { hp: 50, sh: 100 });
  assert.ok(!R.healUseful("tea", 100, 0) && R.healUseful("tea", 99, 0) && !R.healUseful("energy", 1, 100));
});
