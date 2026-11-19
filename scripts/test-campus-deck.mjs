import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import clip from "polygon-clipping";
import { burnsGround, normalizeFeature, prepareTerrace, stairsPath, toLngLat, toXY } from "../campus-sns/campus3dFeatures.js";
import { raycastMesh } from "../campus-sns/campus3dDebug.js";
import { buildMesh, worldOf } from "../campus-sns/campus3dMesh.js";
import { paintFeatures } from "../campus-sns/campus3dPaint.js";
import { deckUV } from "../campus-sns/campus3dPavingTiles.js";
import { walkWorld } from "../campus-sns/campus3dWalk.js";
import { dem } from "../campus-sns/campusDem.js";

const rect = (lo, hi) => [[lo, lo], [hi, lo], [hi, hi], [lo, hi]].map(toLngLat);
const boards = normalizeFeature({ id: "wood", type: "surface", coords: rect(-1.3, 9.3),
  kind: "wood", paving: "deckTimber", boards: [.12, 90] });

test("the raised lip carries the same plank course as the terrain", () => {
  const terrace = normalizeFeature({ id: "platform", type: "terrace", coords: rect(0, 8),
    elev: 1, side: 0, faces: Array.from({ length: 4 }, () => ({ deck: true })) });
  const groundAt = () => 0;
  const mesh = buildMesh([boards, terrace], { groundAt, terraces: [prepareTerrace(terrace, groundAt)] });
  const hit = raycastMesh(mesh, { o: [...worldOf([8.85, 4]), 3], d: [0, 0, -4] });
  assert.equal(hit?.pass, "floors");
  assert.equal(mesh.floors.batches[0].finish, boards.paving);
  assert.ok(Math.abs(3 - 4 * hit.t - .97) < .01);
  const uv = deckUV(boards.paving, boards.boards), origin = uv(toLngLat([0, 0]));
  assert.ok(Math.abs(uv(toLngLat([3.12, 0]))[0] - origin[0] - 1) < .01);
  assert.ok(Math.abs(origin[1] - uv(toLngLat([0, 1.44]))[1] - 1) < .01);
});

test("a tree well masks the boards and photo-textured boards emit no duplicate seams", () => {
  const ring = rect(2, 5);
  const seat = normalizeFeature({ id: "seat", type: "wall", coords: [...ring, ring[0]],
    kind: "bench", style: "treeSeat", height: .42, thickness: .32 });
  const { surfaces, fine } = paintFeatures([seat, boards]);
  assert.deepEqual(surfaces.features.map(f => f.properties.paving), ["deckTimber", "rootBed"]);
  assert.equal(surfaces.features[0].properties.pavingBoardWidth, .12);
  assert.equal(fine.features.length, 0);
});

test("the main deck stays level to its edges and meets the actual ramps and treads", t => {
  const data = JSON.parse(readFileSync(new URL("../public/map-3d/features.json", import.meta.url)));
  const features = data.features.filter(f => f.deckRim || f.id.startsWith("deck-") || f.id.startsWith("k70-walk"))
    .filter(f => burnsGround(f) || f.type === "surface" || f.type === "marking" || f.style === "treeSeat")
    .map(f => normalizeFeature(f));
  // A low, uniform subgrade makes a missing board or stair support directly measurable.
  t.mock.method(dem, "baseAt", () => 33.6);
  dem.setBurns(features.filter(burnsGround));
  t.after(() => dem.setBurns([]));
  const groundAt = ll => dem.groundAt(ll);
  const mesh = buildMesh(features, { groundAt, terraces: dem.terraces, slopes: dem.slopes, clip });
  const stairs = dem.slopes.filter(sl => sl.f.type === "stairs");
  const world = walkWorld({ data: { buildings: [] }, features, groundAt, decks: stairs.map(stairsPath) });
  const { elev } = features.find(f => f.id === "deck-ground");
  const angle = 7.9 * Math.PI / 180, sn = Math.sin(angle), cs = Math.cos(angle);
  const xy = (station, offset) => [41.5 + station * sn + offset * cs, 20.3 + station * cs - offset * sn];
  const floor = p => world.floorBelow(...p, elev + 0.6)?.z;
  const hitZ = (p, pass = "floors") => {
    const hit = raycastMesh(mesh, { o: [...worldOf(p), elev + 1], d: [0, 0, -3] }, [pass]);
    return hit ? elev + 1 - 3 * hit.t : null;
  };
  for (const [s, o] of [[55, -10.5], [79, 10.7], [98.15, -19.33], [108.1, -11.14], [107.8, -12], [120, 4.5], [120, -5.43], [121, -9]]) {
    const p = xy(s, o);
    assert.equal(floor(p), elev, `walk at ${s}, ${o}`);
    assert.ok(Math.abs(hitZ(p) - elev) < 0.015, `boards at ${s}, ${o}`);
  }
  assert.equal(hitZ(xy(98.15, -7.7)), null); // tree well
  assert.equal(hitZ(xy(119, 11.3)), null); // road outside the fascia
  assert.equal(hitZ(xy(122, 0)), null); // concrete landing beyond the boards

  for (const sl of dem.slopes.filter(sl => sl.f.type === "slope" && sl.f.material === "wood")) {
    const [a, b] = sl.xy, length = sl.cum[1];
    const dx = b[0] - a[0], dy = b[1] - a[1];
    for (const f of [0.07, 0.5, 0.75]) {
      for (const side of [-0.8, 0, 0.8]) {
        const offset = sl.cv[0] * (1 - f) + sl.cv[1] * f + sl.hwv[0] * side;
        const p = [a[0] + f * dx - offset * dy / length, a[1] + f * dy + offset * dx / length];
        const expected = sl.elev[0] * (1 - f) + sl.elev[1] * f;
        assert.ok(Math.abs(floor(p) - expected) < 0.005, sl.f.id);
        assert.ok(Math.abs(hitZ(p) - expected) < 0.015, sl.f.id);
      }
    }
  }
  for (const sl of stairs) {
    assert.ok(sl.treads?.length, sl.f.id);
    for (const tread of sl.treads) {
      const f = (tread.s0 + tread.s1) / (2 * sl.cum[1]);
      const p = sl.xy[0].map((v, i) => v + (sl.xy[1][i] - v) * f);
      assert.ok(Math.abs(floor(p) - tread.top) < 0.005, sl.f.id);
    }
  }
  const [a, b] = features.find(f => f.id === "deck-tactile-sw").coords.map(toXY);
  const strip = a.map((v, i) => v + 0.83 * (b[i] - v));
  assert.ok(hitZ(strip, "") > hitZ(strip), "the tactile guide continues over the sloping boards");
});
