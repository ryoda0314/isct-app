import { laneSurface, squarePaving, squareGrade } from "./campus3dStreetPavement.js";
import { toXY, toLngLat } from "./campus3dFeatures.js";
import { STREET_SHOPS } from "./campus3dStreetCatalog.js";
import { streetFrame, shopLayout, foodKinds } from "./campus3dStreetLayout.js";

const paper = "#e9dfc7",
  steel = "#afb4ac";
const colors = ["#a44e3d", "#708348", "#b69b51", "#547c87", "#c1a488", "#686781"];
const goods = {
  chemist: ["pump", "refill", "cereal", "teaBox"],
  convenience: ["teaBottle", "snackBag", "juiceCarton", "cereal"],
  grocery: ["snackBag", "teaBox", "can", "jar"],
  bakery: ["croissant", "melonpan", "baguette", "loaf"],
  variety: ["cereal", "refill", "pump", "teaBox"],
  shoes: ["street/goods/shoe"],
  pottery: ["street/goods/bowl"],
  music: ["street/goods/cd"],
  appliances: ["street/goods/washer"],
  gacha: ["street/goods/gacha"]
};
const packSize = {
  pump: [0.113, 0.095, 0.25],
  refill: [0.165, 0.09, 0.235],
  cereal: [0.168, 0.108, 0.261],
  teaBox: [0.139, 0.1, 0.18],
  teaBottle: [0.079, 0.081, 0.237],
  snackBag: [0.151, 0.115, 0.22],
  juiceCarton: [0.089, 0.087, 0.226],
  can: [0.081, 0.082, 0.14],
  jar: [0.096, 0.099, 0.146],
  croissant: [0.185, 0.14, 0.09],
  melonpan: [0.147, 0.14, 0.096],
  baguette: [0.094, 0.285, 0.085],
  loaf: [0.19, 0.22, 0.16],
  orange: [0.11, 0.108, 0.1],
  apple: [0.112, 0.112, 0.11],
  cabbage: [0.209, 0.217, 0.18],
  "street/goods/shoe": [0.25, 0.105, 0.129],
  "street/goods/bowl": [0.197, 0.2, 0.125],
  "street/goods/cd": [0.143, 0.029, 0.125],
  "street/goods/washer": [0.49, 0.39, 0.55],
  "street/goods/gacha": [0.31, 0.28, 0.45]
};

function stockMerchandise(inst, front, g, layout, shop) {
  const put = (id, x, y, z, size, main, accent, turn = 0, behind = false) =>
    inst.add(
      id,
      front.point(x, y),
      g + z,
      front.angle + turn,
      size,
      [main, accent],
      shop.id === "kaldi" ? 1.27 : shop.id === "coco" ? 1.22 : 1.07,
      behind
    );
  const seed = [...shop.id].reduce((a, c) => a + c.charCodeAt(0), 0);
  for (const f of layout.fixtures) {
    if (f.kind === "shelf" || f.kind === "rack") {
      const types = shop.id === "nagano" ? ["orange", "apple", "cabbage"] : goods[shop.kind];
      if (!types) continue;
      const levels = f.kind === "rack" ? 3 : shop.id === "kaldi" ? 6 : 4;
      for (let r = 0; r < levels; r++) {
        const top = 0.248 + (r * (f.h - 0.31)) / (levels - 1);
        const count = Math.max(
          2,
          Math.floor((f.w - 0.1) / (shop.kind === "appliances" ? 0.56 : shop.kind === "gacha" ? 0.36 : 0.154))
        );
        if ((shop.kind === "appliances" || shop.kind === "gacha") && (r % 2 || (f.kind === "rack" && r > 0)))
          continue;
        for (let j = 0; j < count; j++) {
          const id = types[(Math.floor(j / 3) + r) % types.length],
            sz = packSize[id];
          const x = f.x - f.w / 2 + ((j + 0.5) * f.w) / count;
          const k = (seed + Math.floor(j / 2) + r * 2) % colors.length;
          const main =
            id === "orange"
              ? "#d88b44"
              : id === "apple"
                ? "#a34c40"
                : id === "cabbage"
                  ? "#91a064"
                  : id === "street/goods/washer"
                    ? "#dedfd7"
                    : shop.kind === "bakery"
                      ? "#c39660"
                      : colors[k];
          const y = f.y - f.d * 0.5 + sz[1] * 0.57;
          put(id, x, y, top, sz, main, paper, ((j % 3) - 1) * 0.04);
          if (sz[1] < f.d * 0.41 && (j + r) % 4 !== 0)
            for (
              let k = 1;
              k <= Math.min(f.d > 0.9 ? 5 : 2, Math.floor((f.d - sz[1]) / Math.max(0.158, sz[1] * 1.14)));
              k++
            )
              put(id, x, y + k * Math.max(0.158, sz[1] * 1.14), top, sz, main, paper, 0.025 * k, true);
        }
      }
    } else if (f.kind === "bin") {
      for (let r = 0; r < 3; r++)
        for (let j = 0; j < 5; j++)
          put(
            "snackBag",
            f.x - f.w * 0.37 + j * f.w * 0.185,
            f.y - f.d * 0.32 + r * f.d * 0.31,
            f.h - 0.14 + 0.015 * r,
            [0.165, 0.14, 0.25],
            colors[(j + r + 1) % colors.length],
            paper,
            (j - 2) * 0.085
          );
    } else if (f.kind === "clothes") {
      const n = Math.max(2, Math.min(15, Math.floor(f.w / 0.17)));
      for (let i = 0; i < n; i++)
        put(
          "street/goods/shirt",
          f.x - f.w * 0.43 + ((i + 0.5) * f.w * 0.86) / n,
          f.y,
          f.h - 0.6,
          [0.4, 0.104, 0.61],
          colors[(i + seed) % 6],
          steel,
          -0.9
        );
    } else if (f.kind === "counter") {
      put(
        "street/goods/menu",
        f.x - f.w * 0.22,
        f.y + 0.22,
        f.h + 0.07,
        [Math.min(0.72, f.w * 0.38), 0.16, 0.53],
        paper,
        paper
      );
      if (f.w > 2.4)
        for (let k = 0; k < 3; k++)
          put(
            "street/goods/bowl",
            f.x + f.w * 0.08 + k * 0.16,
            f.y - 0.08,
            f.h + 0.023,
            [0.16, 0.16, 0.1],
            "#e7decb",
            colors[(seed + k) % 6]
          );
    }
  }
  const { half, span } = layout;
  if (
    !["cocoichi", "basanta", "ohsho"].includes(shop.id) &&
    span > 3.25 &&
    (foodKinds.has(shop.kind) || ["realty", "salon", "pawn"].includes(shop.kind))
  ) {
    put(
      "street/board",
      -half + 0.47,
      -0.26,
      0.02,
      [0.62, 0.5, 0.97],
      foodKinds.has(shop.kind) ? "#3f4f40" : paper,
      foodKinds.has(shop.kind) ? paper : shop.band,
      -0.13
    );
    if (foodKinds.has(shop.kind))
      put("street/goods/menu", -half + 0.46, -0.36, 0.14, [0.46, 0.06, 0.65], paper, "#ebdfc8", -0.13);
  }
  if (shop.id === "cocoichi")
    put("street/prop/parking", 2.36, -0.72, 0.076, [0.74, 0.39, 0.95], "#acb1a4", paper, 0.04);
  if (shop.id === "coco")
    put("street/prop/conifer", 4.24, -1.24, 0.06, [1.16, 1.07, 2.55], "#54643d", paper, 0.09);
  if (shop.id === "shibata") put("street/prop/tree", -5.04, -7.13, 0, [4.12, 4.04, 6.74], "#68783f", paper);
  if (shop.id === "shibata")
    put("street/prop/bag", -1.37, -1.38, 0.04, [0.52, 0.42, 1.67], "#383941", paper, -0.55);
  if (shop.id === "familynorth")
    put("street/cycle", 0.62, -0.63, 0.057, [1.52, 0.47, 1.01], "#b6c7ba", steel, 1.12);
  if (shop.kind === "convenience" || shop.id === "chiyoda" || shop.id === "softbank")
    put(
      "street/cycle",
      -half + Math.min(1.13, span * 0.27),
      -0.37,
      0.025,
      [1.5, 0.47, 1.02],
      "#72918a",
      steel,
      -0.06
    );
  if (shop.id === "honma" || shop.id === "hidakaya")
    put(
      "street/flag",
      layout.edge - 0.37,
      -0.3,
      0.02,
      [0.63, 0.37, 1.88],
      shop.id === "familynorth" ? "#e2b748" : shop.band,
      paper
    );
  if (
    span > 3.5 &&
    (shop.kind === "cafe" ||
      shop.kind === "salon" ||
      shop.kind === "bakery" ||
      shop.id === "constant" ||
      shop.id === "hidakaya")
  )
    put("street/planter", layout.edge - 0.29, -0.12, 0.02, [0.52, 0.52, 0.81], "#95745c", "#788156");
}

export function addShoppingFronts(inst, feature, groundAt) {
  const g = groundAt(feature.groundRef || feature.coords[0]);
  for (const front of feature.shopfronts) {
    const frame = streetFrame(front, toXY),
      shop = STREET_SHOPS.get(front.shop);
    if (!frame || !shop || !Number.isFinite(g)) continue;
    const key =
      "street/" +
      (front.returnWall ? "flank" : "shop") +
      "/" +
      shop.id +
      "/" +
      Math.round(frame.width * 100) +
      "/" +
      Math.round(feature.height * 100);
    inst.add(
      key,
      frame.point(0, 1.2),
      g,
      frame.angle,
      [frame.width, 6.6, feature.height],
      [shop.band, shop.ink],
      1.04
    );
    if (!front.returnWall) {
      const layout = shopLayout(shop, frame.width);
      stockMerchandise(inst, frame, g, layout, shop);
      if (shop.id === "cocoichi" || shop.id === "familynorth") {
        const family = shop.id === "familynorth";
        inst.add(
          "street/leaf/" + (family ? "family" : "curry"),
          frame.point(layout.entry, -0.012),
          g + 0.064,
          frame.angle,
          [layout.doorWidth, 0.1, family ? 2.22 : 2.27],
          [shop.wall, paper],
          1.08
        );
      }
      if (shop.id === "shibata") squarePaving(inst, front, groundAt, feature);
      const paving = ["#92908e", "#898682", "#a09b90", "#898885", "#948c80"];
      const rows = shop.kind === "convenience" ? 3 : 2;
      const columns = Math.max(1, Math.round(frame.width / 0.219));
      for (let row = 0; row < rows; row++)
        for (let j = 0; j < columns; j++) {
          const w = frame.width / columns,
            x = (j + 0.5) * w - frame.width / 2;
          const p = frame.point(x, -0.13 - row * 0.145),
            z = groundAt(toLngLat(p));
          const tint = paving[(j * 7 + row * 3) % paving.length];
          if (Number.isFinite(z))
            inst.add("street/paver", p, z + 0.056, frame.angle, [w - 0.006, 0.142, 0.024], [tint, tint], 1.06);
        }
    }
  }
  return STREET_SHOPS.get(feature.shopfronts[0]?.shop)?.wall;
}

// Stationing begins at the station square and follows the actual bends. Linear
// sampling also lets utility cables and grates sit on the local grade.
export function streetRoute(coords) {
  const xy = coords.map(toXY),
    length = [0];
  for (let i = 1; i < xy.length; i++)
    length.push(length[i - 1] + Math.hypot(xy[i][0] - xy[i - 1][0], xy[i][1] - xy[i - 1][1]));
  return {
    length: length.at(-1),
    at(distance, offset = 0) {
      const s = Math.min(length.at(-1), distance);
      let j = 1;
      while (j < length.length - 1 && s > length[j]) j++;
      const a = xy[j - 1],
        b = xy[j],
        d = length[j] - length[j - 1] || 1,
        dx = (b[0] - a[0]) / d,
        dy = (b[1] - a[1]) / d;
      return {
        p: [a[0] + dx * (s - length[j - 1]) + dy * offset, a[1] + dy * (s - length[j - 1]) - dx * offset],
        angle: Math.atan2(dy, dx)
      };
    }
  };
}

export function shoppingStreetSupports(route) {
  const supports = [];
  function add(model, distance, offset, dim, turn, radius, postX = 0, postY = 0) {
    const { p, angle } = route.at(distance, offset);
    const rot = angle + turn,
      cs = Math.cos(rot),
      sn = Math.sin(rot);
    const post = [p[0] + postX * cs - postY * sn, p[1] + postX * sn + postY * cs];
    supports.push({ model, p, angle: rot, dim, post, radius });
  }
  add("entrance", 1.72, -5.3, [2.86, 0.83, 7.18], -1.44, 0.145);
  add("entrance", 2.6, 4.73, [2.86, 0.83, 7.18], Math.PI - 1.44, 0.145);
  add("traffic", 13.0, 2.69, [0.52, 0.49, 3.48], -Math.PI / 2, 0.065);
  add("bollard", -5.15, -2.32, [0.12, 0.12, 0.87], 0, 0.065);
  for (const [s, offset] of [
    [12, -2.68],
    [44, -2.8],
    [76, -3.15],
    [103.4, -3.23],
    [129, 2.2],
    [163, 2.39],
    [195, 2.37],
    [229, 2.99]
  ])
    add("pole", s, offset, [2.3, 1.25, 9.65], -Math.PI / 2, 0.2);
  for (const [s, offset, style] of [
    [17, 2.24, "pendant"],
    [33, -2.67, "pendant"],
    [60, 2.13, "pendant"],
    [88, -3.13, "lantern"],
    [99.56, 3.3, "arcade"],
    [117, -2.8, "pendant"],
    [146, 1.85, "pendant"],
    [171, -3.01, "pendant"],
    [192, 2.35, "lantern"],
    [213, -3.3, "pendant"],
    [233, 2.4, "pendant"]
  ])
    add(
      "lamp/" + style,
      s,
      offset,
      style === "arcade" ? [1.54, 0.5, 6.47] : [1.68, 1, 5.62],
      style === "arcade" ? Math.PI / 2 : offset < 0 ? 0 : Math.PI,
      0.135
    );
  return supports;
}

export function addShoppingStreet(inst, f, groundAt, features = []) {
  const route = streetRoute(f.coords);
  const square = features.find((f) => f.shopfronts?.some((s) => s.shop === "shibata"));
  const grade = squareGrade(square, groundAt);
  const ground = (p) => grade?.(...p) ?? groundAt(toLngLat(p));
  laneSurface(inst, route, ground, features);
  function place(model, s, offset, dim, turn = 0, lift = 0.105) {
    const { p, angle } = route.at(s, offset),
      z = ground(p) + lift;
    if (Number.isFinite(z)) inst.add("street/" + model, p, z, angle + turn, dim, [steel, paper], 1.05);
  }
  place("stop", 14.45, 0, [1.03, 3.64, 0.025], Math.PI / 2, 0.082);
  const wires = [];
  for (const s of shoppingStreetSupports(route)) {
    const z = ground(s.p);
    if (Number.isFinite(z)) inst.add("street/" + s.model, s.p, z + 0.055, s.angle, s.dim, [steel, paper], 1.05);
    if (s.model === "pole") wires.push({ ...s, z });
  }
  function cable(pa, pb, za, zb, sag, mm) {
    const x = pb[0] - pa[0],
      y = pb[1] - pa[1],
      w = Math.hypot(x, y),
      dz = zb - za;
    if (!Number.isFinite(za + zb) || w < 1) return;
    const id = [Math.round(w * 100), Math.round(dz * 100), Math.round(sag * 100), mm].join("_");
    inst.add(
      "street/wire/" + id,
      [(pa[0] + pb[0]) / 2, (pa[1] + pb[1]) / 2],
      Math.min(za, zb) - sag,
      Math.atan2(y, x),
      [w, 0.22, Math.abs(dz) + sag + 0.1],
      [steel, paper]
    );
  }
  for (let i = 1; i < wires.length; i++) {
    const a = wires[i - 1],
      b = wires[i];
    if (!Number.isFinite(a.z + b.z)) continue;
    for (const [offset, z, sag, mm] of [
      [-0.77, 9.53, 0.5, 22],
      [-0.06, 9.53, 0.55, 20],
      [0.69, 9.53, 0.52, 21],
      [-0.55, 7.65, 0.78, 34],
      [0.15, 7.64, 0.83, 31],
      [0.45, 7.56, 0.94, 20]
    ]) {
      const pa = [a.p[0] + offset * Math.cos(a.angle), a.p[1] + offset * Math.sin(a.angle)];
      const pb = [b.p[0] + offset * Math.cos(b.angle), b.p[1] + offset * Math.sin(b.angle)];
      cable(pa, pb, a.z + z, b.z + z, sag, mm);
    }
  }
  // Service drops from the high distribution cables to both building rows. Each
  // span has two surveyed attachment heights and a catenary-like sag.
  // The high diagonal telephone bundle passes overhead at the dentist and
  // crosses towards the west row as the lane bends. Both ends sit on crossarms.
  const ties = [
    [77.7, 5.57, 9.4],
    [124.9, -3.75, 9.17]
  ];
  for (const [s, off, h] of ties) {
    const a = route.at(s, off - 1.2).p,
      b = route.at(s, off + 1.2).p,
      z = ground(route.at(s, off).p) + h;
    cable(a, b, z, z, 0.025, 54);
  }
  for (const [off, drop, mm] of [
    [-1.1, 0.65, 15],
    [-0.72, 0.74, 21],
    [-0.29, 0.8, 31],
    [-0.1, 0.83, 23],
    [0.36, 0.7, 18],
    [0.81, 0.78, 27],
    [1.08, 0.72, 21]
  ]) {
    const a = route.at(ties[0][0], ties[0][1] + off).p,
      b = route.at(ties[1][0], ties[1][1] + off).p;
    cable(a, b, ground(a) + 9.4, ground(b) + 9.17, drop, mm);
  }
  const connections = [
    [12, 23, 1],
    [44, 38, 1],
    [44, 51, -1],
    [76, 65, 1],
    [76, 84, 1],
    [103.4, 95, 1],
    [103.4, 111, 1],
    [129, 120, -1],
    [129, 138, -1],
    [163, 151, -1],
    [163, 173, 1],
    [195, 181, -1],
    [195, 201, -1],
    [229, 217, -1],
    [229, 234, -1]
  ];
  for (const [s, shop, side] of connections) {
    const pole = wires.reduce(
      (best, p) =>
        Math.hypot(p.p[0] - route.at(s).p[0], p.p[1] - route.at(s).p[1]) <
        Math.hypot(best.p[0] - route.at(s).p[0], best.p[1] - route.at(s).p[1])
          ? p
          : best,
      wires[0]
    );
    if (!pole) continue;
    const a = pole.p,
      b = route.at(shop, side * 4.7).p;
    cable(a, b, pole.z + 7.91, ground(b) + 5.75, 0.49, 16);
    cable(a, b, pole.z + 7.68, ground(b) + 5.66, 0.67, 11);
  }
  const people = [
    [31, -2.2, 0, 1.68],
    [47, 1.7, 1, 1.61],
    [71, -1.8, 1, 1.74],
    [83, 2.05, 0, 1.64],
    [106.25, 0.41, 1, 1.7],
    [107.85, 0.76, 0, 1.61],
    [119.7, -1.0, 1, 1.68],
    [134, 1.27, 1, 1.54],
    [151.1, -2.5, 0, 1.67],
    [178, -1.89, 1, 1.61],
    [208, 1.42, 0, 1.69],
    [221, -2.38, 1, 1.72]
  ];
  for (const [s, offset, backpack, h] of people) {
    const { p, angle } = route.at(s, offset),
      z = ground(p);
    if (Number.isFinite(z))
      inst.add(
        "street/prop/" + (backpack ? "backpack" : "bag"),
        p,
        z + 0.071,
        angle + (s % 2 > 1 ? 1.48 : -1.63),
        [0.54, 0.43, h],
        [["#484953", "#9b9684", "#67716a", "#6e6661"][Math.floor(s) % 4], "#52514f"]
      );
  }
  for (let s = 8; s < route.length - 2; s += 18.6) place("lid", s, Math.sin(s) * 1.02, [0.7, 0.7, 0.035], 0, 0.09);
  for (let s = 4; s < route.length - 2; s += 4.3)
    for (const d of [-2.64, 2.47]) place("drain", s, d, [0.27, 0.47, 0.026], -Math.PI / 2, 0.088);
}
