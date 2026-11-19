import { addMarketArt } from "./campus3dMarketSigns.js";

export const MARKET_STYLES = {
  wallCase: ["cutFruit", "vegetables", "tofu", "meat", "milk", "dairy", "juice"],
  gondola: ["pantry", "seasoning", "household", "bottles", "bread", "snacks", "tea", "canned"],
  lowShelf: ["pantry", "snacks", "tea", "household", "bread", "cutFruit"],
  glassFreezer: ["frozen", "iceCups"],
  produce: ["oranges", "cabbage", "apples", "bananas", "cutFruit", "vegetables"],
  island: ["fish", "deli", "bread", "iceCups", "meat", "tofu", "sushi"],
  selfCheckout: [],
  payment: [],
  carts: [],
  ceilingPanel: [],
  flowers: [],
  prep: []
};

const shelfStock = {
  cutFruit: ["cutFruit", "tomatoPack", "grapes", "cutFruit"],
  vegetables: ["greens", "mushrooms", "leek", "carrots", "tomatoPack"],
  tofu: ["tofuPack", "eggPack", "tofuPack", "mushrooms"],
  meat: ["porkTray", "beefTray", "porkTray"],
  milk: ["milkCarton", "milkCarton", "yogurt", "juiceCarton"],
  dairy: ["yogurt", "milkCarton", "yogurt", "jar"],
  juice: ["juiceCarton", "petBottle", "teaBottle", "juiceCarton"],
  bottles: ["teaBottle", "petBottle", "juiceCarton", "can"],
  pantry: ["snackBag", "cereal", "can", "pastaBag", "teaBox", "jar"],
  seasoning: ["sauceBottle", "jar", "pastaBag", "can", "teaBox"],
  household: ["refill", "pump", "cereal", "refill"],
  frozen: ["frozenBox", "snackBag", "frozenBox", "iceTub"],
  oranges: ["orange", "orange", "apple"],
  apples: ["apple", "apple", "grapes"],
  cabbage: ["cabbage", "leek", "carrots", "cabbage"],
  bananas: ["banana", "banana", "orange"],
  bread: ["baguette", "croissant", "melonpan", "loaf"],
  fish: ["wholeFish", "salmonTray", "sushi", "wholeFish"],
  deli: ["bento", "croquettes", "sushi"],
  sushi: ["sushi", "salmonTray", "sushi"],
  iceCups: ["iceTub", "iceTub", "frozenBox"],
  snacks: ["snackBag", "cereal", "snackBag", "pastaBag"],
  tea: ["teaBox", "teaBottle", "teaBox", "jar"],
  canned: ["can", "jar", "can", "sauceBottle"]
};
// Nominal width, depth and height (m). The facing count is derived from the shelf width.
const packs = {
  milkCarton: [0.079, 0.078, 0.234],
  juiceCarton: [0.079, 0.073, 0.211],
  teaBottle: [0.08, 0.08, 0.236],
  petBottle: [0.079, 0.079, 0.221],
  sauceBottle: [0.07, 0.07, 0.187],
  jar: [0.077, 0.077, 0.112],
  can: [0.072, 0.072, 0.126],
  cereal: [0.132, 0.067, 0.234],
  teaBox: [0.113, 0.08, 0.155],
  pastaBag: [0.117, 0.076, 0.227],
  snackBag: [0.142, 0.089, 0.209],
  refill: [0.147, 0.09, 0.226],
  pump: [0.104, 0.087, 0.217],
  yogurt: [0.085, 0.085, 0.093],
  iceTub: [0.092, 0.092, 0.086],
  frozenBox: [0.145, 0.066, 0.196],
  tofuPack: [0.156, 0.115, 0.074],
  cutFruit: [0.169, 0.135, 0.084],
  eggPack: [0.199, 0.147, 0.084],
  tomatoPack: [0.156, 0.143, 0.079],
  mushrooms: [0.165, 0.135, 0.13],
  greens: [0.174, 0.265, 0.176],
  leek: [0.132, 0.377, 0.132],
  carrots: [0.15, 0.249, 0.109],
  orange: [0.084, 0.082, 0.081],
  apple: [0.088, 0.087, 0.094],
  cabbage: [0.205, 0.199, 0.197],
  banana: [0.205, 0.162, 0.117],
  grapes: [0.116, 0.16, 0.112],
  salmonTray: [0.222, 0.157, 0.069],
  beefTray: [0.234, 0.161, 0.066],
  porkTray: [0.228, 0.164, 0.066],
  wholeFish: [0.305, 0.131, 0.086],
  sushi: [0.201, 0.154, 0.083],
  bento: [0.209, 0.178, 0.084],
  croquettes: [0.186, 0.156, 0.082],
  baguette: [0.284, 0.085, 0.085],
  croissant: [0.137, 0.111, 0.084],
  melonpan: [0.12, 0.106, 0.079],
  loaf: [0.146, 0.222, 0.155]
};
const packColors = [
  ["#2e6594", "#92b7cf"],
  ["#954a36", "#d8ad52"],
  ["#386847", "#afc478"],
  ["#b97133", "#e5bd70"],
  ["#9b4748", "#edc49a"],
  ["#536e94", "#b3c1d0"],
  ["#71648b", "#b3a7c0"]
];
const natural = {
  orange: [
    ["#e99424", "#eebb46"],
    ["#eda537", "#f1b34c"]
  ],
  apple: [
    ["#ac4539", "#d26950"],
    ["#b94e3e", "#9f3e36"]
  ],
  banana: [["#e7bc45", "#f4ce58"]],
  cabbage: [
    ["#95ac73", "#b7c18a"],
    ["#a1b880", "#819c6e"]
  ],
  leek: [["#567b4c", "#95a958"]],
  greens: [["#446e3f", "#719351"]],
  carrots: [["#cd762f", "#dd8b40"]],
  grapes: [
    ["#735676", "#93798f"],
    ["#9aa967", "#b5bc86"]
  ],
  mushrooms: [["#b49d7b", "#e6d6b7"]],
  cutFruit: [
    ["#ecae46", "#df8255"],
    ["#d4c075", "#acae64"]
  ],
  tomatoPack: [["#c24f3a", "#a64235"]],
  eggPack: [["#e4c39b", "#efe3c7"]],
  tofuPack: [
    ["#ebe1bc", "#82a886"],
    ["#e6ddbd", "#719aae"]
  ],
  salmonTray: [["#dc8c6e", "#b56d54"]],
  wholeFish: [
    ["#5f8088", "#b8c9bb"],
    ["#647a76", "#c0c6ac"]
  ],
  beefTray: [["#a94c4b", "#ce8478"]],
  porkTray: [["#d19285", "#ecc6b4"]],
  sushi: [["#da8668", "#a94a41"]],
  bento: [["#ab723e", "#c2a74e"]],
  croquettes: [["#b48044", "#cc9b5d"]],
  baguette: [["#c89354", "#a77446"]],
  croissant: [["#c1874f", "#dfad6d"]],
  melonpan: [["#dbbd81", "#ad905f"]],
  loaf: [["#c99762", "#e3c998"]],
  milkCarton: [
    ["#325d89", "#a2b9b2"],
    ["#477c78", "#a7be8f"],
    ["#335c9e", "#a1bdd9"]
  ],
  yogurt: [
    ["#426892", "#899bb0"],
    ["#ab5260", "#c7908b"],
    ["#4c827d", "#97b4a3"]
  ],
  iceTub: [
    ["#803e45", "#ad7357"],
    ["#8d4042", "#b79158"],
    ["#607c60", "#97a76e"]
  ]
};
const random = (n) => {
  const x = Math.sin(n * 127.17 + 31.73) * 43758.5453;
  return x - Math.floor(x);
};
const priceNames = ["price198", "price298", "price158", "price398", "price128", "price248"];
const aisleLabels = {
  pantry: ["shelfNoodles", "shelfRice"],
  seasoning: ["shelfDressing", "shelfSauce", "shelfSpice"],
  canned: ["shelfCanned", "shelfSauce"],
  tea: ["shelfTea", "shelfCoffee"],
  bottles: ["shelfDrinks", "shelfTea"],
  snacks: ["shelfSnacks"],
  household: ["shelfHousehold"],
  bread: ["shelfBakery"]
};
const choose = (a, n) => a[((Math.floor(n) % a.length) + a.length) % a.length];

export function addMarketDownlight(m, ring, z, T) {
  const center = ring.reduce((p, q) => [p[0] + q[0] / ring.length, p[1] + q[1] / ring.length], [0, 0]);
  const radius = Math.hypot(ring[1][0] - ring[0][0], ring[1][1] - ring[0][1]) * 0.55;
  const at = (i, r) => [center[0] + r * Math.cos((i * Math.PI) / 10), center[1] + r * Math.sin((i * Math.PI) / 10)];
  for (let i = 0; i < 20; i++) {
    const a = at(i, radius),
      b = at(i + 1, radius),
      c = at(i + 1, radius * 0.78),
      d = at(i, radius * 0.78);
    m.quad(
      [
        [a, z],
        [b, z],
        [c, z],
        [d, z]
      ],
      [0, 0, -1],
      T("#b8bab0")
    );
    m.quad(
      [
        [d, z],
        [c, z],
        [at(i + 1, radius * 0.59), z + 0.021],
        [at(i, radius * 0.59), z + 0.021]
      ],
      [Math.cos((i * Math.PI) / 10), Math.sin((i * Math.PI) / 10), -0.4],
      T("#73766f")
    );
  }
  m.polygon([Array.from({ length: 20 }, (_, i) => at(i, radius * 0.6))], z + 0.021, [0, 0, -1], T("#fff9e3"));
}

export function addMarketFixture(m, it, frame, D, z0, z1, T, kit) {
  const { L, nf, u } = frame,
    H = z1 - z0,
    forward = -nf[1] * u[0] + nf[0] * u[1] > 0;
  const P = (x, y) => kit.P(forward ? x : L - x, y);
  const box = (a, b, c, d, lo, hi, color) => kit.box(forward ? a : L - b, forward ? b : L - a, c, d, lo, hi, color);
  const sheet = (a, b, y, lo, hi) => kit.glass(forward ? a : L - b, forward ? b : L - a, y, lo, hi);
  const glassTop = (a, b, front, back, lo, hi) =>
    kit.glassFace(
      [
        [P(a, front), lo],
        [P(b, front), lo],
        [P(b, back), hi],
        [P(a, back), hi]
      ],
      [0, 0, 1]
    );
  const bar = (x, y, z, X, Y, Z, r, col) => kit.bar([P(x, y), z], [P(X, Y), Z], r, col);
  const angle = Math.atan2(forward ? u[1] : -u[1], forward ? u[0] : -u[0]);
  const vertex = (x, y, z) => [P(x, y), z],
    face = (a, b, y, Y, lo, hi) => [vertex(a, y, lo), vertex(b, y, lo), vertex(b, Y, hi), vertex(a, Y, hi)];
  const white = T("#f1eee1"),
    steel = T("#aeb7b2"),
    body = T("#343a39"),
    oak = T("#b39a7c"),
    rim = T("#747a75"),
    led = T("#fff3d6");
  const seed = Math.floor(Math.abs(frame.a[0] * 173 + frame.a[1] * 61)),
    stock = kit.ctx.marketStock;
  const put = (name, x, y, z, w, d, h, yaw, colors, light = 1, behind = false) =>
    stock?.add(name, P(x, y), z, angle + yaw, [w, d, h], colors, light, behind);
  const tag = (x, y, z, yaw, idx, width = 0.1, height = 0.047) => {
    const promo = height > 0.056 || Math.floor(idx) % 7 === 0;
    put(
      choose(priceNames, idx),
      x,
      y,
      z,
      width,
      0.009,
      height,
      yaw,
      promo ? ["#9e3426", "#ca9648"] : ["#373c3d", "#a5aeaa"]
    );
  };
  function stockRow(names, a, b, y, depth, z, room, rowSeed, flipped = false, capDepth = 3) {
    const end = flipped ? -1 : 1;
    let x = a,
      group = 0;
    while (x < b - 0.047) {
      const s = rowSeed + group * 31,
        name = choose(names, Math.floor(random(s) * names.length)),
        dim = packs[name];
      const scale = 0.93 + 0.12 * random(s + 3),
        w = dim[0] * scale,
        d = dim[1] * scale,
        h = Math.min(dim[2] * scale, room - 0.015);
      const steps = Math.min(2 + Math.floor(random(s + 11) * 3), Math.floor((b - x) / (w + 0.008)));
      if (!steps) break;
      const colors = choose(natural[name] || packColors, Math.floor(random(s + 2) * 37));
      for (let i = 0; i < steps; i++) {
        const nx = x + w * 0.5 + i * (w + 0.008);
        const layers = Math.max(1, Math.min(capDepth, Math.floor((depth - 0.016) / (d + 0.012))));
        const skipFront = random(s + i * 7) > 0.946 && layers > 1;
        for (let j = skipFront ? 1 : 0; j < layers; j++) {
          const cy = y + end * (d * 0.5 + 0.012 + j * (d + 0.012));
          put(
            name,
            nx + (random(s + i * 9 + j) - 0.5) * 0.005,
            cy,
            z,
            w,
            d,
            h,
            (flipped ? Math.PI : 0) + (random(s + i * 13 + j * 7) - 0.5) * 0.067,
            colors,
            0.99 - j * 0.037,
            j > Number(skipFront)
          );
          if (h < room * 0.43 && j < 2 && name !== "mushrooms" && name !== "greens" && random(s + i * 53 + j) > 0.13)
            put(
              name,
              nx + 0.002,
              cy,
              z + h * 0.995,
              w,
              d,
              h,
              flipped ? Math.PI : 0,
              colors,
              0.99,
              j > Number(skipFront)
            );
        }
      }
      x += steps * (w + 0.008) + 0.012;
      group++;
    }
  }
  if (["gondola", "wallCase", "glassFreezer", "lowShelf"].includes(it.style)) {
    const double = it.style === "gondola",
      glazed = it.style === "glassFreezer",
      ambient = it.style === "lowShelf";
    const bays = Math.max(1, Math.round(L / (double || ambient ? 1.08 : 1.35)));
    const rows = ambient
      ? H < 1.18
        ? 3
        : 4
      : double && H >= 1.79 && it.stock !== "household" && it.stock !== "bread"
        ? 6
        : 5;
    const margin = double ? 0.25 : 0.027,
      start = margin,
      end = L - margin,
      step = (end - start) / bays;
    const base = z0 + (double ? 0.13 : 0.245),
      head = z1 - (double ? 0.059 : 0.145),
      pitch = (head - base) / rows;
    box(0.04, L - 0.04, 0.07, D - 0.06, z0 + 0.025, base - 0.035, body);
    box(0.017, L - 0.017, 0.025, D - 0.026, base - 0.058, base, glazed ? rim : white);
    box(
      start,
      end,
      double ? D * 0.477 : D - 0.082,
      double ? D * 0.523 : D - 0.016,
      base,
      head,
      double ? T("#605f58") : T("#b7c1be")
    );
    const shelfMetal = double ? T("#b9bcb5") : white,
      rail = double ? T("#444747") : rim;
    const warmEdge = double && ["seasoning", "snacks", "bread"].includes(it.stock);
    if (!double && !ambient) {
      box(0.008, L - 0.008, 0.025, D - 0.02, head, z1, body);
      box(0.015, L - 0.015, 0.015, 0.075, head - 0.013, head + 0.014, led);
      for (let x = 0.14; x < L - 0.08; x += 0.157) box(x, x + 0.057, 0.012, 0.023, z0 + 0.105, z0 + 0.12, rim);
    }
    for (let row = 0; row < rows; row++) {
      const lo = base + row * pitch,
        inset = (glazed ? 0.1 : 0.04) + (double ? 0.013 : 0.04) * row;
      box(start, end, inset, double ? D - inset : D - 0.072, lo, lo + 0.022, shelfMetal);
      for (let side = 0; side < (double ? 2 : 1); side++) {
        const y = side ? D - inset : inset,
          dir = side ? -1 : 1;
        box(start, end, y - 0.014, y + 0.013, lo - 0.029, lo + 0.016, rail);
        box(start + 0.01, end - 0.01, y - 0.016, y + 0.016, lo - 0.016, lo + 0.006, warmEdge ? T("#b08061") : white);
        for (let bay = 0; bay < bays; bay++) {
          const a = start + bay * step + 0.026,
            b = start + (bay + 1) * step - 0.026,
            s = seed + bay * 61 + row * 179 + side * 337;
          stockRow(
            shelfStock[it.stock] || shelfStock.pantry,
            a,
            b,
            y + dir * 0.026,
            (double ? D * 0.48 : D - 0.09) - inset,
            lo + 0.024,
            pitch - 0.016,
            s,
            Boolean(side),
            double ? 3 : 4
          );
          for (const f of double ? [0.12, 0.31, 0.52, 0.73, 0.91] : [0.2, 0.53, 0.82])
            tag(a + (b - a) * f, y - dir * 0.026, lo - 0.03, side * Math.PI, s + f * 100, 0.088, 0.041);
          if (row > 0)
            bar(
              a + 0.01,
              y + dir * 0.065,
              lo - 0.023,
              a + 0.01,
              side ? D * 0.5 : Math.min(D - 0.1, y + dir * 0.3),
              lo - 0.095,
              0.012,
              steel
            );
        }
      }
    }
    for (let i = 0; i <= bays; i++) {
      const x = Math.min(end - 0.026, start + i * step);
      box(x, x + 0.024, double ? D * 0.46 : D - 0.1, double ? D * 0.54 : D - 0.048, base, head, steel);
    }
    if (double) {
      for (const side of [0, 1]) {
        const cy = side ? D + 0.025 : -0.025,
          inside = side ? D - 0.095 : 0.095;
        for (let bay = 0; bay < bays; bay += 3) {
          const x = start + (bay + 0.4) * step,
            top = head - 0.11;
          const label = choose(aisleLabels[it.stock] || aisleLabels.pantry, seed + bay + side);
          bar(x, inside, top, x, cy + (side ? 0.075 : -0.075), top, 0.013, steel);
          put(label, x, cy, top - 0.56, 0.15, 0.014, 0.56, Math.PI / 2, ["#343636", "#f1eddd"]);
        }
        // The uppermost cans and bottles sit behind a low metal retainer.
        const z = base + (rows - 1) * pitch + 0.075,
          y = side ? D - 0.106 : 0.106;
        bar(start, y, z, end, y, z, 0.01, steel);
        for (let x = start + 0.05; x < end; x += step) bar(x, y, z - 0.065, x, y, z, 0.01, steel);
      }
      // Recessed shelves at both ends face into the cross aisles.
      for (const back of [false, true]) {
        const x = back ? L - 0.04 : 0.04,
          yaw = back ? Math.PI / 2 : -Math.PI / 2,
          dir = back ? -1 : 1;
        for (let row = 0; row < 4; row++) {
          const z = base + ((head - base) * row) / 4;
          box(back ? end : x, back ? x : start, 0.035, D - 0.035, z, z + 0.025, white);
          for (let col = 0; col < 5; col++) {
            const name = choose(shelfStock[it.stock], row + Math.floor(col / 2)),
              dim = packs[name];
            put(
              name,
              x + dir * (dim[1] / 2 + 0.02),
              0.09 + ((D - 0.18) * (col + 0.5)) / 5,
              z + 0.026,
              Math.min(dim[0], (D - 0.15) / 5),
              dim[1],
              Math.min(dim[2], 0.23),
              yaw,
              choose(natural[name] || packColors, row + (col % 2))
            );
          }
          tag(x - dir * 0.012, D * 0.5, z - 0.028, yaw, row, 0.104, 0.047);
        }
      }
    } else {
      for (const x of [0, L - 0.035]) box(x, x + 0.035, 0, D, base, head, body);
      if (ambient) box(0.005, L - 0.005, D - 0.095, D, head, z1, oak);
      if (glazed)
        for (let b = 0; b < bays; b++) {
          const a = (b * L) / bays,
            e = ((b + 1) * L) / bays;
          box(a, a + 0.031, -0.012, 0.043, base, head, steel);
          box(a, e, 0.002, 0.04, base, base + 0.034, steel);
          sheet(a + 0.031, e - 0.022, 0.009, base + 0.036, head - 0.018);
          for (const z of [z0 + 0.78, z0 + 1.22]) bar(e - 0.063, -0.01, z, e - 0.063, -0.076, z, 0.022, body);
          bar(e - 0.063, -0.076, z0 + 0.775, e - 0.063, -0.076, z0 + 1.23, 0.029, body);
        }
    }
    return;
  }
  if (it.style === "produce" || it.style === "island") {
    const fruit = it.style === "produce",
      bread = it.stock === "bread",
      ice = it.stock === "iceCups";
    const timber = fruit || bread || it.stock === "deli",
      base = z0 + H * (fruit ? 0.49 : ice ? 0.61 : 0.66);
    const corner = Math.min(0.149, D * 0.14),
      ring = (pad) =>
        [
          [corner, pad],
          [L - corner, pad],
          [L - pad, corner],
          [L - pad, D - corner],
          [L - corner, D - pad],
          [corner, D - pad],
          [pad, D - corner],
          [pad, corner]
        ].map((p) => P(...p));
    kit.prism(ring(0.055), z0 + 0.025, base, body);
    kit.prism(ring(0.029), z0 + 0.128, base - 0.04, timber ? oak : rim);
    kit.prism(ring(0.011), base - 0.052, base + 0.01, body);
    if (timber)
      for (let x = 0.15; x < L - 0.1; x += 0.32) box(x, x + 0.009, 0.023, 0.03, z0 + 0.135, base - 0.055, T("#927c65"));
    const bays = Math.max(1, Math.round(L / (fruit ? 0.75 : 0.81))),
      tiers = fruit || bread ? 2 : ice ? 1 : 2;
    const pool = shelfStock[it.stock] || shelfStock.deli;
    for (let t = 0; t < tiers; t++) {
      const y0 = 0.04 + (t * (D - 0.08)) / tiers,
        y1 = 0.04 + ((t + 1) * (D - 0.08)) / tiers;
      const z = base + 0.024 + (H - (base - z0)) * (ice ? 0.01 : (0.6 * t) / tiers),
        rise = fruit ? 0.07 : bread ? 0.035 : 0;
      box(0.035, L - 0.035, y0, y1, base, z, fruit ? T("#876947") : steel);
      if (rise) kit.ramp(face(0.034, L - 0.034, y0, y1, z, z + rise), fruit ? T("#ab8a61") : T("#ccb38d"));
      for (let b = 0; b < bays; b++) {
        const a = 0.042 + (b * (L - 0.084)) / bays,
          e = 0.042 + ((b + 1) * (L - 0.084)) / bays,
          s = seed + 17 * b + 81 * t;
        const name = choose(pool, b + 2 * t),
          dim = packs[name],
          colors = choose(natural[name] || packColors, s);
        box(a, a + 0.018, y0, y1, z, z + rise + 0.047, timber ? oak : steel);
        box(a, e, y0, y0 + 0.019, z, z + 0.043, timber ? oak : rim);
        const width = e - a - 0.055,
          dep = y1 - y0 - 0.049;
        const onIce = it.stock === "fish" && name !== "sushi";
        if (onIce) put("iceBed", (a + e) / 2, (y0 + y1) / 2, z + 0.002, width, dep, 0.046, 0, ["#d6e2df", "#eaf1ea"]);
        const nx = Math.max(1, Math.floor(width / (dim[0] * (fruit ? 0.94 : 1.02)))),
          ny = Math.max(1, Math.floor(dep / (dim[1] * (fruit ? 0.91 : 1.025))));
        for (let j = 0; j < ny; j++)
          for (let i = 0; i < nx; i++) {
            const variation = random(s + 113 * i + 29 * j),
              jitter = fruit ? 0.13 : bread ? 0.075 : 0.025;
            const px = a + 0.029 + ((i + 0.5 + (variation - 0.5) * jitter) * width) / nx;
            const py = y0 + 0.025 + ((j + 0.5 + (random(s + i * 27 + j * 3) - 0.5) * jitter) * dep) / ny;
            const h = z + (rise * (py - y0)) / (y1 - y0) + (onIce ? 0.037 : 0.004),
              yaw = (random(s + i * 21 + j * 7) - 0.5) * (fruit ? 0.74 : bread ? 0.38 : 0.19);
            if (!fruit && random(s + i * 7 + j * 19) > 0.965) continue;
            const w = Math.min(dim[0], (width / nx) * 1.035),
              d = Math.min(dim[1], (dep / ny) * 1.025);
            const size = fruit || bread ? 0.93 + 0.115 * variation : 1;
            const shades = natural[name] || [colors],
              piece = fruit ? choose(shades, variation > 0.7 ? s + 1 : s) : colors;
            put(name, px, py, h, w * size, d * size, dim[2] * size, yaw, piece, 0.96 + 0.075 * variation);
            const stacked =
              fruit && ["orange", "apple", "cabbage", "grapes"].includes(name) && i < nx - 1 && j < ny - 1;
            if (stacked && (name !== "cabbage" || j % 2 === 0))
              put(
                name,
                px + (width / nx) * 0.5,
                py + (dep / ny) * 0.5,
                h + dim[2] * 0.65,
                w * 0.98,
                d * 0.98,
                dim[2] * 0.98,
                yaw + 0.71,
                colors,
                1.02
              );
            if (ice && j % 3 !== 0) put(name, px, py, h + dim[2], w, d, dim[2], yaw + 0.4, colors);
          }
        tag((a + e) * 0.5, y0 - 0.038, z - 0.012, 0, s, 0.123, 0.06);
      }
    }
    if (fruit) {
      const top = z1 + 0.19;
      for (const x of [0.095, L - 0.095]) bar(x, D - 0.057, z1 - 0.25, x, D - 0.057, top, 0.022, steel);
      bar(0.09, D - 0.057, top, L - 0.09, D - 0.057, top, 0.024, steel);
      for (let b = 0; b < bays; b++) tag(((b + 0.5) * L) / bays, D - 0.075, top - 0.132, 0, seed + b, 0.235, 0.136);
    } else if (ice) {
      for (let b = 0; b < bays; b++) {
        const a = (b * L) / bays + 0.01,
          e = ((b + 1) * L) / bays - 0.01;
        glassTop(a, e, 0.025, D - 0.025, z1 - 0.025, z1 - 0.006);
        box(a, a + 0.023, 0.018, D - 0.014, z1 - 0.035, z1, steel);
        box(a + 0.06, a + 0.21, 0.065, 0.085, z1 - 0.004, z1 + 0.016, body);
      }
      box(0.014, L - 0.014, 0.012, 0.035, z1 - 0.04, z1, steel);
    } else if (!timber) {
      sheet(0.032, L - 0.032, 0.007, base + 0.012, it.stock === "fish" ? base + 0.15 : z1 + 0.015);
      if (it.stock === "fish") {
        const rail = T("#506166"),
          section = T("#465359");
        box(0.055, L - 0.055, 0.012, 0.037, z0 + 0.22, z0 + 0.251, steel);
        box(0.018, L - 0.018, D - 0.158, D - 0.012, z1 - 0.022, z1 + 0.029, rail);
        const spans = Math.max(2, Math.round(L / 1.34));
        for (let k = 0; k <= spans; k++) {
          const x = 0.047 + ((L - 0.094) * k) / spans;
          const curve = [
            [0.018, base + 0.107],
            [D * 0.14, base + 0.21],
            [D * 0.36, base + 0.287],
            [D * 0.65, base + 0.32],
            [D - 0.04, z1 + 0.039]
          ];
          for (let j = 1; j < curve.length; j++)
            bar(x, curve[j - 1][0], curve[j - 1][1], x, curve[j][0], curve[j][1], 0.035, section);
        }
        for (let k = 0; k < Math.floor(L / 0.36); k++)
          put("sauceBottle", 0.2 + k * 0.36, D - 0.092, z1 + 0.03, 0.055, 0.057, 0.136, 0, ["#ab5036", "#e5b353"]);
      }
    }
    return;
  }
  if (it.style === "prep") {
    // The display opening looks into a tiled workroom. The sink, oven cavities,
    // baking rails and extraction hood sit behind the serving sill.
    const back = D - 0.06,
      work = z0 + 0.89,
      black = T("#414747"),
      tile = T("#e8e5da");
    box(0.02, L - 0.02, D - 0.1, D, z0, z1, tile);
    for (let z = z0 + 0.16; z < z1 - 0.04; z += 0.21) box(0.02, L - 0.02, D - 0.112, D - 0.098, z, z + 0.007, steel);
    for (let x = 0.17; x < L; x += 0.36) box(x, x + 0.006, D - 0.113, D - 0.099, z0 + 0.15, z1 - 0.02, steel);
    const table = (a, b, y, d, h) => {
      box(a, b, y, y + d, h - 0.058, h, steel);
      for (const x of [a + 0.036, b - 0.036])
        for (const dep of [y + 0.04, y + d - 0.04]) bar(x, dep, z0 + 0.04, x, dep, h - 0.03, 0.036, rim);
      box(a + 0.022, b - 0.022, y + 0.035, y + d - 0.035, z0 + 0.25, z0 + 0.278, steel);
    };
    table(0.12, L * 0.26, 0.5, 0.72, work);
    table(L * 0.31, L * 0.61, 0.56, 0.68, work);
    for (let i = 0; i < 2; i++) {
      const x = 0.27 + i * 0.53,
        y = 0.62;
      box(x, x + 0.42, y, y + 0.38, work, work + 0.019, body);
      for (const v of [y, y + 0.36]) box(x - 0.012, x + 0.434, v, v + 0.024, work + 0.016, work + 0.031, steel);
      bar(x + 0.23, y + 0.41, work, x + 0.23, y + 0.41, work + 0.3, 0.023, steel);
      bar(x + 0.23, y + 0.41, work + 0.3, x + 0.23, y + 0.21, work + 0.3, 0.024, steel);
      bar(x + 0.23, y + 0.21, work + 0.3, x + 0.23, y + 0.21, work + 0.245, 0.025, steel);
    }
    for (const z of [work + 0.54, work + 1.0]) {
      box(0.14, L * 0.6, back - 0.43, back, z, z + 0.033, steel);
      for (let i = 0; i < 7; i++) {
        const x = 0.28 + i * 0.34;
        if (i % 3 === 0) {
          box(x, x + 0.26, back - 0.35, back - 0.08, z + 0.034, z + 0.26, white);
          box(x - 0.01, x + 0.27, back - 0.36, back - 0.07, z + 0.26, z + 0.284, rim);
        } else put(i % 2 ? "jar" : "loaf", x, back - 0.22, z + 0.037, 0.19, 0.19, 0.19, 0, ["#a28b68", "#d5ad65"]);
      }
    }
    for (let level = 0; level < 2; level++) {
      const x = L * 0.65,
        e = L * 0.89,
        lo = z0 + 0.27 + level * 0.66;
      box(x, e, 0.46, back, lo, lo + 0.64, steel);
      box(x + 0.054, e - 0.15, 0.44, 0.47, lo + 0.082, lo + 0.52, black);
      for (let j = 0; j < 3; j++)
        box(x + 0.1, e - 0.19, 0.422, 0.443, lo + 0.13 + j * 0.125, lo + 0.141 + j * 0.125, steel);
      bar(x + 0.1, 0.365, lo + 0.55, e - 0.17, 0.365, lo + 0.55, 0.033, rim);
      for (let j = 0; j < 3; j++)
        box(e - 0.113, e - 0.047, 0.423, 0.454, lo + 0.17 + j * 0.102, lo + 0.203 + j * 0.102, body);
    }
    box(L * 0.6, L * 0.95, 0.32, back, z0 + 1.91, z0 + 2.04, steel);
    for (let i = 0; i < 17; i++) {
      const x = L * 0.61 + i * L * 0.019;
      box(x, x + 0.028, 0.4, back - 0.08, z0 + 1.885, z0 + 1.91, rim);
    }
    for (let i = 0; i < 5; i++)
      put("baguette", L * 0.34 + i * 0.34, 0.89, work + 0.004, 0.26, 0.09, 0.09, 0.14, ["#be935e", "#d4b57c"]);
    return;
  }
  if (it.style === "flowers") {
    for (let i = 0; i < 4; i++)
      for (let j = 0; j < 2; j++)
        put(
          "bouquet",
          (L * (i + 0.5)) / 4,
          (D * (j + 0.5)) / 2,
          z0,
          L * 0.22,
          D * 0.42,
          H * (0.78 + 0.17 * random(i + seed)),
          random(j + 7 * i),
          choose(
            [
              ["#b95f77", "#ead8aa"],
              ["#bc874b", "#dec569"],
              ["#b07c9f", "#e2c3c8"]
            ],
            i + j
          )
        );
    return;
  }
  if (it.style === "selfCheckout" || it.style === "payment") {
    const deck = z0 + H * 0.49,
      black = T("#282e2e"),
      purple = T("#785372");
    box(0.019, L * 0.6, 0.08, D - 0.026, z0 + 0.05, deck, black);
    box(L * 0.6, L - 0.036, 0.105, D - 0.069, z0 + 0.07, deck - 0.075, T("#a9aea7"));
    box(0.01, L - 0.01, 0.029, D, deck - 0.047, deck, white);
    box(L * 0.62, L - 0.032, 0.052, D - 0.069, deck, deck + 0.015, steel);
    for (let k = 0; k < 6; k++)
      box(L * 0.65, L - 0.055, D * (0.15 + k * 0.09), D * (0.15 + k * 0.09) + 0.008, deck + 0.014, deck + 0.019, rim);
    const monLo = deck + 0.18,
      monHi = z0 + H * 0.91,
      y0 = D * 0.45,
      y1 = D * 0.55;
    bar(L * 0.29, D * 0.59, deck, L * 0.29, D * 0.59, monHi - 0.14, 0.06, steel);
    box(L * 0.048, L * 0.57, y1, y1 + 0.064, monLo, monHi, black);
    kit.ramp(face(L * 0.047, L * 0.568, y0, y1, monLo, monHi), black);
    addMarketArt(
      m,
      "terminalScreen",
      face(L * 0.074, L * 0.542, y0 - 0.004, y1 - 0.004, monLo + 0.024, monHi - 0.024),
      [...nf, 0],
      kit.ctx.tint
    );
    box(0.038, L * 0.44, 0.065, D * 0.33, deck, deck + 0.035, rim);
    box(0.062, L * 0.4, 0.075, D * 0.3, deck + 0.035, deck + 0.044, black);
    box(0.084, L * 0.37, 0.088, 0.1, deck + 0.044, deck + 0.047, T("#a65141"));
    box(L * 0.46, L * 0.6, D * 0.17, D * 0.36, deck, deck + 0.097, black);
    for (let r = 0; r < 3; r++)
      for (let k = 0; k < 3; k++)
        box(
          L * (0.47 + k * 0.038),
          L * (0.49 + k * 0.038),
          D * (0.19 + r * 0.042),
          D * (0.215 + r * 0.042),
          deck + 0.098,
          deck + 0.104,
          steel
        );
    box(0.05, L * 0.33, 0.071, 0.084, deck - 0.127, deck - 0.101, rim);
    box(0.061, L * 0.3, 0.067, 0.071, deck - 0.119, deck - 0.11, black);
    box(L * 0.73, L * 0.96, 0.102, 0.115, deck - 0.25, deck - 0.19, black);
    const top = z1 + 0.45;
    bar(L - 0.119, D - 0.1, deck, L - 0.119, D - 0.1, top - 0.08, 0.023, steel);
    box(L - 0.239, L + 0.005, D - 0.124, D - 0.072, top - 0.24, top, purple);
    addMarketArt(
      m,
      "lane" + (it.n || 1),
      face(L - 0.226, L - 0.008, D - 0.129, D - 0.129, top - 0.215, top - 0.027),
      [...nf, 0],
      kit.ctx.tint
    );
    return;
  }
  if (it.style === "carts") {
    const count = Math.max(1, Math.min(10, Math.floor((L - 0.46) / 0.21)));
    for (let i = 0; i < count; i++) {
      const a = 0.039 + (i * (L - 0.68)) / Math.max(1, count - 1),
        b = a + 0.56;
      for (const y of [0.052, D - 0.052]) {
        bar(a, y, z0 + 0.16, b, y, z0 + 0.14, 0.029, steel);
        bar(a, y, z0 + 0.16, a + 0.065, y, z0 + H * 0.96, 0.026, steel);
        bar(a + 0.065, y, z0 + 0.91 * H, b, y, z0 + 0.8 * H, 0.022, steel);
        bar(a + 0.09, y, z0 + 0.47 * H, b - 0.049, y, z0 + 0.49 * H, 0.02, steel);
        bar(b - 0.049, y, z0 + 0.49 * H, b, y, z0 + 0.8 * H, 0.019, steel);
        for (let k = 1; k <= 5; k++)
          bar(
            a + 0.061 + k * 0.077,
            y,
            z0 + 0.47 * H,
            a + 0.061 + k * 0.081,
            y,
            z0 + H * (0.9 - k * 0.016),
            0.011,
            steel
          );
        for (const cx of [a, b - 0.03]) {
          box(cx - 0.036, cx + 0.036, y - 0.022, y + 0.022, z0 + 0.015, z0 + 0.108, body);
          bar(cx, y, z0 + 0.09, cx + 0.02, y, z0 + 0.16, 0.022, steel);
        }
      }
      for (let k = 0; k < 6; k++) {
        const y = 0.06 + (k * (D - 0.12)) / 5;
        bar(b - 0.049, y, z0 + 0.49 * H, b, y, z0 + 0.8 * H, 0.011, steel);
      }
      bar(a + 0.065, 0.032, z0 + 0.96 * H, a + 0.065, D - 0.032, z0 + 0.96 * H, 0.034, T("#9d7158"));
      bar(b, 0.054, z0 + 0.8 * H, b, D - 0.054, z0 + 0.8 * H, 0.019, steel);
    }
    return;
  }
  if (it.style === "ceilingPanel") {
    box(0, L, 0, D, z0 + 0.003, z1, oak);
    addMarketArt(
      m,
      "ceilingFlorals",
      [vertex(0, 0, z0), vertex(L, 0, z0), vertex(L, D, z0), vertex(0, D, z0)],
      [0, 0, -1],
      kit.ctx.tint
    );
  }
}
