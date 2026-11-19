import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";
import clip from "polygon-clipping";
import sharp from "sharp";
import { raycastMesh } from "../campus-sns/campus3dDebug.js";
import { burnsGround, detailView, parseFeatures, prepareBridge } from "../campus-sns/campus3dFeatures.js";
import { buildMesh, worldOf } from "../campus-sns/campus3dMesh.js";
import { walkWorld } from "../campus-sns/campus3dWalk.js";
import { PALETTES } from "../campus-sns/campusBasemap.js";
import { dem } from "../campus-sns/campusDem.js";

// Metres along and across W5, aligned to the north wall in the survey.
const angle = 17.5 * Math.PI / 180, c = Math.cos(angle), s = Math.sin(angle);
const xy = (along, across) => [-75 + along * c - across * s, 160 + along * s + across * c];
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < .04, `${actual} vs ${expected}`);

test("Tsubame Terrace follows the rear slab and joins the entrance, steps and switchback", async t => {
  // Bridge heights are offsets from the terrain at each vertex, including both landings.
  const dir = new URL("../public/map-dem/15/", import.meta.url);
  for (const x of readdirSync(dir)) {
    for (const file of readdirSync(new URL(x + "/", dir))) {
      const { data, info } = await sharp(fileURLToPath(new URL(x + "/" + file, dir))).removeAlpha().raw().toBuffer({ resolveWithObject: true });
      const z = new Float32Array(info.width * info.height);
      for (let i = 0; i < z.length; i++) {
        const j = i * info.channels;
        z[i] = data[j] * 256 + data[j + 1] + data[j + 2] / 256 - 32768;
      }
      dem.tiles.set(x + "/" + file.replace(/\.png$/, ""), z);
    }
  }
  t.after(() => { dem.setBurns([]); dem.tiles.clear(); });
  const source = JSON.parse(readFileSync(new URL("../public/map-3d/features.json", import.meta.url)));
  const all = detailView(parseFeatures(source), { detail: true, level: "all" });
  dem.setBurns(all.filter(burnsGround));
  const groundAt = p => dem.groundAt(p);
  const features = all.filter(f => /^(w5-|w5r-|cr2n?-)/.test(f.id));
  const decks = features.filter(f => f.type === "bridge" && f.surface !== "rail").map(f => prepareBridge(f, groundAt));
  const world = walkWorld({ data: { buildings: [] }, features, groundAt, surfaceAt: p => dem.surfaceAt(p), decks, digs: dem.digs });
  const mesh = buildMesh(features, { groundAt, pal: PALETTES.light, clip });
  const rendered = p => raycastMesh(mesh, { o: [...worldOf(p), 34.73], d: [0, 0, -2] }, ["floors"]);

  // The 2023 rear beam and the completed building share a straight outer edge.
  for (const [along, across, z] of [[26, 12.2, 34], [33, 16.0, 34], [42, 13.4, 34], [46.8, 14, 34],
    [48.66, 13.4, 34.12], [49.16, 13.4, 34.23], [50, 13.4, 34.35], [48.1, 4.91, 34.175], [48.1, 8.38, 34.35]]) {
    const p = xy(along, across), hit = rendered(p);
    assert.ok(hit, `missing surface at ${along}, ${across}`);
    near(34.73 - 2 * hit.t, z);
    near(world.floorBelow(...p, 34.73).z, z);
  }
  for (const p of [[24.4, 14.2], [32, 17.42], [49.62, 20.28], [55, 18.27]].map(v => xy(...v))) {
    assert.equal(rendered(p), null);
    assert.ok(world.floorBelow(...p, 34.73).z < 33.5);
  }
  for (const [a, b, z] of [[25.09, 14, 34], [32, 16.5, 34], [48.4, 16.5, 34], [57.4, 16.5, 34.35], [60.47, 8.2, 34.35]]) {
    assert.ok(world.blocked(...xy(a, b), z));
  }
  near(world.floorBelow(...xy(22, 14.7), 30).z, 25.8);

  const routes = [
    [[41.7, 1.49], [46.03, 1.49], [46.03, 12.05], [44.2, 14.45], [26.2, 14.45]],
    [[47.54, 13.42], [50.6, 13.42]],
    [[45.8, 1.43], [48.07, 1.43], [48.07, 8.24], [50.5, 8.24]],
    [[51.24, -3.70], [51.24, -.75], [52.73, -.75]],
    [[52.4, -.68], [61.525, -.68], [61.525, 14.05], [63.535, 14.05], [63.535, -2.77], [64.99, -2.77], [67.75, -4.08]],
  ];
  for (const route of routes) for (const path of [route, [...route].reverse()]) {
    let [x, y] = xy(...path[0]), floor = world.floorBelow(x, y, 34.78);
    for (const point of path.slice(1)) {
      const [qx, qy] = xy(...point), dx = qx - x, dy = qy - y;
      const n = Math.ceil(Math.hypot(dx, dy) / .07);
      for (let i = 0; i < n; i++) {
        ({ x, y, floor } = world.move(x, y, floor.z, dx / n, dy / n, { deck: floor.deck }));
        assert.ok(floor.z >= 33.35 && floor.z <= 34.39, `lost deck towards ${point}`);
      }
      assert.ok(Math.hypot(qx - x, qy - y) < .14, `cannot reach ${point} from ${path[0]}`);
    }
  }
});
