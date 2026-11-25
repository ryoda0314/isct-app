import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import clip from "polygon-clipping";
import { PALETTES } from "../campus-sns/campusBasemap.js";
import { raycastMesh } from "../campus-sns/campus3dDebug.js";
import { stepDoors } from "../campus-sns/campus3dDoors.js";
import { detailView, parseFeatures, toXY } from "../campus-sns/campus3dFeatures.js";
import { MARKET_GOODS, MARKET_SHELF_LABELS, marketProductModel } from "../campus-sns/campus3dMarketProducts.js";
import { STOCK_STRIDE } from "../campus-sns/campus3dMarketLayer.js";
import { buildMesh, worldOf } from "../campus-sns/campus3dMesh.js";
import { walkWorld } from "../campus-sns/campus3dWalk.js";

const survey = JSON.parse(readFileSync(new URL("../public/map-3d/features.json", import.meta.url)));
const store = parseFeatures(survey.features.filter((f) => /^(ts-|tsf-)/.test(f.id)));
const features = detailView(store);
const floor = features.find((f) => f.id === "ts-sales-1f");
const shell = features.find((f) => f.id === floor.host);
const [ox, oy] = toXY(shell.coords[3]);
const [ax, ay] = toXY(shell.coords[2]);
const length = Math.hypot(ax - ox, ay - oy);
const c = (ax - ox) / length,
  s = (ay - oy) / length;
const xy = ([depth, across]) => [ox + depth * c + across * s, oy + depth * s - across * c];
const groundAt = () => 33.4;
const z = groundAt() + floor.z;
const mesh = buildMesh(features, { groundAt, clip, pal: PALETTES.light });
const world = walkWorld({ data: { buildings: [] }, groundAt, features });

function fixtureBounds(fixture) {
  const points = fixture.coords.map(toXY).map(([x, y]) => [(x - ox) * c + (y - oy) * s, (x - ox) * s - (y - oy) * c]);
  const u = points.map((p) => p[0]),
    v = points.map((p) => p[1]);
  return { u0: Math.min(...u), u1: Math.max(...u), v0: Math.min(...v), v1: Math.max(...v) };
}
const groceryRuns = floor.items.filter((it) => it.style === "gondola").map(fixtureBounds);
const nearRuns = groceryRuns.filter((r) => r.v0 < 9).sort((a, b) => a.u0 - b.u0);
const farRuns = groceryRuns.filter((r) => r.v0 > 9).sort((a, b) => a.u0 - b.u0);

function walk(points) {
  let [x, y] = xy(points[0]);
  let foot = world.floorBelow(x, y, z + 0.25);
  for (const next of points.slice(1)) {
    const [a, b] = xy(next),
      dx = a - x,
      dy = b - y;
    const steps = Math.ceil(Math.hypot(dx, dy) / 0.08);
    for (let i = 0; i < steps; i++) {
      ({ x, y, floor: foot } = world.move(x, y, foot.z, dx / steps, dy / steps, { deck: foot.deck }));
      assert.ok(Math.abs(foot.z - z) < 0.16, "unexpected floor height " + (foot.z - z) + " on the route to " + next);
    }
    assert.ok(Math.hypot(x - a, y - b) < 0.13, "blocked on the route to " + next);
  }
}

test("both building shells share one sales floor, with operable doors and distinct floor finishes", () => {
  assert.deepEqual(
    new Set(features.filter((f) => f.detailShell).map((f) => f.id)),
    new Set(["ts-store", "ts-store-e"])
  );
  assert.equal(mesh.doors.length, 3);
  for (const [i, d] of mesh.doors.entries()) {
    const open = mesh.doors.map(() => 0);
    stepDoors(mesh.doors, open, { x: (d.a[0] + d.b[0]) / 2, y: (d.a[1] + d.b[1]) / 2, z: d.z0 + 0.02 }, 1);
    assert.equal(open[i], 1);
    stepDoors(mesh.doors, open, null, 2);
    assert.ok(open.every((v) => v === 0));
  }
  for (const [point, finish] of [
    [[1.6, 3.3], "marketTile"],
    [[10.2, 3.3], "marketPlanks"],
    [[36.8, 8.5], "marketVinyl"],
    [[56.8, 7.9], "marketPlanks"],
    [[12.4, 12.3], "marketVinyl"]
  ]) {
    const h = raycastMesh(mesh, { o: [...worldOf(xy(point)), z + 0.18], d: [0, 0, -1] }, ["floors"]);
    assert.ok(h && Math.abs(h.t - 0.18) < 0.012);
    assert.equal(
      mesh.floors.batches.find((b) => h.tri * 3 >= b.first && h.tri * 3 < b.first + b.count)?.finish,
      finish
    );
  }
  const cut = detailView(store, { detail: true, level: 0 });
  assert.ok(cut.some((f) => f.id === floor.id && f.cut));
  assert.ok(!cut.some((f) => f.id === shell.id || f.id === "ts-entry-canopy"));
  assert.deepEqual(
    new Set(mesh.floors.batches.map((b) => b.finish)),
    new Set(["marketTile", "marketVinyl", "marketPlanks"])
  );
});

test("every assortment has independently positioned, volumetric products at both viewing distances", () => {
  const inventory = new Map(),
    facings = new Set();
  for (const chunk of mesh.marketStock.chunks)
    for (const g of chunk.groups) {
      assert.equal(g.instances.length % STOCK_STRIDE, 0);
      if (g.model.startsWith("street/") || g.model.startsWith("price") || g.model === "iceBed" || MARKET_SHELF_LABELS[g.model]) continue;
      inventory.set(g.model, (inventory.get(g.model) || 0) + g.instances.length / STOCK_STRIDE);
      facings.add(g.behind);
      for (let j = 0; j < g.instances.length; j += STOCK_STRIDE) {
        assert.ok(g.instances[j + 4] > 0.03 && g.instances[j + 5] > 0.03 && g.instances[j + 6] > 0.025);
      }
    }
  assert.deepEqual(new Set(inventory.keys()), new Set(MARKET_GOODS));
  assert.deepEqual(facings, new Set([true, false]));
  assert.ok([...inventory.values()].reduce((a, b) => a + b, 0) > 10000);
  for (const name of MARKET_GOODS)
    for (const detail of [true, false]) {
      const { vertices, indices } = marketProductModel(name, detail);
      assert.ok(indices.length >= 36 && indices.length % 3 === 0, name);
      assert.ok(
        indices.every((i) => i < vertices.length / 10),
        name
      );
      for (let axis = 0; axis < 3; axis++) {
        const coordinates = [],
          normals = [];
        for (let i = 0; i < vertices.length; i += 10) {
          coordinates.push(vertices[i + axis]);
          normals.push(vertices[i + 3 + axis]);
        }
        assert.ok(Math.max(...coordinates) - Math.min(...coordinates) > 0.2, name + " depth along " + axis);
        assert.ok(Math.min(...normals) < -0.3 && Math.max(...normals) > 0.3, name + " sides along " + axis);
      }
    }
});

test("the sign letters keep their relief in both light settings", () => {
  function lettering(id, dark) {
    return buildMesh([store.find((f) => f.id === id)], { groundAt, dark, pal: dark ? PALETTES.dark : PALETTES.light });
  }
  const day = lettering("ts-logo", false),
    night = lettering("ts-logo", true);
  assert.equal(day.floors.count, 0);
  assert.ok(day.count > 800);
  assert.deepEqual(day.pos, night.pos);
  assert.notDeepEqual(day.col, night.col);
  assert.deepEqual(lettering("ts-sign-small", false).col, lettering("ts-sign-small", true).col);
});

test("the glazed serving hatch has a deep workroom behind the public counter", () => {
  const here = worldOf(xy([59.12, 11.63])),
    next = worldOf(xy([60.12, 11.63]));
  const hit = raycastMesh(mesh, { o: [...here, z + 1.82], d: [next[0] - here[0], next[1] - here[1], 0] }, [""]);
  assert.ok(hit && hit.t > 1.5 && hit.t < 3.6, "workroom depth " + hit?.t);
  assert.ok(world.blocked(...xy([59.54, 11.63]), z + 0.03));
  assert.ok(floor.items.some((i) => i.style === "prep"));
  assert.ok(floor.items.every((i) => !i.print));
});

test("twelve double-sided grocery rows open onto a continuous cross aisle, with two produce rows and checkout shelving", () => {
  assert.equal(nearRuns.length, 12);
  assert.equal(farRuns.length, 12);
  for (let i = 0; i < nearRuns.length; i++) {
    const near = nearRuns[i],
      far = farRuns[i];
    assert.ok(Math.abs(near.u0 - far.u0) < 0.03 && Math.abs(near.u1 - far.u1) < 0.03);
    assert.ok(far.v0 - near.v1 > 1.4);
    if (i > 0) assert.ok(near.u0 - nearRuns[i - 1].u1 > 1.15 && near.u0 - nearRuns[i - 1].u1 < 1.48);
  }
  const produce = floor.items.filter((it) => it.style === "produce").map(fixtureBounds);
  assert.equal(produce.filter((r) => r.v0 < 6).length, 8);
  assert.equal(produce.filter((r) => r.v0 > 6).length, 4);
  assert.equal(floor.items.filter((it) => it.style === "lowShelf").length, 5);
  assert.equal(floor.items.filter((it) => it.style === "island").length, 15);
});

test("the forecourt, two produce rows, every grocery aisle, the fresh counters and both checkout rows connect in both directions", () => {
  const routes = [
    [
      [-25, 2.5],
      [-4, 3.35],
      [4.8, 3.35],
      [5.13, 2.5],
      [7.0, 2.25],
      [24.0, 2.06],
      [42, 2.08],
      [53.5, 2.08],
      [57.62, 2.37],
      [57.62, 11.48],
      [53.11, 11.48],
      [53.12, 14.78],
      [48.9, 14.84],
      [28.4, 14.83],
      [19.72, 14.51],
      [19.65, 12.36],
      [5.33, 12.4],
      [5.16, 9.05],
      [2.04, 8.01],
      [2.02, 5.48],
      [1.45, 3.45],
      [-4, 3.38]
    ],
    [
      [4.85, 2.37],
      [10.08, 2.37],
      [10.08, 8.85],
      [14.76, 8.85],
      [14.76, 2.35],
      [19.35, 2.35],
      [19.35, 6.04],
      [6.0, 6.04],
      [5.25, 6.04]
    ],
    [
      [24.39, 9.02],
      [36.16, 9.02],
      [48.95, 9.02]
    ],
    [
      [25.6, 14.54],
      [19.71, 14.52],
      [19.61, 12.47],
      [17.96, 12.38],
      [17.96, 13.24],
      [15.98, 12.63],
      [6.95, 12.41],
      [5.42, 12.4],
      [5.2, 8.65],
      [2.04, 8.02],
      [1.94, 5.57],
      [1.42, 3.45],
      [-3, 3.4]
    ],
    [
      [22.28, 14.58],
      [22.22, 11.5],
      [22.2, 10.38]
    ],
    [
      [49.12, 14.78],
      [53.13, 14.78],
      [57.53, 14.74],
      [57.53, 11.48],
      [57.53, 7.74],
      [53.24, 7.74],
      [49.1, 7.53],
      [49.08, 2.07]
    ]
  ];
  for (let i = 1; i < nearRuns.length; i++) {
    const u = (nearRuns[i - 1].u1 + nearRuns[i].u0) / 2;
    routes.push([
      [u, 2.08],
      [u, 9.02],
      [u, 14.85]
    ]);
  }
  for (const route of routes) {
    walk(route);
    walk([...route].reverse());
  }

  const self = floor.items.filter((it) => it.style === "selfCheckout");
  assert.equal(self.length, 14);
  assert.equal(floor.items.filter((it) => it.style === "payment").length, 3);
  for (const it of self) {
    const [a, b, , d] = it.coords.map(toXY);
    const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    assert.ok(world.blocked(mid[0] + (d[0] - a[0]) * 0.5, mid[1] + (d[1] - a[1]) * 0.5, z + 0.02));
    assert.ok(!world.blocked(mid[0] - (d[0] - a[0]) * 0.85, mid[1] - (d[1] - a[1]) * 0.85, z + 0.02));
  }
  for (const p of [
    [7.0, 4.1],
    [35.2, 8.0],
    [35.5, 16.4],
    [59.0, 5.0]
  ]) {
    assert.ok(world.blocked(...xy(p), z + 0.02), "walkable fixture at " + p);
  }
});
