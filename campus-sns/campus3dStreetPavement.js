import { toLngLat, toXY } from "./campus3dFeatures.js";
import { streetFrame } from "./campus3dStreetLayout.js";

const finishes = {
  asphalt: "road:#62666d",
  repair: "road:#5b5e65",
  tar: "road:#4f5053",
  red: "road:#85585b",
  stone: "slab:#989493",
  curb: "stone:#bab8ad",
  paint: "road:#dedbd2",
  channel: "stone:#85827b",
  joint: "road:#484747",
  brickSill: "tile:#9e766d",
  sill: "slab:#a8a297"
};
const mix = (p, q, t) => p.map((v, j) => v + (q[j] - v) * t);

// Preserve the corner elevations of each patch on the sloping DEM. An encoded
// unit mesh can be reused by the existing instancer without adding another layer.
function patch(inst, pts, ground, kind, lift) {
  const zs = pts.map(ground);
  if (!zs.every(Number.isFinite)) return;
  const xs = pts.map((p) => p[0]),
    ys = pts.map((p) => p[1]);
  const w = Math.max(0.02, Math.max(...xs) - Math.min(...xs));
  const d = Math.max(0.02, Math.max(...ys) - Math.min(...ys));
  const x = Math.min(...xs) + w / 2,
    y = Math.min(...ys) + d / 2;
  const base = Math.min(...zs),
    h = Math.max(0.02, Math.max(...zs) - base);
  const corners = pts.flatMap(([a, b], k) => [(a - x) / w, (b - y) / d, (zs[k] - base) / h]);
  const id = corners.map((v) => Math.round(v * 1000)).join("_");
  inst.add("street/paving/" + kind + "_" + id, [x, y], base + lift, 0, [w, d, h], ["#ffffff", "#ffffff"]);
}
export function pavementMesh(m, id) {
  const [kind, ...values] = id.split("_");
  const vertices = [];
  for (let i = 0; i < values.length; i += 3) vertices.push(values.slice(i, i + 3).map((v) => Number(v) / 1000));
  m.face(vertices.slice(0, 3), finishes[kind], [0, 0, 1]);
  if (vertices.length === 4) m.face([vertices[0], vertices[2], vertices[3]], finishes[kind], [0, 0, 1]);
}

export function laneSurface(inst, route, ground, features) {
  const frontage = features.flatMap(f => (f.shopfronts || []).filter(s => !s.returnWall));
  const fronts = frontage.map(s => s.coords.map(toXY));
  function section(s) {
    const { p, angle } = route.at(s),
      c = Math.cos(angle),
      n = Math.sin(angle);
    let left = -4.4,
      right = 4.4,
      nearLeft = Infinity,
      nearRight = Infinity;
    for (const [a, b] of fronts) {
      const along = (q) => (q[0] - p[0]) * c + (q[1] - p[1]) * n;
      const t0 = along(a),
        t1 = along(b);
      if (t0 * t1 > 0 || Math.abs(t0 - t1) < 0.45) continue;
      const at = mix(a, b, t0 / (t0 - t1)),
        offset = (at[0] - p[0]) * n - (at[1] - p[1]) * c;
      if (offset < -1.8 && -offset < Math.min(8.5, nearLeft)) {
        left = offset + 0.38;
        nearLeft = -offset;
      }
      if (offset > 1.8 && offset < Math.min(8.5, nearRight)) {
        right = offset - 0.38;
        nearRight = offset;
      }
    }
    return [left, -0.48, right].map((off) => [p[0] + off * n, p[1] - off * c]);
  }
  let a = section(0);
  for (let s = 0; s < route.length; s += 1.8) {
    const b = section(Math.min(s + 1.8, route.length));
    for (let j = 0; j < 2; j++)
      patch(inst, [a[j], a[j + 1], b[j + 1], b[j]], ground, s < 12.59 ? "red" : j ? "asphalt" : "repair", 0.061);
    const t0 = route.at(s, -0.5),
      t1 = route.at(Math.min(s + 1.8, route.length), -0.5);
    if (s > 13.0)
      patch(
        inst,
        [t0.p, route.at(s, -0.474).p, route.at(Math.min(s + 1.8, route.length), -0.474).p, t1.p],
        ground,
        "tar",
        0.075
      );
    a = b;
  }
  for (let j = -3; j <= 3; j++) {
    const e = j * 0.83;
    patch(
      inst,
      [
        [5.05, e - 0.22],
        [5.05, e + 0.22],
        [7.49, e + 0.22],
        [7.49, e - 0.22]
      ].map(([s, d]) => route.at(s, d).p),
      ground,
      "paint",
      0.081
    );
  }
  // IMG_1546 and IMG_1549: these aprons follow the actual shop walls.
  // Their ends stop at each doorway or party wall, including at the side streets.
  const shoulders = {
    kaldi: ["sill", .61, -.75, "cover"], hidakaya: ["brickSill", .69],
    sundrug: ["sill", .56, .48, "cover"], kamio: ["sill", .31],
    marutaka: ["sill", .40], coco: ["sill", .62, -.22, "cover"],
    ohsho: ["brickSill", .49], kenkodo: ["sill", .39], basanta: ["sill", .36]
  };
  for (const front of frontage) {
    const spec = shoulders[front.shop];
    if (!spec) continue;
    const frame = streetFrame(front, toXY);
    if (!frame) continue;
    const [finish, depth, position, lid] = spec, half = frame.width / 2 - .035;
    const strip = (x1,x2,y1,y2,kind,lift) =>
      patch(inst, [[x1,y1],[x2,y1],[x2,y2],[x1,y2]].map(([x,y]) => frame.point(x,y)), ground, kind, lift);
    strip(-half,half,-depth,-.016,finish,.083);
    strip(-half,half,-depth-.21,-depth,"channel",.084);
    strip(-half,half,-depth-.225,-depth-.208,"joint",.088);
    const bays=Math.ceil(2*half/.90);
    for(let i=1;i<bays;i++) {
      const x=-half+2*half*i/bays;
      strip(x-.006,x+.006,-depth-.21,-depth,"joint",.088);
    }
    if (lid) {
      const p=frame.point(position*half,-depth-.47);
      const z=ground(p);
      if(Number.isFinite(z)) inst.add("street/"+lid,p,z+.091,frame.angle,[.56,.79,.026],["#6b6860","#908c7e"]);
    }
  }
}

// The square's station-side kerb and the zebra are oblique to the shopping
// street. These points are in metres in the Shibata frontage frame.
export function squareGrade(feature, groundAt) {
  const front = feature?.shopfronts?.find((f) => f.shop === "shibata" && !f.returnWall);
  if (!front) return null;
  const frame = streetFrame(front, toXY),
    o = frame.point(0, 0),
    c = Math.cos(frame.angle),
    s = Math.sin(frame.angle);
  const datum = groundAt(feature.groundRef || front.coords[0]);
  if (!Number.isFinite(datum)) return null;
  return (x, y) => {
    const dx = x - o[0],
      dy = y - o[1];
    if (Math.abs(dx) > 31 || Math.abs(dy) > 31) return null;
    const X = dx * c + dy * s,
      Y = -dx * s + dy * c;
    const d = Math.min(X + 11, 12 - X, Y + 24.8, -3.7 - Y);
    if (d <= 0) return null;
    const t = Math.min(1, d / 2.2);
    if (t === 1) return datum - 0.075;
    const z = groundAt(toLngLat([x, y]));
    return z + (datum - 0.075 - z) * t * t * (3 - 2 * t);
  };
}

export function squarePaving(inst, front, groundAt, feature) {
  const frame = streetFrame(front, toXY),
    pos = (q) => frame.point(...q);
  const grade = squareGrade(feature, groundAt);
  const ground = (p) => grade?.(...p) ?? groundAt(toLngLat(p));
  const paved = (pts, kind, lift) => patch(inst, pts.map(pos), ground, kind, lift);
  const SW = [-8.5, -14.53],
    SE = [5.6, -17.2];
  paved([[-8.5, -22.4], [5.6, -22.4], SE, SW], "stone", 0.093);
  paved([SW, SE, [5.65, -17.02], [-8.45, -14.35]], "curb", 0.095);
  paved(
    [
      [-8.45, -14.35],
      [5.65, -17.02],
      [7.4, -10.65],
      [-7.9, -7.69]
    ],
    "asphalt",
    0.077
  );
  const left = [-4.91, -15.12],
    right = [-0.59, -16.01],
    farLeft = [-3.76, -8.78],
    farRight = [0.5, -9.59];
  for (let j = 0; j < 8; j++) {
    const t = j / 8;
    paved(
      [
        mix(left, farLeft, t),
        mix(right, farRight, t),
        mix(right, farRight, t + 0.069),
        mix(left, farLeft, t + 0.069)
      ],
      "paint",
      0.099
    );
  }
  // Two convex parts of the white T junction marking.
  paved(
    [
      [1.58, -13.87],
      [3.13, -14.03],
      [3.48, -13.75],
      [1.73, -13.54]
    ],
    "paint",
    0.098
  );
  paved(
    [
      [2.32, -13.65],
      [2.77, -13.67],
      [3.77, -12.66],
      [3.32, -12.61]
    ],
    "paint",
    0.098
  );
  function item(id, q, size, angle = 0, lift = 0.105) {
    const p = pos(q);
    inst.add("street/" + id, p, ground(p) + lift, frame.angle + angle, size, ["#54514f", "#c8b95d"]);
  }
  item("lid", [4.0, -12.95], [0.84, 0.84, 0.031]);
  item("cover", [-1.78, -16.26], [0.68, 0.95, 0.035], -0.16);
  item("cover", [0.57, -16.48], [0.44, 0.48, 0.022], -0.16);
  item("rail/square", [0.81, -17.24], [2.12, 0.14, 0.85], -0.18);
  for (const [a, b] of [
    [
      [0.64, -9.68],
      [3.98, -7.63]
    ],
    [
      [3.98, -7.63],
      [8.12, -3.03]
    ]
  ]) {
    const dx = b[0] - a[0],
      dy = b[1] - a[1],
      len = Math.hypot(dx, dy);
    for (let j = 0, n = Math.ceil(len / 1.8); j < n; j++)
      item("rail/kerb", mix(a, b, j / n), [len / n, 0.13, 0.82], Math.atan2(dy, dx), 0.057);
  }
}
