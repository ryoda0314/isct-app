import { STREET_SHOPS } from "./campus3dStreetCatalog.js";

// The first edge runs left to right as seen from the pavement. Positive local y
// runs into the shop. The same widths and furniture footprints drive walking and drawing.
export function streetFrame(front, project) {
  const [a, b] = front.coords.map(project);
  const dx = b[0] - a[0],
    dy = b[1] - a[1],
    length = Math.hypot(dx, dy);
  if (length < 1) return null;
  const c = dx / length,
    s = dy / length;
  return {
    width: Math.round(length * 100) / 100,
    angle: Math.atan2(s, c),
    point: (x, y) => [(a[0] + b[0]) / 2 + c * x - s * y, (a[1] + b[1]) / 2 + s * x + c * y]
  };
}

export const retailKinds = new Set([
  "convenience",
  "chemist",
  "grocery",
  "variety",
  "pottery",
  "music",
  "shoes",
  "appliances",
  "bakery",
  "gacha"
]);
export const foodKinds = new Set(["cafe", "grill", "ramen", "deli", "chicken", "curry", "dumpling", "kebab"]);

export function shopLayout(shop, width) {
  const half = width / 2;
  const open = [
    "kaldi",
    "sundrug",
    "marutaka",
    "cando",
    "nagano",
    "sakano",
    "suzuya",
    "coco",
    "basanta",
    "torikatsu"
  ].includes(shop.id);
  const hasStairs = ["familynorth", "livable", "cocoichi"].includes(shop.id);
  const stairWidth = shop.id === "familynorth" ? 1.59 : shop.id === "cocoichi" ? 1.18 : 1.27;
  const edge = half - (hasStairs ? Math.min(stairWidth, width * 0.225) : 0);
  const span = edge + half,
    center = (edge - half) / 2;
  const door = Math.min(shop.id === "basanta" ? 0.99 : shop.id === "cocoichi" ? 1.16 : 1.46, span - 0.4);
  const entryFraction =
    { basanta: 0.79, cocoichi: 0.24, familynorth: 0.48, cocopharmacy: 0.55, ohsho: 0.63 }[shop.id] ?? 0.63;
  const entry = Math.min(edge - door / 2 - 0.14, -half + span * entryFraction);
  const glass = [];
  if (!open && shop.kind !== "shutter") {
    for (const [l, r] of [
      [-half + 0.12, entry - door / 2],
      [entry + door / 2, edge - 0.12]
    ])
      if (r - l > 0.08) glass.push([l, r, 0.16, 0.23, 2.48]);
  }
  const fixtures = [];
  const place = (kind, x, y, w, d, h) => fixtures.push({ kind, x, y, w, d, h });
  if (shop.id === "kamio") {
    place("shutter", -half * 0.62, 0.21, half * 0.65, 0.13, 2.72);
    place("pier", -0.51, 0.12, 0.7, 0.49, 2.8);
  } else if (shop.kind === "shutter") {
    place("shutter", center, 0.2, span - 0.18, 0.13, 2.65);
  } else if (retailKinds.has(shop.kind)) {
    place("shelf", center, 2.89, span - 0.26, 0.54, shop.id === "kaldi" ? 2.31 : 1.82);
    if (span > 3.1) place("rack", -half + 0.63, open ? 0.02 : 1.18, Math.min(1.15, span * 0.26), 0.77, 1.15);
    if (span > 5.3) place("shelf", edge - 0.83, 1.92, 1.34, 0.45, 1.5);
    if (span > 4.05) place("shelf", -half + 0.42, 1.69, 0.65, 1.46, 1.52);
    if (shop.id === "kaldi" && span > 3.7) place("bin", edge - 0.59, 0.5, 0.94, 0.62, 0.87);
    if (span > 6.2) {
      for (let x = -half + 2.3; x < edge - 1.35; x += 2.29)
        if (Math.abs(x - entry) > 1.08) place("rack", x, 1.18, 1.12, 0.74, 1.2);
    }
  } else if (foodKinds.has(shop.kind)) {
    place("counter", center, 2.58, span - 0.28, 0.7, 1.05);
    if (span > 3.35) place("table", shop.id === "cocoichi" ? edge - 0.65 : -half + 0.68, 1.12, 0.83, 0.62, 0.72);
  } else if (shop.kind === "clothes" || shop.kind === "salon") {
    place(shop.kind === "salon" ? "salon" : "clothes", center, 2.72, span - 0.3, 0.54, 1.61);
    if (span > 4 && shop.kind === "clothes") place("clothes", -half + 0.7, 0.13, 1.12, 0.52, 1.32);
  } else {
    place(shop.kind === "realty" ? "listings" : "desk", center, 2.61, span - 0.3, 0.66, 0.94);
  }
  if (shop.id === "coco") {
    place("wireRack", 3.08, -0.18, 0.66, 2.72, 1.26);
    place("wireRack", -1.38, 0.26, 0.66, 1.69, 1.2);
  }
  return { half, edge, center, span, open, glass, fixtures, hasStairs, entry, doorWidth: door };
}

export function streetShopObstacles(feature, project, add) {
  for (const front of feature.shopfronts) {
    if (front.returnWall) continue;
    const frame = streetFrame(front, project),
      shop = STREET_SHOPS.get(front.shop);
    if (!frame || !shop) continue;
    const layout = shopLayout(shop, frame.width);
    const rect = (x0, x1, y0, y1, h) =>
      add([frame.point(x0, y0), frame.point(x1, y0), frame.point(x1, y1), frame.point(x0, y1)], h);
    for (const box of layout.glass) rect(...box);
    for (const { x, y, w, d, h } of layout.fixtures) rect(x - w / 2, x + w / 2, y - d / 2, y + d / 2, h);
    if (shop.id === "basanta")
      rect(-layout.half + 0.19, layout.entry - layout.doorWidth / 2 - 0.035, -0.03, 0.64, 1.14);
    if (shop.id === "kaldi") rect(layout.edge - 0.82, layout.edge - 0.04, -0.59, 0.04, 1.85);
    if (layout.hasStairs) rect(layout.edge, layout.half, 0.28, 3.19, 2.8);
  }
}
