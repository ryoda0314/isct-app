import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test, { after, mock } from "node:test";
import clip from "polygon-clipping";
import { PALETTES } from "../campus-sns/campusBasemap.js";
import { raycastMesh } from "../campus-sns/campus3dDebug.js";
import { doorLeaves, stepDoors } from "../campus-sns/campus3dDoors.js";
import { burnsGround, detailView, parseFeatures, toXY } from "../campus-sns/campus3dFeatures.js";
import { dem } from "../campus-sns/campusDem.js";
import { collectInteract, gateBlocked, laneDoors, pickInteract } from "../campus-sns/campus3dInteract.js";
import { STOCK_STRIDE } from "../campus-sns/campus3dMarketLayer.js";
import { buildMesh, worldOf } from "../campus-sns/campus3dMesh.js";
import { stationModel } from "../campus-sns/campus3dStationModels.js";
import { walkWorld } from "../campus-sns/campus3dWalk.js";

const data = JSON.parse(readFileSync(new URL("../public/map-3d/features.json", import.meta.url)));
const features = detailView(parseFeatures(data.features.filter((f) => f.id.startsWith("stn"))));
mock.method(dem, "baseAt", () => 33.4);
dem.setBurns(features.filter(burnsGround));
after(() => {
  dem.setBurns([]);
  mock.restoreAll();
});
const groundAt = (ll) => dem.groundAt(ll),
  mesh = buildMesh(features, { groundAt, clip, digs: dem.digs, pal: PALETTES.light });
const world = walkWorld({
  data: { buildings: [] },
  features,
  groundAt,
  surfaceAt: (ll) => dem.surfaceAt(ll),
  digs: dem.digs
});
const station = features.find((f) => f.id === "stn1fp-paid");
const [ox, oy] = toXY(station.groundRef),
  angle = (station.grid[0] * Math.PI) / 180,
  c = Math.cos(angle),
  s = Math.sin(angle);
const xy = ([u, v]) => [ox + u * c - v * s, oy + u * s + v * c];
const [upper, platform, passage] = ["stn1fp-paid", "stnb1-p12", "stnb1-xfer"].map(
  (id) => groundAt(station.groundRef) + features.find((f) => f.id === id).z
);

function walk(route, start, end) {
  let [x, y] = xy(route[0]),
    foot = world.floorBelow(x, y, start + 0.21);
  for (const pos of route.slice(1)) {
    const [qx, qy] = xy(pos),
      dx = qx - x,
      dy = qy - y,
      n = Math.ceil(Math.hypot(dx, dy) / 0.065);
    for (let j = 0; j < n; j++)
      ({ x, y, floor: foot } = world.move(x, y, foot.z, dx / n, dy / n, { deck: foot.deck }));
    assert.ok(
      Math.hypot(x - qx, y - qy) < 0.16,
      `stopped on way to ${pos} at ${[(x - ox) * c + (y - oy) * s, -(x - ox) * s + (y - oy) * c, foot.z].map((v) => v.toFixed(2))}`
    );
  }
  assert.ok(Math.abs(foot.z - end) < 0.19, `arrived at ${foot.z}, expected ${end}`);
}

test("the photographed bank has three ticket machines and a separate fourth IC charger, all reachable", () => {
  const floor = features.find((f) => f.id === "stn1fu-free");
  const units = floor.items.filter((it) => it.kind === "tvm");
  assert.deepEqual(
    units.map((it) => [it.machineNo, it.style]),
    [
      [1, "stationTicket"],
      [2, "stationTicket"],
      [3, "stationTicket"],
      [4, "stationCharge"]
    ]
  );
  const list = collectInteract(features, groundAt);
  for (const it of units) {
    const r = it.coords.map(toXY),
      front = r[0].map((v, i) => (v + r[1][i]) / 2);
    const d = [r[3][0] - r[0][0], r[3][1] - r[0][1]],
      l = Math.hypot(...d);
    const x = front[0] - (d[0] / l) * 0.75,
      y = front[1] - (d[1] / l) * 0.75;
    assert.equal(world.blocked(x, y, upper), false);
    const hit = pickInteract(list, [x, y, upper + 1.5], [(d[0] / l) * 0.93, (d[1] / l) * 0.93, -0.367]);
    assert.equal(hit?.kind, "tvm");
    assert.deepEqual(hit.target.r, r);
  }
});

test("the north building recess clears the ticket screens and the backlit route maps", () => {
  const surrounds = buildMesh(
    features.filter((f) => ["stn-north", "stn1fu-free"].includes(f.id)),
    {
      groundAt,
      clip,
      pal: PALETTES.light
    }
  );
  const g = groundAt(station.groundRef);
  for (const v of [5.42, 6.58, 7.74, 9.2]) {
    const eye = worldOf(xy([6.8, v]));
    for (const height of [1.38, 1.6, 2.16]) {
      const target = worldOf(xy([9.06, v]));
      const hit = raycastMesh(surrounds, {
        o: [...eye, g + 1.55],
        d: [target[0] - eye[0], target[1] - eye[1], height - 1.55]
      });
      assert.ok(!hit || hit.t >= 1, `blocked at fraction ${hit?.t} for v=${v}, h=${height}`);
    }
  }
});

test("the accessible central gate reads a card and its flaps release the through route", () => {
  const { lanes, machines } = collectInteract(features, groundAt);
  assert.equal(machines.filter((d) => d.kind === "tvm").length, 4);
  assert.equal(lanes.length, 8);
  const doors = laneDoors(lanes),
    op = doors.map(() => 0);
  const index = lanes.findIndex((l) => 2 * l.half > 1.3),
    l = lanes[index];
  assert.ok(l && Math.hypot(l.m[0] - xy([15.96, 0.675])[0], l.m[1] - xy([15.96, 0.675])[1]) < 0.1);
  assert.ok(gateBlocked(doors, op, ...l.m, l.zf));
  const closed = doorLeaves([doors[index]], [0]),
    opened = doorLeaves([doors[index]], [1]);
  assert.ok(closed.solid.count > 0 && !closed.glass.count);
  assert.notDeepEqual(closed.solid.pos, opened.solid.pos);
  doors[index].until = performance.now() + 4500;
  stepDoors(doors, op, { x: l.m[0], y: l.m[1], z: l.zf }, 1);
  assert.equal(op[index], 1);
  assert.equal(gateBlocked(doors, op, ...l.m, l.zf), false);
  world.setDyn((x, y, z) => gateBlocked(doors, op, x, y, z));
  try {
    walk(
      [
        [1, 0.675],
        [15.96, 0.675],
        [21, 0.675],
        [28, 0.675]
      ],
      upper,
      upper
    );
  } finally {
    world.setDyn(null);
  }
});

for (const [pair, v, entry, roomCenter] of [
  ["1/2", -10.73, -19.6, -12.45],
  ["3/4", 9.21, -23.6, 10.04]
]) {
  test(`walk from the hall down to platform ${pair} and through both ends of its waiting room`, () => {
    const path = [
      [28, 0.675],
      [28, v],
      [24.06, v],
      [9.46, v],
      [4.3, v],
      [1, v],
      [0, roomCenter],
      [entry + 1.5, roomCenter],
      [entry - 1, roomCenter],
      [entry - 8.1, roomCenter],
      [entry - 10.2, roomCenter]
    ];
    walk(path, upper, platform);
    walk([...path].reverse(), platform, upper);
    for (const x of [entry, entry - 9]) {
      const p = xy([x, roomCenter]);
      const idx = mesh.doors.findIndex(
        (d) =>
          Math.abs(d.z0 - platform) < 0.1 &&
          Math.hypot((d.a[0] + d.b[0]) / 2 - p[0], (d.a[1] + d.b[1]) / 2 - p[1]) < 0.15
      );
      assert.ok(idx >= 0);
      const open = mesh.doors.map(() => 0);
      stepDoors(mesh.doors, open, { x: p[0], y: p[1], z: platform }, 1);
      assert.equal(open[idx], 1);
    }
  });
}

test("the west passage connects the two island platforms over the tracks", () => {
  const left = [
    [-162.95, -3.63],
    [-164.12, -3.63],
    [-168.4, -3.63],
    [-169.65, -3.63],
    [-174.2, -3.63],
    [-175.75, -3.63]
  ];
  const right = [
    [-175.75, 7.52],
    [-174.18, 7.52],
    [-169.65, 7.52],
    [-168.4, 7.52],
    [-164.12, 7.52],
    [-162.95, 7.52]
  ];
  walk(left, platform, passage);
  walk([left.at(-1), ...right], passage, platform);
  walk([...right].reverse(), platform, passage);
  walk([...left].reverse(), passage, platform);
});

test("the four boarding edges, furniture and raised paving use solid indexed models", () => {
  const counts = new Map();
  for (const chunk of mesh.marketStock.chunks)
    for (const g of chunk.groups) {
      assert.ok(g.instances.every(Number.isFinite), g.model);
      counts.set(g.model, (counts.get(g.model) || 0) + g.instances.length / STOCK_STRIDE);
    }
  for (const [name, min] of Object.entries({
    gate: 10,
    ticket: 3,
    charge: 1,
    ticketPanel: 4,
    ticketNotices: 1,
    ticketDisplays: 1,
    fare: 3,
    seat: 70,
    waitingSeat: 20,
    waitingSign: 4,
    tile: 1000,
    column: 35,
    ribs: 1000,
    dots: 400,
    threshold: 400,
    pocket: 64,
    arrow: 30,
    frost: 40
  })) {
    assert.ok(counts.get("station/" + name) >= min, name + " count " + counts.get("station/" + name));
  }
  for (const key of counts.keys())
    for (const lod of [false, true]) {
      const { vertices, indices } = stationModel(key, lod);
      assert.ok(
        indices.length >= 3 && vertices.every(Number.isFinite) && indices.every((i) => i < vertices.length / 10),
        key
      );
    }
  const edges = new Map();
  for (const pair of mesh.psd) edges.set(pair.track, (edges.get(pair.track) || 0) + 1);
  assert.deepEqual([...edges.entries()].sort(), [
    ["stntrk-1", 32],
    ["stntrk-2", 29],
    ["stntrk-3", 29],
    ["stntrk-4", 32]
  ]);
});
