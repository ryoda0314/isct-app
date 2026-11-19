import assert from "node:assert/strict";
import test from "node:test";
import { raycastMesh } from "../campus-sns/campus3dDebug.js";
import { parseFeatures, toLngLat } from "../campus-sns/campus3dFeatures.js";
import { buildMesh, setMeshPacking, worldOf } from "../campus-sns/campus3dMesh.js";
import { menuUV, TSUBAME_ATLAS, tsubameMenuLayout } from "../campus-sns/campus3dTsubameMenu.js";

const rect = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]].map(toLngLat);
const floor = {
  type: "floor", id: "hall", coords: rect(0, 0, 10, 10), z: 2, slab: 0.25, height: 3, finish: "checker",
  holes: [{ coords: rect(3, 2, 11, 4) }, { coords: rect(4, 3, 5, 8) }],
  rooms: [
    { coords: rect(-1, 1, 8, 6), finish: "oak" },
    { coords: rect(1, 1, 2, 6), finish: "tactile" },
    { coords: rect(6, 2, 7, 4), finish: "herring", over: true },
  ],
};
const ctx = { groundAt: () => 0, pal: { ground: "#dddddd" } };
const hit = (mesh, x, y, z = 8, dz = -10) => raycastMesh(mesh, { o: [...worldOf([x, y]), z], d: [0, 0, dz] });
function finishAt(mesh, x, y) {
  const h = hit(mesh, x, y);
  if (h?.pass !== "floors") return h?.pass;
  return mesh.floors.batches.find((b) => h.tri * 3 >= b.first && h.tri * 3 < b.first + b.count)?.finish;
}

test("floor, underside and ceiling preserve crossing cutouts, room priority and marked landings", () => {
  const mesh = buildMesh([floor], ctx);
  assert.equal(finishAt(mesh, 9, 9), "checker");
  assert.equal(finishAt(mesh, 2.6, 1.6), "oak");
  assert.equal(finishAt(mesh, 1.5, 1.6), ""); // tactile strip is an opaque solid colour
  assert.equal(finishAt(mesh, 6.5, 2.7), "herring"); // intentional terrace inside an opening
  for (const [x, y] of [[4.5, 3.5], [4.5, 6.8], [9.2, 3.3], [-0.5, 2.5]]) {
    assert.equal(hit(mesh, x, y), null);
    assert.equal(hit(mesh, x, y, 0, 10), null);
  }
  const ceiling = buildMesh([{ ...floor, ceiling: { kind: "plain", z: 2.5, holes: [{ coords: rect(2, 5, 7, 6) }] } }], ctx);
  assert.equal(hit(ceiling, 4.5, 5.5), null);
  assert.ok(hit(ceiling, 8.6, 8.7).normal[2] < 0);
});

test("tile density changes UVs without adding faces, including packed, highlighted floors", () => {
  const simple = { ...floor, holes: [], rooms: [], grid: [30, 0.6] };
  const wide = buildMesh([simple], ctx).floors;
  setMeshPacking(true);
  try {
    const tight = buildMesh([{ ...simple, grid: [30, 0.3] }], { ...ctx, selectedId: simple.id }).floors;
    assert.equal(tight.count, 6);
    assert.deepEqual(tight.pos, wide.pos);
    assert.deepEqual(tight.uv, wide.uv.map((v) => v * 2));
    assert.ok(tight.col instanceof Uint8Array);
    assert.equal(tight.col[3], Math.round(0.45 * 255));
  } finally {
    setMeshPacking(false);
  }
});

test("terrace boards follow the ramp and a full notice stays upright", () => {
  const ramp = { type: "building", id: "ramp", coords: rect(0, 0, 2, 5), roof: "deck", deckGrid: [90, 0.14],
    height: 2.5, base: 1.8, cuts: [{ slope: [[1, 0], [1, 5]].map(toLngLat), low: 2 }] };
  const sign = { type: "sign", id: "menu", coords: [toLngLat([8, 0])], width: 2, height: 1, z: 1, bearing: 0,
    legs: 0, thickness: 0.04, style: "white", print: "tsubameNotice" };
  const mesh = buildMesh(parseFeatures({ features: [ramp, sign] }), ctx);
  for (const y of [0.5, 2.5, 4.5]) {
    assert.equal(finishAt(mesh, 1, y), "deckwood");
    const roofZ = 8 - 10 * hit(mesh, 1, y).t;
    assert.ok(Math.abs(roofZ - (2 + y / 10)) < 0.005);
  }
  const terrace = buildMesh(parseFeatures({ features: [
    { ...floor, rooms: [{ coords: floor.coords, finish: "terraceBoards", grid: [90, 0.14] }], holes: [] },
    { ...ramp, deckFinish: "terraceGrooves", deckGrid: [0, 0.08] },
  ] }), ctx);
  assert.equal(finishAt(terrace, 4, 3), "terraceBoards");
  assert.equal(finishAt(terrace, 1, 3), "terraceGrooves");
  assert.ok(Math.abs(8 - 10 * hit(terrace, 1, 3).t - 2.3) < 0.005);
  const print = mesh.floors.batches.find(b => b.finish === "tsubameNotice");
  assert.equal(print.count, 6);
  const z = i => mesh.floors.pos[3 * (print.first + i) + 2];
  const v = i => mesh.floors.uv[2 * (print.first + i) + 1];
  assert.ok(z(2) > z(0) && v(2) === 0 && v(0) === 1);
});

test("the cafeteria displays mount individual upright cards and reuse their artwork at the counters", () => {
  const boards = ["tsubameMenu", "tsubameDigital", "tsubameSetCards", "tsubameRiceCards"];
  const signs = boards.map((name, i) => ({ type: "sign", id: name, print: name, coords: [toLngLat([i * 4, 1])],
    width: 2.28, height: 1.1, z: 1, bearing: 0, legs: 0, style: "white" }));
  const mesh = buildMesh(parseFeatures({ features: signs }), ctx).floors;
  const layouts = boards.map(tsubameMenuLayout);
  assert.deepEqual(layouts[0].filter(s => Number.isInteger(s.id)).map(s => s.id), Array.from({ length: 25 }, (_, i) => i));
  assert.ok(layouts[2].some(s => s.id === 0) && layouts[3].some(s => s.id === 8));
  assert.deepEqual(layouts[1].map(s => s.id), ["weekly"]);
  const sheets = layouts.flat();
  assert.deepEqual(mesh.batches, [{ finish: TSUBAME_ATLAS, first: 0, count: sheets.length * 6 }]);
  for (const [i, slip] of sheets.entries()) {
    const [u0, v0, u1, v1] = menuUV(slip.id);
    assert.ok(u0 > 0 && v0 > 0 && u0 < u1 && v0 < v1 && u1 < 1 && v1 < 1);
    assert.deepEqual([...mesh.uv.slice(i * 12, i * 12 + 12)], [u0, v1, u1, v1, u1, v0, u0, v1, u1, v0, u0, v0]);
    assert.ok(mesh.pos[i * 18 + 8] > mesh.pos[i * 18 + 2]);
  }
});
