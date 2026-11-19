import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  distToRing,
  normalizeFeature,
  pointInRing,
  roofBoards,
  toLngLat,
  toXY,
} from "../campus-sns/campus3dFeatures.js";
import { worldOf } from "../campus-sns/campus3dMesh.js";
import { buildVeg, visiblePlantRanges } from "../campus-sns/campus3dVeg.js";
import { CHERRY_SHOOT_BOUNDS, shootGeometry } from "../campus-sns/campus3dShoots.js";

const campus = JSON.parse(readFileSync(new URL("../public/map-3d/features.json", import.meta.url))).features;
const flat = () => 34;
const groundXY = ([x, y]) => [x / worldOf([1, 0])[0], y / worldOf([0, 1])[1]];

test("the cherry retains its winter framework, attached shoots, and independent fallen pieces", () => {
  const tree = normalizeFeature(campus.find((f) => f.id === "deck-cherry-e1"));
  const sapling = normalizeFeature(campus.find((f) => f.id === "deck-young-1"));
  assert.equal(sapling.staked, true);
  const { solid, shoots } = buildVeg([tree], flat, { selectedId: tree.id });
  const bytes = new Uint8Array(solid.buf),
    floats = new Float32Array(solid.buf);
  let trunkTop = 0,
    branchTop = 0;
  for (let i = 0; i < solid.count; i++) {
    const o = i * 28,
      role = bytes[o + 20],
      z = floats[i * 7 + 2] - 34;
    assert.equal(bytes[o + 27], 255);
    if (role === 0) trunkTop = Math.max(trunkTop, z);
    else {
      assert.equal(role, 1);
      branchTop = Math.max(branchTop, z);
    }
  }
  assert.ok(trunkTop >= tree.forkHeight && trunkTop < tree.height * 0.35);
  assert.ok(branchTop > tree.height * 0.86);
  assert.ok(shoots.groups.every((g) => g.selected));
  assert.deepEqual(
    new Set(shoots.groups.map((g) => g.effect)),
    new Set(["crown", "cover", "litter", "drift", "petals", "driftingPetals"]),
  );
  const crown = shoots.groups.find((g) => g.effect === "crown");
  assert.equal(crown.kind, "cherry");
  assert.ok(crown.blocks.length > 1 && crown.blocks.reduce((n, b) => n + b.count, 0) === crown.count);
  let cursor = crown.start;
  for (const block of crown.blocks) {
    assert.equal(block.start, cursor);
    cursor += block.count;
  }
  const again = buildVeg([tree], flat, { selectedId: tree.id });
  assert.deepEqual(again.solid.buf, solid.buf);
  assert.deepEqual(again.shoots.buf, shoots.buf);
  const plain = { ...sapling, staked: false };
  assert.ok(buildVeg([sapling], flat).solid.count > buildVeg([plain], flat).solid.count);
});

// Every separate petal, blade and twig must enclose volume. Even a double-sided
// coplanar card with normals and valid indices cannot pass this check.
function closedOrgans(mesh, label) {
  const { vertices: v, indices } = mesh,
    n = v.length / 12,
    parent = Array.from({ length: n }, (_, i) => i);
  const root = (i) => {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]];
      i = parent[i];
    }
    return i;
  };
  const edges = new Map();
  assert.equal(mesh.joints.length, n * 4);
  assert.ok(mesh.joints.every(Number.isFinite));
  assert.equal(indices.length, mesh.wood + mesh.leaves + mesh.flowers);
  for (let i = 0; i < n; i++) {
    const at = i * 12;
    assert.ok(v.subarray(at, at + 12).every(Number.isFinite), label);
    assert.ok(Math.abs(Math.hypot(...v.subarray(at + 3, at + 6)) - 1) < 1e-5, label + " normal " + i);
  }
  for (let i = 0; i < indices.length; i += 3) {
    const [a, b, c] = indices.subarray(i, i + 3);
    assert.ok(a < n && b < n && c < n && a !== b && a !== c && b !== c, label);
    parent[root(b)] = root(a);
    parent[root(c)] = root(a);
    for (const [p, q] of [
      [a, b],
      [b, c],
      [c, a],
    ]) {
      const key = Math.min(p, q) * n + Math.max(p, q);
      const edge = edges.get(key) || [0, 0];
      edge[0]++;
      edge[1] += p < q ? 1 : -1;
      edges.set(key, edge);
    }
  }
  for (const [uses, balance] of edges.values())
    assert.ok(uses === 2 && balance === 0, label + " open or miswound edge");
  const volumes = new Map();
  for (let i = 0; i < indices.length; i += 3) {
    const [a, b, c] = indices.subarray(i, i + 3),
      r = root(a),
      o = r * 12;
    const delta = (k) => [v[k * 12] - v[o], v[k * 12 + 1] - v[o + 1], v[k * 12 + 2] - v[o + 2]];
    const [x, y, z] = delta(a),
      [u, w, t] = delta(b),
      [j, k, l] = delta(c);
    volumes.set(r, (volumes.get(r) || 0) + x * (w * l - t * k) + y * (t * j - u * l) + z * (u * k - w * j));
  }
  const counts = new Map();
  for (const [i, volume] of volumes) {
    const material = v[i * 12 + 6];
    assert.ok(
      volume > 1e-12,
      label + " has an inward or flat organ of material " + material + " (volume " + volume + ")",
    );
    counts.set(material, (counts.get(material) || 0) + 1);
  }
  return counts;
}

test("branches, blades, folded fans, and individual petals are closed indexed 3D meshes at every distance", () => {
  for (const kind of [
    "cherry",
    "ginkgo",
    "zelkova",
    "evergreen",
    "cedar",
    "palm",
    "shrub",
    "fallenLeaf",
    "fallenFan",
    "fallenPetal",
    "nut",
  ]) {
    const pieces = kind.startsWith("fallen") || kind === "nut";
    for (let detail = 0; detail < (pieces ? 1 : kind === "cherry" ? 4 : 3); detail++) {
      const mesh = shootGeometry(kind, detail),
        parts = closedOrgans(mesh, kind + "/" + detail);
      assert.ok(mesh.leaves > 0);
      if (kind === "cherry" && detail === 3) {
        assert.equal(parts.get(2), 5 * parts.get(4), "five separate petals per flower stalk");
        assert.ok(parts.get(3) > parts.get(4), "each open flower has stamens");
        assert.ok(parts.get(1) > 20 && mesh.wood > 0 && mesh.flowers > 0);
        const clusters = new Map(),
          v = mesh.vertices;
        for (let i = 0; i < v.length; i += 12) {
          if (v[i + 6] !== 2) continue;
          const pivot = mesh.joints.subarray(i / 3, i / 3 + 4);
          assert.ok(pivot[3] > 0);
          const points = clusters.get(v[i + 8]) || [];
          // A large scaffold scales the position of the flower, not its diameter.
          points.push([0, 1, 2].map((k) => (v[i + k] - pivot[k]) * pivot[3]));
          clusters.set(v[i + 8], points);
        }
        for (const points of clusters.values()) {
          let diameter = 0;
          for (const a of points)
            for (const b of points)
              diameter = Math.max(diameter, Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]));
          assert.ok(diameter > 0.03 && diameter < 0.05, "oversized cherry blossom");
        }
      }
      if (kind !== "cherry") assert.equal(mesh.flowers, 0);
    }
  }
});

test("full bloom has groups of flowers along the wood and across the distant crown", () => {
  let closeNodes;
  for (let detail = 0; detail <= 3; detail++) {
    const mesh = shootGeometry("cherry", detail),
      v = mesh.vertices;
    const spurs = new Map(),
      extent = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
    for (let i = 0; i < v.length; i += 12) {
      const joint = mesh.joints.subarray(i / 3, i / 3 + 3);
      for (const p of [v.subarray(i, i + 3), joint]) {
        const { x, z, radius } = CHERRY_SHOOT_BOUNDS;
        assert.ok(Math.hypot(p[0] - x, p[1], p[2] - z) <= radius, "a visible shoot could be culled");
      }
      if (v[i + 6] !== 2) continue;
      const key = joint.join(",");
      if (!spurs.has(key)) spurs.set(key, new Set());
      spurs.get(key).add(v[i + 8]);
      for (let k = 0; k < 3; k++) {
        extent[k] = Math.min(extent[k], v[i + k]);
        extent[k + 3] = Math.max(extent[k + 3], v[i + k]);
      }
    }
    if (detail === 0) {
      assert.ok(
        extent[3] - extent[0] > 0.95 && extent[4] - extent[1] > 0.8 && extent[5] - extent[2] > 0.44,
        "distant flowers must occupy the width and depth of the laterals",
      );
    } else if (detail >= 2) {
      assert.ok(spurs.size >= 40);
      for (const flowers of spurs.values()) assert.ok(flowers.size >= 4 && flowers.size <= 5);
      if (closeNodes) assert.deepEqual(spurs, closeNodes, "switching to separate petals moved a flower bud");
      closeNodes = spurs;
    }
  }
});

function visitShrubTips(shoots, visit) {
  const data = new Float32Array(shoots.buf),
    template = shootGeometry("shrub", 2).vertices;
  const points = [];
  for (let i = 0; i < template.length; i += 12) {
    if (template[i + 6] === 1 && template[i + 9] === 1) points.push(template.subarray(i, i + 3));
  }
  assert.ok(points.length && shoots.count);
  for (const g of shoots.groups) {
    assert.equal(g.kind, "shrub");
    for (let i = g.start; i < g.start + g.count; i++) {
      const o = i * 12,
        [x, y] = groundXY(data.subarray(o, o + 2)),
        z = data[o + 2];
      const [qx, qy, qz, qw] = data.subarray(o + 4, o + 8);
      // Transform the actual terminal vertices with the same quaternion as the renderer.
      for (const p of points) {
        const a = p[0] * data[o + 8],
          b = p[1] * data[o + 9],
          c = p[2] * data[o + 10];
        const tx = 2 * (qy * c - qz * b),
          ty = 2 * (qz * a - qx * c),
          tz = 2 * (qx * b - qy * a);
        visit(
          [x + a + qw * tx + qy * tz - qz * ty, y + b + qw * ty + qz * tx - qx * tz],
          z + c + qw * tz + qx * ty - qy * tx,
          i,
        );
      }
    }
  }
}

test("library shrubs follow the sloping bed, and rooftop foliage stays on recorded green boards", () => {
  const bed = normalizeFeature({
    id: "libx-shrub-test-slope",
    type: "surface",
    kind: "shrubs",
    coords: [
      [0, 0],
      [13, 0],
      [13, 4],
      [0, 4],
    ].map(toLngLat),
  });
  const slope = (ll) => 34 + toXY(ll)[0] * 0.28;
  const { solid, shoots } = buildVeg([bed], slope),
    vertices = new Float32Array(solid.buf);
  assert.ok(solid.count > 0);
  for (let i = 0; i < vertices.length; i += 7) {
    const [x, y] = groundXY(vertices.subarray(i, i + 2));
    assert.ok(x >= -0.01 && x <= 13.01 && y >= -0.01 && y <= 4.01, "ground planting crosses its path edge");
    const dz = vertices[i + 2] - (34 + x * 0.28);
    assert.ok(dz > -0.15 && dz < 1.2);
  }
  visitShrubTips(shoots, ([x, y], z) => {
    assert.ok(x >= -0.01 && x <= 13.01 && y >= -0.01 && y <= 4.01, "a shoot extends over the path");
    assert.ok(z - 34 - x * 0.28 > 0 && z - 34 - x * 0.28 < 1.36, "the shoot follows the sloping canopy");
  });
  const roof = normalizeFeature(campus.find((f) => f.boards?.some((b) => b.kind === "green")));
  const panels = roofBoards(roof).list.filter((b) => b.kind === "green");
  const { solid: plants, shoots: roofShoots } = buildVeg([roof], flat),
    v = new Float32Array(plants.buf);
  const covered = new Set();
  for (let i = 0; i < v.length; i += 7) {
    const p = groundXY(v.subarray(i, i + 2));
    const panel = panels.find((b) => {
      const above = v[i + 2] - 34 - b.zAt(p);
      return above >= -0.007 && above < 0.7 && (pointInRing(...p, b.ring) || distToRing(...p, b.ring) < 0.004);
    });
    assert.ok(panel, "a rooftop leaf crosses onto a timber step or hangs below the roof");
    covered.add(panel);
  }
  assert.equal(covered.size, panels.length);
  const data = new Float32Array(roofShoots.buf);
  const underShoot = new Map();
  visitShrubTips(roofShoots, (p, z, i) => {
    if (!underShoot.has(i)) {
      const origin = groundXY(data.subarray(i * 12, i * 12 + 2));
      underShoot.set(
        i,
        panels.filter((b) => pointInRing(...origin, b.ring)),
      );
    }
    assert.ok(
      underShoot.get(i).some((panel) => {
        const above = z - 34 - panel.zAt(p);
        return (
          above >= -0.007 && above < 0.7 && (pointInRing(...p, panel.ring) || distToRing(...p, panel.ring) < 0.004)
        );
      }),
      "a shoot leaves its planted roof step",
    );
  });
});

test("visibility includes the part of an offscreen tree that reaches into view or bends in the wind", () => {
  const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  const bounds = [
    [-2, -0.2, 0, -0.9, 0.6, 1],
    [0, 0, 0, 1, 1, 1],
    [1.1, 0, 0, 2, 1, 1],
    [4, 0, 0, 6, 1, 1],
  ];
  const cells = bounds.map((b, i) => ({ start: i * 6, count: 6, bounds: b }));
  assert.deepEqual(visiblePlantRanges(identity, cells, 0), [{ start: 0, count: 12 }]);
  assert.deepEqual(visiblePlantRanges(identity, cells, 0.2), [{ start: 0, count: 18 }]);
});

test("the West 5 ramp produces stems and flower heads in both parts of the documented goldenrod bed", () => {
  for (const id of ["w5r-bed", "w5r-bed-hedge"]) {
    const f = normalizeFeature(campus.find((f) => f.id === id));
    const { buf } = buildVeg([f], flat).solid,
      data = new Uint8Array(buf),
      roles = new Set();
    for (let o = 20; o < data.length; o += 28) roles.add(data[o]);
    assert.deepEqual([...roles].sort(), [5, 6]);
  }
});
