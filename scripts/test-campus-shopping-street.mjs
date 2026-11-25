import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import clip from "polygon-clipping";
import { PALETTES } from "../campus-sns/campusBasemap.js";
import { raycastMesh } from "../campus-sns/campus3dDebug.js";
import { parseFeatures, toLngLat, toXY } from "../campus-sns/campus3dFeatures.js";
import { buildMesh, worldOf } from "../campus-sns/campus3dMesh.js";
import { STOCK_STRIDE } from "../campus-sns/campus3dMarketLayer.js";
import { shoppingStreetSupports, streetRoute } from "../campus-sns/campus3dShoppingStreet.js";
import { STREET_SHOPS } from "../campus-sns/campus3dStreetCatalog.js";
import { shopLayout, streetFrame } from "../campus-sns/campus3dStreetLayout.js";
import { streetModel } from "../campus-sns/campus3dStreetModels.js";
import {
  STREET_VIEWS,
  linkedStreetView,
  streetViewEye,
  streetViewSpawn
} from "../campus-sns/campus3dStreetViews.js";
import { walkWorld } from "../campus-sns/campus3dWalk.js";

const raw = JSON.parse(readFileSync(new URL("../public/map-3d/features.json", import.meta.url)));
const features = parseFeatures(raw.features.filter((f) => f.id.startsWith("kitaguchi-")));
const shops = new Map(
  features.flatMap((f) => (f.shopfronts || []).filter((s) => !s.returnWall).map((s) => [s.shop, { f, s }]))
);
const street = features.find((f) => f.shoppingStreet);
const route = streetRoute(street.coords);
const groundAt = (ll) => 33 + (ll[1] - street.coords[0][1]) * 830;
const world = walkWorld({ data: { buildings: [] }, features, groundAt });

function walk(points) {
  let [x, y] = points[0],
    floor = world.floorBelow(x, y, 34 + groundAt(street.coords[0]));
  for (const [X, Y] of points.slice(1)) {
    const dx = X - x,
      dy = Y - y,
      n = Math.max(1, Math.ceil(Math.hypot(dx, dy) / 0.075));
    for (let i = 0; i < n; i++)
      ({ x, y, floor } = world.move(x, y, floor.z, dx / n, dy / n, { deck: floor.deck }));
    assert.ok(Math.hypot(x - X, y - Y) < 0.14, `blocked at ${x},${y} before ${X},${Y}`);
  }
}

test("the filmed frontages occupy the correct sides and order from the square to the north junction", () => {
  assert.ok(route.length > 235 && route.length < 241);
  assert.equal(shops.size, STREET_SHOPS.size);
  for (const [side, order] of [
    [-1, ["cocopharmacy", "megane", "kaldi", "kohikan", "daikichi", "coco", "cando", "familynorth"]],
    [1, ["familysouth", "hidakaya", "sundrug", "matsusaka", "ohsho", "cocoichi", "sakano", "iroha"]]
  ]) {
    let last = -Infinity;
    for (const key of order) {
      const { s } = shops.get(key),
        frame = streetFrame(s, toXY),
        p = frame.point(0, 0);
      const samples = Array.from({ length: 239 }, (_, i) => route.at(i).p);
      const i = samples.reduce(
        (best, q, j) =>
          Math.hypot(q[0] - p[0], q[1] - p[1]) < Math.hypot(samples[best][0] - p[0], samples[best][1] - p[1])
            ? j
            : best,
        0
      );
      assert.ok(i > last, key);
      last = i;
      assert.equal(Math.sign(p[0] - samples[i][0]), side, key);
    }
  }
  assert.ok(shops.get("familysouth").f.shopfronts.filter((f) => f.returnWall).length >= 2);
  assert.equal(features.find((f) => f.id === "kitaguchi-red-approach").kind, "red");
});

test("walk the whole street in both directions and enter the photographed stores between their window frames", () => {
  const line = Array.from({ length: 240 }, (_, i) => route.at((route.length * i) / 239).p);
  walk(line);
  walk([...line].reverse());
  for (const { post, model } of shoppingStreetSupports(route))
    assert.ok(world.blocked(...post, groundAt(toLngLat(post)) + 0.08), model);
  for (const id of ["kaldi", "cocoichi", "sundrug", "familynorth", "ohsho", "cando", "coco"]) {
    const { s, f } = shops.get(id),
      frame = streetFrame(s, toXY),
      layout = shopLayout(STREET_SHOPS.get(id), frame.width);
    const path = [-0.95, -0.1, 0.39, 1.0, 1.5].map((y) => frame.point(layout.entry, y));
    walk(path);
    walk([...path].reverse());
    const shelf = layout.fixtures.find((x) => x.kind === "shelf" || x.kind === "counter");
    assert.ok(
      world.blocked(...frame.point(shelf.x, shelf.y), groundAt(f.groundRef) + 0.1),
      id + " displays have volume"
    );
  }
});

test("each recorded viewpoint opens on walkable ground with the measured portrait lens and optical axis", () => {
  assert.equal(STREET_VIEWS.length, 8);
  assert.equal(linkedStreetView("?streetView=missing"), undefined);
  assert.equal(streetViewSpawn(STREET_VIEWS[0], []), null);
  for (const v of STREET_VIEWS) {
    assert.equal(linkedStreetView("?streetView=" + v.id), v);
    const p = streetViewSpawn(v, features),
      lot = shops.get(v.shop);
    const frame = streetFrame(lot.s, toXY),
      xy = frame.point(v.x, v.y);
    assert.ok(Math.hypot(p.x - xy[0], p.y - xy[1]) < 0.002, v.id);
    const z = world.pavedHeight(p.x, p.y) ?? groundAt(toLngLat(xy));
    assert.equal(world.blocked(p.x, p.y, z), false, v.id);
    assert.ok(Math.abs(z + streetViewEye(p, z, groundAt, 1.62) - groundAt(p.datum) - v.eye) < 0.01, v.id);
    assert.equal(
      streetViewEye(p, z, () => NaN, 1.62),
      1.62
    );
    assert.ok(p.fov > 97.4 && p.fov < 98.2);
    assert.equal(p.roll, -v.roll);
  }
  assert.ok(shops.get("familynorth").f.carves.some((cv) => cv.bottom === 0 && cv.top > 7.44));
});

test("solid goods, three-dimensional lettering, overhead wires and both entrance signs reach the draw layer", () => {
  const mesh = buildMesh(features, { groundAt, clip, pal: PALETTES.light });
  const counts = new Map(),
    models = new Set();
  for (const chunk of mesh.marketStock.chunks)
    for (const g of chunk.groups) {
      assert.ok(g.instances.every(Number.isFinite), g.model);
      const prefix = g.model.split("/").slice(0, 2).join("/");
      counts.set(prefix, (counts.get(prefix) || 0) + g.instances.length / STOCK_STRIDE);
      if (g.model.startsWith("street/")) models.add(g.model);
    }
  assert.equal(counts.get("street/shop"), shops.size);
  assert.equal(counts.get("street/entrance"), 2);
  assert.ok(counts.get("street/paving") > 260);
  assert.ok(models.has("street/prop/parking") && models.has("street/prop/conifer"));
  for (const [name, min] of [
    ["street/flank", 4],
    ["street/wire", 35],
    ["street/paver", 3000],
    ["street/goods", 350],
    ["teaBox", 100]
  ])
    assert.ok(counts.get(name) >= min, name);
  for (const name of models)
    for (const detail of [false, true]) {
      const { vertices, indices } = streetModel(name, detail);
      assert.ok(
        vertices.length &&
          vertices.every(Number.isFinite) &&
          indices.length &&
          indices.every((i) => i < vertices.length / 10),
        name
      );
    }
});

test("storefronts and moving doors have single-sheet glazing after their opaque frames at both distances", () => {
  const { f, s } = shops.get("cocoichi");
  const width = Math.round(streetFrame(s, toXY).width * 100);
  for (const key of [`street/shop/cocoichi/${width}/${Math.round(f.height * 100)}`, "street/leaf/family", "street/leaf/curry"])
    for (const detail of [true, false]) {
      const { vertices, indices, opaqueCount } = streetModel(key, detail);
      const material = (i) => vertices[i * 10 + 9];
      assert.ok(opaqueCount > 0 && opaqueCount < indices.length);
      assert.ok(indices.subarray(0, opaqueCount).every((i) => material(i) !== 14 && material(i) !== 3));
      const panes = indices.subarray(opaqueCount);
      assert.equal(panes.length % 6, 0);
      assert.ok(panes.every((i) => material(i) === 14));
      for (let i = 0; i < panes.length; i += 6) {
        const quad = new Set(panes.subarray(i, i + 6));
        assert.equal(quad.size, 4);
        assert.equal(new Set([...quad].map((v) => vertices[v * 10 + 1])).size, 1);
      }
    }
});

test("the BASANTA upstairs display is visible through its host wall above the street-level opening", () => {
  const { f, s } = shops.get("basanta");
  const frame = streetFrame(s, toXY);
  const key = `street/shop/basanta/${Math.round(frame.width * 100)}/${Math.round(f.height * 100)}`;
  for (const detail of [false, true]) {
    const { vertices, indices, opaqueCount } = streetModel(key, detail);
    const panes = indices.subarray(opaqueCount);
    assert.equal(panes.length, 12, "two upstairs windowpanes");
    assert.ok(panes.every(i => vertices[i * 10 + 9] === 16));
  }
  const mesh = buildMesh([f], { groundAt: () => 0, clip, pal: PALETTES.light });
  function facadeHit(x, z) {
    const outside = worldOf(frame.point(x, -0.3));
    const inside = worldOf(frame.point(x, 0.7));
    const d = [inside[0] - outside[0], inside[1] - outside[1], 0];
    return raycastMesh(mesh, { o: [...outside, z], d }, ["", "cull"])?.t ?? Infinity;
  }
  for (const x of [-0.83, 0.18]) {
    assert.ok(facadeHit(x, 3.35) < 0.35, "solid wall between floors");
    assert.ok(facadeHit(x, 3.84) > 0.95, "line of sight to the display shelf");
    assert.ok(facadeHit(x, 4.45) > 0.95, "line of sight through the upper glass");
    assert.ok(facadeHit(x, 4.89) < 0.35, "solid lintel");
  }
});
