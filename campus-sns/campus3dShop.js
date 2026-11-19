// 南4号館の店舗。包装・掲示は描き起こした共通の絵柄を、商品や額の個々の面に割り当てる。
export const SHOP_ATLAS = "sevenShop";
export const SHOP_PRINTS = {
  bankSign: 36, breakfast: 37, newArrival: 38, payment: 39, campusNews: 40, announcement: 41,
  eatIn: 42, science: 43, curry: 44, campusEvent: 45, visitorGuide: 46, notice: 47,
  checkout: 48, cafeScreen: 49, bankScreen: 50, copierScreen: 51, delivery: 52, cafe: 53, stripes: 54,
  noSmoking: 56, orderFlag: 57,
};
export const SHOP_STOCK = {
  stack: ["snacks", "stationery", "bakery"], cooler: ["drinks", "iceCream"], freezer: ["iceCream"], chiller: ["rice", "meals", "desserts"],
};

export function shopUV(tile) {
  const x = tile % 8, y = Math.floor(tile / 8), inset = 0.008;
  return [(x + inset) / 8, (y + inset) / 8, (x + 1 - inset) / 8, (y + 1 - inset) / 8];
}

export function shopFace(ctx, tile, face, normal) {
  if (!ctx.finishes) return;
  if (!ctx.finishes.has(SHOP_ATLAS)) ctx.finishes.set(SHOP_ATLAS, []);
  ctx.finishes.get(SHOP_ATLAS).push({ face, normal, uvRect: shopUV(tile), highlight: ctx.highlight || [0, 0, 0, 0] });
}

const labels = {
  snacks: [0, 1, 2, 3, 11, 15], stationery: [12, 13, 14, 3], bakery: [4, 5, 6, 7],
  noodles: [8, 9, 10], drinks: [16, 17, 18, 19, 20, 21, 22, 23],
  rice: [24, 25, 26, 27], meals: [28, 29, 30], desserts: [31, 30, 4], iceCream: [58, 59, 60, 61],
};
const edges = {
  snacks: "#caac78", stationery: "#c7d3d1", bakery: "#cdab79", noodles: "#e4d5ac",
  drinks: "#c4d8cf", rice: "#e0ded3", meals: "#55594e", desserts: "#e6d6bf", iceCream: "#d8d4c9",
};

// P(x, depth) measures from left to right facing the shelf, then from front to back.
export function shopRow(m, ctx, T, P, stock, x0, x1, z, clearance, level, seed) {
  const kind = stock === "bakery" && level > 3 ? "noodles" : stock;
  const variants = labels[kind];
  if (!variants || clearance < .045) return;
  const spacing = { drinks: .088, snacks: .155, stationery: .134, bakery: .19, noodles: .13, rice: .12, meals: .19, desserts: .16, iceCream: .105 }[kind];
  const count = Math.min(100, Math.floor((x1 - x0) / spacing));
  if (!count) return;
  const width = (x1 - x0) / count, a = P(0, 0), b = P(1, 0);
  const normal = [b[1] - a[1], a[0] - b[0], 0];
  const edge = T(edges[kind]), pale = T("#eae6d9"), rail = T("#e5e1d7");
  const draw = (face, n, color) => m.quad(face, n, color);
  for (let i = 0; i < count; i++) {
    const mix = (seed + level * 13 + i * 7) % 31;
    if (mix === 11 && count > 6) continue;
    const tile = variants[(seed + level * 5 + Math.floor(i / 3)) % variants.length];
    const cx = x0 + (i + .5) * width, radius = width * (.37 + .06 * mix / 31);
    const height = Math.min(clearance * .88, kind === "meals" || kind === "desserts" ? .095 : kind === "bakery" ? .135 : .23) * (.92 + .08 * mix / 31);
    const bottom = z + .007, top = bottom + height;
    const shoulder = kind === "rice" ? .24 : kind === "snacks" ? .90 : kind === "noodles" ? 1.04 : .97;
    const foot = kind === "noodles" ? .72 : .96;
    const front = .014 + .027 * mix / 31, rear = front + (kind === "meals" ? .16 : kind === "drinks" ? .065 : .09);
    const tilt = kind === "stationery" || kind === "snacks" ? .022 : 0;
    const A = [P(cx - radius * foot, front), bottom], B = [P(cx + radius * foot, front), bottom];
    const C = [P(cx + radius * shoulder, front + tilt), top], D = [P(cx - radius * shoulder, front + tilt), top];
    const E = [P(cx - radius * foot, rear), bottom], F = [P(cx + radius * foot, rear), bottom];
    const G = [P(cx + radius * shoulder, rear), top], H = [P(cx - radius * shoulder, rear), top];
    if (ctx.finishes) shopFace(ctx, tile, [A, B, C, D], normal);
    else draw([A, B, C, D], normal, edge);
    draw([A, D, H, E], [a[0] - b[0], a[1] - b[1], 0], edge);
    draw([B, F, G, C], [b[0] - a[0], b[1] - a[1], 0], edge);
    if (ctx.finishes && (kind === "meals" || kind === "desserts" || kind === "noodles" || kind === "bakery"))
      shopFace(ctx, tile, [D, C, G, H], [0, 0, 1]);
    else draw([D, C, G, H], [0, 0, 1], pale);
    if (kind === "drinks") {
      const R = radius * .48, depth = (front + rear) / 2, cap = top + Math.min(.03, clearance - height - .008);
      const shoulderFace = [[P(cx - R, depth - .017), cap], [P(cx + R, depth - .017), cap]];
      draw([D, C, shoulderFace[1], shoulderFace[0]], normal, pale);
      draw([shoulderFace[0], shoulderFace[1], [P(cx+R,depth+.017),cap], [P(cx-R,depth+.017),cap]], [0, 0, 1], T(tile === 16 ? "#58844c" : "#e3e4dd"));
    }
  }
  const shelf = [[P(x0, -.009), z-.034], [P(x1, -.009), z-.034], [P(x1, -.009), z], [P(x0, -.009), z]];
  draw(shelf, normal, rail);
  const tickets = Math.max(1, Math.round((x1 - x0) / .29));
  for (let j = 0; j < tickets; j++) {
    const x = x0 + (j+.5)*(x1-x0)/tickets, w = Math.min(.047,(x1-x0)/tickets*.44);
    shopFace(ctx, 32 + ((j + level) % 4), [[P(x-w,-.012),z-.034],[P(x+w,-.012),z-.034],[P(x+w,-.012),z],[P(x-w,-.012),z]], normal);
  }
}

// The painted circle follows the floor, including when approached from the opposite queue direction.
export function shopQueue(m, r, z, T, color = "#79364b") {
  const [a,b,,d] = r;
  const P = (u,v) => [a[0]+(b[0]-a[0])*u+(d[0]-a[0])*v, a[1]+(b[1]-a[1])*u+(d[1]-a[1])*v];
  const circle = rad => Array.from({ length: 32 }, (_,i) => P(.5+rad*Math.cos(i*Math.PI/16), .5+rad*Math.sin(i*Math.PI/16)));
  m.polygon([circle(.5)], z, [0,0,1], T("#f3f2e8"));
  m.polygon([circle(.42)], z+.001, [0,0,1], T(color));
  for (const u of [.34,.66]) {
    const shoe = [[-.054,-.24],[.051,-.22],[.084,-.10],[.054,.04],[-.049,.04],[-.085,-.11]];
    m.polygon([shoe.map(([x,y]) => P(u+x,.52+y))], z+.002, [0,0,1], T("#fff9ed"));
    m.polygon([[P(u-.049,.60),P(u+.054,.60),P(u+.038,.72),P(u-.039,.73)]], z+.002, [0,0,1], T("#fff9ed"));
  }
}
