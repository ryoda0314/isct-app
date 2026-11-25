import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { normalizeFeature, pointInRing, toXY } from "../campus-sns/campus3dFeatures.js";
import { addFloor, stairGeom } from "../campus-sns/campus3dInterior.js";
import { Mesh } from "../campus-sns/campus3dMesh.js";
import { collectSeats, seatPick, sitPose } from "../campus-sns/campus3dSeats.js";
import { walkWorld } from "../campus-sns/campus3dWalk.js";

const { features } = JSON.parse(readFileSync(new URL("../public/map-3d/features.json", import.meta.url)));
const source = features.find(f => f.id === "taki-int-b1");
const floor = normalizeFeature(source);
const ground = 33.9, z = ground + floor.z;
const world = walkWorld({ data: { buildings: [], water: [] }, features: [floor], groundAt: () => ground });
const origin = toXY([139.68455, 35.60618]);
const angle = -7.44 * Math.PI / 180;
const onPlan = (x, y) => [
  origin[0] + x * Math.cos(angle) - y * Math.sin(angle),
  origin[1] + x * Math.sin(angle) + y * Math.cos(angle),
];
const ring = item => item.coords.map(toXY);
const middle = item => ring(item).reduce((a, p) => a.map((v, j) => v + p[j] / item.coords.length), [0, 0]);
const named = name => floor.items.filter((it, i) => source.items[i].name === name);
const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const inShape = (item, p) => pointInRing(...p, ring(item));

function walk(points) {
  const path = points.map(([x, y]) => onPlan(x, y));
  let p = path[0];
  assert.equal(world.blocked(...p, z), false, "path origin");
  for (const dest of path.slice(1)) {
    const n = Math.ceil(distance(p, dest) / .11);
    const step = dest.map((v, j) => (v - p[j]) / n);
    for (let i = 0; i < n; i++) {
      const next = world.move(...p, z, ...step);
      const want = p.map((v, j) => v + step[j]);
      assert.ok(distance([next.x, next.y], want) < .009 && Math.abs(next.floor?.z - z) < .03,
        `blocked at ${JSON.stringify(points)} segment ${path.indexOf(dest)}, step ${i}/${n}`);
      p = [next.x, next.y];
    }
  }
}

test("reading tables and seats fit below the upper flight, including standing and seated headroom", () => {
  const stair = stairGeom(floor.stairs[1], z);
  const tables = named("階段直下の閲覧テーブル"), chairs = named("階段直下の閲覧席");
  assert.equal(tables.length, 2);
  assert.equal(chairs.length, 4);
  for (const it of [...tables, ...chairs]) {
    for (const p of ring(it)) {
      assert.ok(pointInRing(...p, stair.ring), "entire item must lie under the treads");
      assert.ok(stair.topAt(...p) - stair.riser - .45 > z + 1.82);
    }
    assert.ok(world.blocked(...middle(it), z));
  }
  walk([[7.75, 7.05], [10.45, 7.05], [11.42, 7.05]]);
});

test("the landing table has a concave laminated edge, four woven chairs and its own pouf", () => {
  const [table] = named("階段降り口の枝形の積層テーブル");
  assert.equal(table.style, "branchSlab");
  assert.equal(table.coords.length, 40);
  const r = ring(table);
  const turns = r.map((p, i) => {
    const a = r[(i + r.length - 1) % r.length], b = r[(i + 1) % r.length];
    return (p[0] - a[0]) * (b[1] - p[1]) - (p[1] - a[1]) * (b[0] - p[0]);
  });
  assert.ok(turns.filter(t => t < -.002).length >= 3 && turns.filter(t => t > .002).length >= 3);
  assert.ok(world.blocked(...middle(table), z));
  const supports = [];
  class TableMesh extends Mesh {
    vert(p, height, n, c) {
      if (Math.abs(height - (z + table.z1 - .10)) < .001) supports.push(p);
      super.vert(p, height, n, c);
    }
  }
  const meshes = { m: new TableMesh(), veil: new Mesh(), glassy: new Mesh(), finishes: new Map() };
  addFloor(meshes, { ...floor, walls: [], lids: [], stairs: [], items: [table] }, { groundAt: () => ground });
  assert.ok(supports.length >= 16 && supports.every(p => inShape(table, p)), "sled uprights must meet the underside");
  assert.equal(named("階段降り口の編み座椅子").filter(it => it.style === "webbed").length, 4);
  assert.ok(distance(middle(named("枝形テーブル横の丸いオットマン")[0]), middle(named("グローバルラウンジの丸いオットマン")[0])) > 4);
  for (const item of [table, ...named("階段降り口の編み座椅子")]) {
    assert.ok(ring(item).every(p => inShape(floor, p) && !floor.holes.some(h => inShape(h, p))));
  }
  walk([[9.5, 24], [9.5, 21.8], [9.6, 17.2], [10.31, 16.0]]);
});

test("players can approach, pick and sit on every new chair facing its table", () => {
  const seats = collectSeats([floor], () => ground);
  for (const [chairName, tableName] of [
    ["階段直下の閲覧席", "階段直下の閲覧テーブル"],
    ["階段降り口の編み座椅子", "階段降り口の枝形の積層テーブル"],
  ]) {
    for (const chair of named(chairName)) {
      const c = middle(chair), seat = seats.find(s => distance(s.c, c) < .012);
      assert.ok(seat);
      const table = named(tableName).map(middle).sort((a, b) => distance(a, c) - distance(b, c))[0];
      const approaches = Array.from({ length: 24 }, (_, i) => {
        const a = i * Math.PI / 12;
        return [c[0] + .78 * Math.cos(a), c[1] + .78 * Math.sin(a), z + 1.56];
      });
      const approach = approaches.find(o => {
        if (world.blocked(o[0], o[1], z) || Math.abs(world.floorBelow(o[0], o[1], z + .1)?.z - z) > .04) return false;
        const d = [c[0] - o[0], c[1] - o[1], seat.seat - o[2]], len = Math.hypot(...d);
        return seatPick(seats, o, d.map(v => v / len), z)?.seat === seat;
      });
      assert.ok(approach, "must offer a clear seat/stand approach");
      const pose = sitPose(seat, c, approach);
      const yaw = pose.yaw * Math.PI / 180, target = [table[0] - pose.x, table[1] - pose.y];
      assert.ok((Math.sin(yaw) * target[0] + Math.cos(yaw) * target[1]) / Math.hypot(...target) > .89);
      assert.ok(Math.abs(pose.z - z) < .02 && pose.eye > 1.19 && pose.eye < 1.26);
    }
  }
});

test("the crosswise career rooms open independently onto the side corridor", () => {
  const advisor = floor.rooms.find(r => r.name === "キャリアアドバイザールーム");
  const library = floor.rooms.find(r => r.name === "就職資料室");
  assert.ok(inShape(advisor, onPlan(15.1, 1.0)));
  assert.ok(inShape(library, onPlan(15.1, 3.60)));
  assert.ok(!inShape(library, middle(advisor)));
  walk([[17.95, -2], [18.03, 2.29], [16.65, 2.29]]);
  walk([[17.95, -2], [18.03, 3.77], [16.65, 3.77]]);
  assert.ok(world.blocked(...onPlan(15.50, 3.08), z));
});
