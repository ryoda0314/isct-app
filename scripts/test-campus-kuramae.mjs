import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, mock, test } from "node:test";
import clip from "polygon-clipping";
import { PALETTES } from "../campus-sns/campusBasemap.js";
import { burnsGround, detailView, parseFeatures, toXY } from "../campus-sns/campus3dFeatures.js";
import { buildMesh, worldOf } from "../campus-sns/campus3dMesh.js";
import { raycastMesh } from "../campus-sns/campus3dDebug.js";
import { collectSeats, seatPick, sitPose } from "../campus-sns/campus3dSeats.js";
import { walkWorld } from "../campus-sns/campus3dWalk.js";
import { dem } from "../campus-sns/campusDem.js";

const raw = JSON.parse(readFileSync(new URL("../public/map-3d/features.json", import.meta.url), "utf8")).features;
const model = parseFeatures(raw.filter((f) => f.id.startsWith("kura-")));
const all = detailView(model, { detail: true, level: "all" }),
  byId = (id) => all.find((f) => f.id === id);
mock.method(dem, "baseAt", () => 34.81);
dem.setBurns(all.filter(burnsGround));
after(() => {
  dem.setBurns([]);
  mock.restoreAll();
});
const groundAt = (ll) => dem.groundAt(ll),
  options = { groundAt, clip, pal: PALETTES.light };
const sub = (a, b) => a.map((v, i) => v - b[i]);
function frame(f) {
  const ring = f.coords.map(toXY),
    origin = ring[0],
    axis = sub(ring[1], origin),
    L = Math.hypot(...axis);
  const [cs, sn] = axis.map((v) => v / L);
  return (u, v) => [origin[0] + cs * u - sn * v, origin[1] + sn * u + cs * v];
}

test("飛翔の台座込みの高さと、彫刻を回り込んだときの透かし", () => {
  const piece = byId("kura-louver-statue"),
    base = byId("kura-louver-statue-base");
  assert.equal(piece.base, base.height);
  const foot = groundAt(base.groundRef);
  const mesh = buildMesh([piece], options);
  let top = -Infinity;
  for (let i = 2; i < mesh.pos.length; i += 3) top = Math.max(top, mesh.pos[i]);
  assert.ok(Math.abs(top - foot - 3.5) < 0.012);
  const origin = piece.coords.map(toXY).reduce((sum, p) => sum.map((v, i) => v + p[i] / piece.coords.length), [0, 0]);
  function silhouette(angle, height) {
    const u = [Math.cos(angle), Math.sin(angle)],
      v = [-u[1], u[0]];
    return Array.from({ length: 43 }, (_, i) => {
      const off = (i - 21) * 0.026;
      const start = origin.map((n, k) => n - u[k] * 1.4 + v[k] * off),
        end = start.map((n, k) => n + u[k]);
      const a = worldOf(start),
        b = worldOf(end);
      return raycastMesh(mesh, { o: [...a, foot + height], d: [...sub(b, a), 0] }, [""]) ? "x" : ".";
    }).join("");
  }
  const a = silhouette(0, 1.83),
    b = silhouette(Math.PI / 2, 1.83);
  // Each sight line crosses distinct tail stocks with daylight between them.
  assert.match(a, /x\.{2,}x/);
  assert.match(b, /x\.{2,}x/);
  assert.notEqual(a, b);
  assert.notEqual(silhouette(0.47, 2.22), silhouette(0.47, 3.21));
});

test("テラスの椅子は丸テーブルを向き、カフェの入口と渡り廊下の通り道を空ける", () => {
  const patio = byId("kura-cafe-terrace"),
    tables = patio.items.filter((it) => it.style === "bistro");
  const mean = (r) => r.reduce((c, p) => [c[0] + p[0] / r.length, c[1] + p[1] / r.length], [0, 0]);
  const centers = tables.map((it) => mean(it.coords.map(toXY)));
  const seats = collectSeats([patio], groundAt),
    g = groundAt(patio.groundRef) + patio.z;
  assert.equal(centers.length, 5);
  assert.equal(seats.length, 13);
  for (const s of seats) {
    const hit = seatPick(seats, [...s.c, g + 1.55], [0, 0, -1], g);
    assert.equal(hit?.seat, s);
    const pose = sitPose(s, hit.p, [...s.c, g + 1.55]),
      a = (pose.yaw * Math.PI) / 180;
    const towards = [Math.sin(a), Math.cos(a)],
      neighbor = centers.find((c) => Math.hypot(...sub(c, s.c)) < 0.78);
    assert.ok(neighbor);
    assert.ok(sub(neighbor, s.c).reduce((sum, v, i) => sum + v * towards[i], 0) > 0.65);
  }
  const project = frame(byId("kura-b-main"));
  const world = walkWorld({
    data: { buildings: [] },
    features: all,
    groundAt,
    surfaceAt: (ll) => dem.surfaceAt(ll),
    digs: dem.digs,
  });
  const route = [
    [29.2, 12.96],
    [19.32, 12.96],
    [19.32, 8.45],
    [19.32, 12.96],
    [1.0, 12.96],
  ];
  let [x, y] = project(...route[0]),
    floor = world.floorBelow(x, y, g + 0.3);
  for (const target of route.slice(1)) {
    const goal = project(...target),
      d = sub(goal, [x, y]),
      n = Math.ceil(Math.hypot(...d) / 0.07);
    for (let step = 0; step < n; step++)
      ({ x, y, floor } = world.move(x, y, floor.z, d[0] / n, d[1] / n, { deck: floor.deck }));
    assert.ok(Math.hypot(x - goal[0], y - goal[1]) < 0.12);
  }
});

test("庇の羽根の間に空が見え、照明は梁の下面に収まる", () => {
  for (const id of ["kura-canopy-1", "kura-canopy-2", "kura-louver-s", "kura-louver-e"]) {
    const f = byId(id),
      blades = f.panels.filter((p) => p.louver),
      lights = f.members.filter((p) => p.kind === "downlight");
    assert.ok(blades.length >= 12 && lights.length >= 4);
    const p = blades[0],
      next = blades[1],
      spacing = Math.hypot(...sub(toXY(p.coords[0]), toXY(next.coords[0])));
    assert.ok(spacing - p.thickness > 0.3 && p.zs[2] - p.zs[0] > 0.39);
    for (const lamp of lights) assert.ok(lamp.zs[0] < lamp.zs[1] && lamp.zs[1] < p.zs[0]);
  }
});
