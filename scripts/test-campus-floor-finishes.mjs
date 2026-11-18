import assert from "node:assert/strict";
import test from "node:test";
import { raycastMesh } from "../campus-sns/campus3dDebug.js";
import { toLngLat } from "../campus-sns/campus3dFeatures.js";
import { buildMesh, setMeshPacking, worldOf } from "../campus-sns/campus3dMesh.js";

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
