import assert from "node:assert/strict";
import test from "node:test";
import { raycastMesh } from "../campus-sns/campus3dDebug.js";
import { toLngLat } from "../campus-sns/campus3dFeatures.js";
import { buildMesh, worldOf } from "../campus-sns/campus3dMesh.js";

test("open shelf top follows both mitered ends of its footprint", () => {
  const floor = {
    id: "shelf-test", type: "floor", z: 0, slab: 0.15, height: 3, finish: "white",
    coords: [[-2, -1], [4, -1], [4, 2], [-2, 2]].map(toLngLat),
    items: [{
      kind: "openshelf", z0: 0, z1: 1, rows: 2, cols: 4,
      coords: [[0, 0], [2, 0], [2.25, 0.5], [0.25, 0.5]].map(toLngLat),
    }],
  };
  const mesh = buildMesh([floor], { groundAt: () => 0, pal: { ground: "#ffffff" } });
  const onTop = (x, y) => {
    const hit = raycastMesh(mesh, { o: [...worldOf([x, y]), 1.1], d: [0, 0, -0.2] });
    return hit != null && Math.abs(hit.t - 0.5) < 0.001;
  };
  assert.equal(onTop(0.08, 0.4), false);
  assert.equal(onTop(0.26, 0.4), true);
  assert.equal(onTop(2.15, 0.4), true);
  assert.equal(onTop(2.26, 0.4), false);
});
