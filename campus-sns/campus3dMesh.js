// 手で足した構造物（campus3dFeatures.js）を、3Dレイヤー（campus3dLayer.js）で描く三角形にする。
// 位置はメルカトル座標の「キャンパスの中心からの差 × MERC_SCALE」と標高(m)。float32 でも桁が落ちないように中心からの差で持つ
import earcut from "earcut";
import { CAMPUS_CENTER } from "./hooks/useLocationSharing.js";
import { BOARD_BASE_DROP, BOARD_T, DECK_FASCIA, DECK_POST, WALL_CAP, WALL_T, buildingOpenings, cumulative, curbWidth, railGround, signFrame, buildingRoof, buildingSoffit, clipHalf, offsetRingBy, densify, edgeOpen, isOpenStairs, lerpAlong, offsetLine, pointInRing, ringArea, roofPieces, roofRisers, stairSteps, stairsOpening, stripDistance, terraceLid, toLngLat, toXY, vertexElevations } from "./campus3dFeatures.js";
import { SURFACE_KINDS, SURFACE_ORDER } from "./campus3dPaint.js";

export const MERC_SCALE = 2 ** 20;
const DEG = Math.PI / 180;
const mercX = (lng) => (lng + 180) / 360;
const mercY = (lat) => {
  const s = Math.sin(lat * DEG);
  return 0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI);
};
export const ORIGIN = [mercX(CAMPUS_CENTER.lng), mercY(CAMPUS_CENTER.lat)];

// 平面の m 座標 → 描く座標の x, y（標高 z はそのまま m）
export function worldOf(xy) {
  const [lng, lat] = toLngLat(xy);
  return [(mercX(lng) - ORIGIN[0]) * MERC_SCALE, (mercY(lat) - ORIGIN[1]) * MERC_SCALE];
}

const rgba = (hex, a = 1) => {
  const n = parseInt(hex.slice(1, 7), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255, a];
};
const mix = (a, b, t) => [0, 1, 2, 3].map((k) => a[k] + (b[k] - a[k]) * t);

// 3Dで足す構造物の色（建物と同じ光の当て方で、側面は暗くなる）
const COLORS = {
  light: {
    wall: "#dfe4e9", deckSide: "#d3dbe3", railing: "#c3ccd5", pier: "#c9d2db", ceiling: "#d5dce3", stairs: "#eceff2", bridgeDeck: "#b5b3ae", // 橋の木の床：上から光が当たって明るくなるぶん、路面の木の床（#bab8b3）より少し暗く
    // 階段の材質（material）：木（Taki Plaza の明かり取りの大階段＝雨にさらされた灰色がかった木）・石
    // 木（葉は形の種類ごと）・生け垣・屋上の緑・ガラス（下は暗く、上は空を映して明るく）と窓の桟・緑の屋上の軒
    trunk: "#6e5f52", leafBroad: "#6a8c48", leafRound: "#5c8040", leafGinkgo: "#a3b24e", leafConifer: "#45653e", hedge: "#5d7d42",
    roofGreen: "#7a9556", glassLo: "#5b6f7e", glassHi: "#a2b6c4", mullion: "#3b434a", eaveDark: "#4b4f54",
    stairsWood: "#ada392", stairsStone: "#c9c6bf", stairsBrick: "#68655f", // 階段の材質：木・石・れんが（灰色の炻器質れんが）
    // 段々の屋根（緑の屋上）：段の板（雨にさらされた灰色の木。動画の色）と、段の境目の暗い蹴上げ
    roofDeck: "#bebbb5", roofRiser: "#55524d",
    // 平地の壁の面（faces）：すりガラス（下・上）・扉のガラス・アルミの枠・白いれんがと目地
    frostLo: "#bccac7", frostHi: "#dce4e2", doorGlass: "#46535d", frame: "#9ba3aa", brick: "#e3e0d9", brickLine: "#cdc8bf",
    // 建物の窓（windows）：奥の暗いガラス・見込みの影・格子・扉の板・小さなひさし（下・上）
    winDark: "#2c3238", winReveal: "#9a9fa4", grille: "#8d949b", doorPanel: "#e9eaea", canopy: "#3d4247", canopyTop: "#6b7076",
    // 建物の材質（material）：ステンレスの筒（vaults。空を映す横向きは明るく、地面を映す下向きは暗い）とパネルの目地・さびた鉄・
    // 穴あきの金属板・鉄骨の外階段（白く塗った鋼）・格子の床
    steelHi: "#c9cdd2", steelLo: "#5e646b", steelLine: "#4c5258", rust: "#7b4c33", perforated: "#b7bcc1", frameSteel: "#d0d4d8", grating: "#5b6168",
    dome: "#eef1f3", // 屋根の丸い天窓（乳白色）
    // 信号機（柱・灯の箱・消えた灯・点いた赤と青）・ガードパイプ・壁の文字（ステンレス）
    signalPole: "#5c5650", signalBox: "#3e4145", signalOff: "#4d5257", lampRed: "#ff3a2c", lampGreen: "#12d48a", rail: "#d2d6da", letter: "#c4c9ce",
    // 太陽光パネル（屋根・ルーバーの南の面）とその目地・屋根のふちの笠木・アルミのルーバー・白い鋼の柱・ガラスの手すり
    solar: "#4d5b70", solarLine: "#97a2b2", parapet: "#dfe3e6", fin: "#d3d8dc", member: "#f1f2f3", glassRail: "#b9cdd6", fritWhite: "#e8edf0",
    // 建物の材質のこげ茶のれんが・白っぽい石（ガラスの手すりの下の縁石も）・壁面緑化（植物で覆った壁）
    darkBrick: "#5e4b44", stone: "#d8d2c5", greenWall: "#64824a", redPanel: "#c23b33", // 赤い板（日よけ・屋上の看板の塔）
    concrete: "#a9a8a3", // 打ち放しのコンクリート
    // 格子のスクリーン（trellis）の鋼・プランター・つる草（3 色）、看板の印（マクドナルドの黄・東急の赤）
    trellis: "#5d6268", planter: "#8e8f8a", vine1: "#5e7c38", vine2: "#7a9142", vine3: "#a7a04a", mcdYellow: "#ffbc0d", tokyuRed: "#e84a2e",
    // 看板：ステンレスの箱（面・側面）と暗い文字、白い板と薄い灰色の文字
    signFace: "#d4d9dd", signSide: "#a9b0b6", signText: "#30353a", plateFace: "#f3f4f5", plateText: "#c3c8cd", signDark: "#26282b", // 黒い板（店の看板）
    signSwoosh: "#f5f7f9", plateSwoosh: "#dce0e4", // 校章のまん中の明るい帯
    noticeGreen: "#4fa83e", // お知らせの看板（notice）の緑の帯
    // ウッドデッキの縁（木の板・奥の暗いすき間・灰色の束）・クロスの柵（亜鉛めっきの鋼）・ベンチの木・サクラの幹と葉
    deckFace: "#8f8478", deckGap: "#3b3833", deckPost: "#9a9c9a", xbrace: "#a7adb2", benchWood: "#8a7766",
    barkCherry: "#4b4039", leafCherry: "#7f8f4f",
  },
  dark: {
    wall: "#353d47", deckSide: "#2c333c", railing: "#4a5460", pier: "#2a3139", ceiling: "#20252c", stairs: "#3b424c", bridgeDeck: "#44423d",
    stairsWood: "#3a3631", stairsStone: "#46474b", stairsBrick: "#34353a",
    trunk: "#26211d", leafBroad: "#1e2a1a", leafRound: "#1b2619", leafGinkgo: "#2f3420", leafConifer: "#162016", hedge: "#1b2617",
    roofGreen: "#222c1d", glassLo: "#7d6a47", glassHi: "#a88f5e", mullion: "#15191d", eaveDark: "#1a1c1f",
    roofDeck: "#34322e", roofRiser: "#17181a",
    frostLo: "#857659", frostHi: "#9c8b68", doorGlass: "#6b5a3c", frame: "#1f2328", brick: "#383b40", brickLine: "#2b2e32",
    winDark: "#0e1012", winReveal: "#24272b", grille: "#30353a", doorPanel: "#3f454c", canopy: "#141619", canopyTop: "#25282c",
    steelHi: "#4b525c", steelLo: "#22272e", steelLine: "#171a1f", rust: "#2f231c", perforated: "#3a4048", frameSteel: "#414953", grating: "#1c2025",
    dome: "#59616b",
    signalPole: "#2a2826", signalBox: "#1b1d20", signalOff: "#24272a", lampRed: "#ff4a36", lampGreen: "#23f0a0", rail: "#5a6168", letter: "#6c737b",
    solar: "#151a24", solarLine: "#2c333d", parapet: "#4a525c", fin: "#4b535d", member: "#5d656f", glassRail: "#3d4e57", fritWhite: "#9a8c70",
    darkBrick: "#2a2320", stone: "#4f4c46", greenWall: "#1d2a18", redPanel: "#5a1f1b", concrete: "#3f4043",
    trellis: "#26292c", planter: "#323331", vine1: "#1d2814", vine2: "#253019", vine3: "#33321a", mcdYellow: "#6b5208", tokyuRed: "#5c1f15",
    signFace: "#4a5159", signSide: "#353b42", signText: "#15181b", plateFace: "#5a6168", plateText: "#454b52", signDark: "#101113",
    signSwoosh: "#6c747d", plateSwoosh: "#50575e",
    noticeGreen: "#21401c",
    deckFace: "#34312d", deckGap: "#121110", deckPost: "#3a3c3d", xbrace: "#454b51", benchWood: "#302a25",
    barkCherry: "#1d1916", leafCherry: "#20291a",
  },
};

// 建物の材質（material）の色の名前
const MATERIAL_COLOR = { rust: "rust", perforated: "perforated", steel: "steelHi", darkbrick: "darkBrick", stone: "stone", green: "greenWall", red: "redPanel", concrete: "concrete" };

// 三角形の並び（位置・法線・色）。電車（campus3dTrains.js）も使う
export class Mesh {
  constructor() {
    this.pos = [];
    this.nrm = [];
    this.col = [];
  }

  // xy は平面の m 座標、z は標高(m)、n は法線（東・北・上）
  vert(xy, z, n, c) {
    const [x, y] = worldOf(xy);
    this.pos.push(x, y, z);
    this.nrm.push(n[0], -n[1], n[2]); // 描く側は y が南向き
    this.col.push(c[0], c[1], c[2], c[3]);
  }

  // 四角形 [[xy, z] × 4]。n を省くと面の向きから求める（上向きにそろえる）
  quad(p, n, c) {
    let nn = n;
    if (!nn) {
      const [a, b, d] = [p[0], p[1], p[3]];
      const u = [b[0][0] - a[0][0], b[0][1] - a[0][1], b[1] - a[1]];
      const v = [d[0][0] - a[0][0], d[0][1] - a[0][1], d[1] - a[1]];
      nn = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
      const l = Math.hypot(...nn) || 1;
      nn = nn.map((k) => k / l);
      if (nn[2] < 0) nn = nn.map((k) => -k);
    }
    [0, 1, 2, 0, 2, 3].forEach((k) => this.vert(p[k][0], p[k][1], nn, c));
  }

  // 四角形を、角ごとの色 cs（4つ）で
  quadColors(p, n, cs) {
    [0, 1, 2, 0, 2, 3].forEach((k) => this.vert(p[k][0], p[k][1], n, cs[k]));
  }

  // 折れ線に沿った角柱。L・R は左右の線、bot・top は各点の下と上の標高
  prism(L, R, bot, top, col, { bottom = false, caps = true } = {}) {
    const n = L.length;
    for (let i = 0; i < n - 1; i++) {
      this.quad([[L[i], top[i]], [R[i], top[i]], [R[i + 1], top[i + 1]], [L[i + 1], top[i + 1]]], null, col.top);
      if (bottom) this.quad([[L[i], bot[i]], [R[i], bot[i]], [R[i + 1], bot[i + 1]], [L[i + 1], bot[i + 1]]], [0, 0, -1], col.bottom || col.side);
      const sideN = (A, B, sgn) => {
        const dx = B[0] - A[0];
        const dy = B[1] - A[1];
        const l = Math.hypot(dx, dy) || 1;
        return [(-dy / l) * sgn, (dx / l) * sgn, 0];
      };
      this.quad([[L[i], bot[i]], [L[i + 1], bot[i + 1]], [L[i + 1], top[i + 1]], [L[i], top[i]]], sideN(L[i], L[i + 1], 1), col.side);
      this.quad([[R[i + 1], bot[i + 1]], [R[i], bot[i]], [R[i], top[i]], [R[i + 1], top[i + 1]]], sideN(R[i], R[i + 1], -1), col.side);
    }
    if (caps && n > 1) {
      const cap = (i, j) => {
        const dx = L[i][0] - L[j][0] + R[i][0] - R[j][0];
        const dy = L[i][1] - L[j][1] + R[i][1] - R[j][1];
        const l = Math.hypot(dx, dy) || 1;
        this.quad([[L[i], bot[i]], [R[i], bot[i]], [R[i], top[i]], [L[i], top[i]]], [dx / l, dy / l, 0], col.side);
      };
      cap(0, 1);
      cap(n - 1, n - 2);
    }
  }

  // 平面の多角形（[[xy...], 穴...]）を高さ z に張る（z は数か、点 xy → 標高 の関数＝傾いた平面）
  polygon(rings, z, n, c) {
    const zf = typeof z === "function" ? z : () => z;
    const flat = [];
    const holes = [];
    rings.forEach((ring, k) => {
      const pts = ring.length > 1 && ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1] ? ring.slice(0, -1) : ring;
      if (k) holes.push(flat.length / 2);
      pts.forEach((p) => flat.push(p[0], p[1]));
    });
    const idx = earcut(flat, holes, 2);
    for (const i of idx) {
      const p = [flat[i * 2], flat[i * 2 + 1]];
      this.vert(p, zf(p), n, c);
    }
  }

  result() {
    return { pos: new Float32Array(this.pos), nrm: new Float32Array(this.nrm), col: new Float32Array(this.col), count: this.pos.length / 3 };
  }
}

// 光のにじみ（足し算で重ねる。campus3dLayer.js の VS_GLOW）。いつも画面に向く丸（灯具・前照灯）と、地面に置く四角
// （前照灯が線路に落とす光・窓あかり）。位置は描く座標（worldOf）と標高 m
export class GlowMesh {
  constructor() {
    this.pos = [];
    this.bill = []; // 丸の角（画面の右・上へ m）、カメラへ寄せる m、画面で少なくとも何 px の半径にするか
    this.uv = []; // 明るさの形の座標と、形の種類（0 丸、1 前照灯の帯、2 窓あかりの帯）
    this.col = []; // 光の色 × 強さ
  }

  // w を中心に半径 r m の丸。pull はカメラへ寄せる m（灯具や車体の面に半分隠れないように）
  sprite(w, r, c, minPx = 0, pull = 0) {
    for (const [u, v] of [[-1, -1], [1, -1], [1, 1], [-1, -1], [1, 1], [-1, 1]]) {
      this.pos.push(w[0], w[1], w[2]);
      this.bill.push(u * r, v * r, pull, minPx);
      this.uv.push(u, v, 0);
      this.col.push(c[0], c[1], c[2]);
    }
  }

  // 四角 p（[x, y, z] × 4）。uv は角ごとの形の座標、shape は形の種類
  quad(p, uv, shape, c) {
    for (const k of [0, 1, 2, 0, 2, 3]) {
      this.pos.push(p[k][0], p[k][1], p[k][2]);
      this.bill.push(0, 0, 0, 0);
      this.uv.push(uv[k][0], uv[k][1], shape);
      this.col.push(c[0], c[1], c[2]);
    }
  }

  result() {
    return { pos: new Float32Array(this.pos), bill: new Float32Array(this.bill), uv: new Float32Array(this.uv), col: new Float32Array(this.col), count: this.pos.length / 3 };
  }
}

const finite = (a) => a.every(Number.isFinite);
// 中心線から a m と b m ずらした2本の線を、左（進む向きの左）・右の順にして返す（側面の向きをそろえるため）。
// a・b は数か、点ごとの数の並び（だんだん広がる帯）
const band = (pts, a, b) => {
  if (!Array.isArray(a) && !Array.isArray(b)) return [offsetLine(pts, Math.max(a, b)), offsetLine(pts, Math.min(a, b))];
  const av = Array.isArray(a) ? a : pts.map(() => a);
  const bv = Array.isArray(b) ? b : pts.map(() => b);
  return [offsetLine(pts, av.map((v, i) => Math.max(v, bv[i]))), offsetLine(pts, av.map((v, i) => Math.min(v, bv[i])))];
};
// 中心線を細かくした点（距離 s）ごとの、帯と土台の半幅と、帯の中心のずれ（左へ m）
const halfWidths = (sl, s) => ({
  hw: s.map((v) => lerpAlong(sl.cum, sl.hwv, v)),
  hb: s.map((v) => lerpAlong(sl.cum, sl.hbv, v)),
  c: s.map((v) => lerpAlong(sl.cum, sl.cv, v)),
});

// ── 木・生け垣 ──
// 決まった並びの乱数（同じ木はいつも同じ形）
const hashStr = (str) => {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
};
const seeded = (seed) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
// 正二十面体（20面）と、それを1回分けた球（80面）。葉の塊に使う
const icosphere = (splits) => {
  const t = (1 + Math.sqrt(5)) / 2;
  const v = [];
  const add = (p) => {
    const l = Math.hypot(...p);
    v.push(p.map((k) => k / l));
    return v.length - 1;
  };
  [[-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0], [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t], [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1]].forEach(add);
  let f = [[0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8], [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]];
  for (let s = 0; s < splits; s++) {
    const mid = new Map();
    const m = (a, b) => {
      const k = a < b ? a * 1000 + b : b * 1000 + a;
      if (!mid.has(k)) mid.set(k, add(v[a].map((x, i) => x + v[b][i])));
      return mid.get(k);
    };
    f = f.flatMap(([a, b, c]) => {
      const ab = m(a, b);
      const bc = m(b, c);
      const ca = m(c, a);
      return [[a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]];
    });
  }
  return { v, f };
};
const ICO1 = icosphere(1);
const ICO0 = icosphere(0);

// 葉の塊：中心 c（[x, y, 標高]）・半径 r（[東西, 南北, 上下]）のでこぼこの楕円体。shade(標高) で色を暗くする（塊の下・木の下のほう）
function addBlob(m, c, r, col, rnd, { lump = 0.14, shade = () => 1, sphere = ICO1 } = {}) {
  const k = sphere.v.map(() => 1 + (rnd() - 0.5) * 2 * lump);
  const P = sphere.v.map((u, i) => [c[0] + u[0] * r[0] * k[i], c[1] + u[1] * r[1] * k[i], c[2] + u[2] * r[2] * k[i]]);
  const N = sphere.v.map((u) => {
    const n = [u[0] / r[0], u[1] / r[1], u[2] / r[2]];
    const l = Math.hypot(...n) || 1;
    return n.map((q) => q / l);
  });
  const C = P.map((p) => {
    const s = shade(p[2]);
    return [col[0] * s, col[1] * s, col[2] * s, col[3]];
  });
  for (const tri of sphere.f) for (const i of tri) m.vert([P[i][0], P[i][1]], P[i][2], N[i], C[i]);
}

// 先が細くなる丸い柱（幹・枝）：a から b へ（[x, y, 標高]）、太さの半径 ra → rb
function addLimb(m, a, b, ra, rb, col, sides = 7) {
  const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const L = Math.hypot(...d) || 1;
  const w = d.map((k) => k / L);
  // w に直角な2つの向き
  const ref = Math.abs(w[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
  let u = [w[1] * ref[2] - w[2] * ref[1], w[2] * ref[0] - w[0] * ref[2], w[0] * ref[1] - w[1] * ref[0]];
  const ul = Math.hypot(...u);
  u = u.map((k) => k / ul);
  const v = [w[1] * u[2] - w[2] * u[1], w[2] * u[0] - w[0] * u[2], w[0] * u[1] - w[1] * u[0]];
  const at = (o, r, k) => {
    const t = (k / sides) * Math.PI * 2;
    const n = [u[0] * Math.cos(t) + v[0] * Math.sin(t), u[1] * Math.cos(t) + v[1] * Math.sin(t), u[2] * Math.cos(t) + v[2] * Math.sin(t)];
    return { p: [o[0] + n[0] * r, o[1] + n[1] * r, o[2] + n[2] * r], n };
  };
  for (let k = 0; k < sides; k++) {
    const p0 = at(a, ra, k);
    const p1 = at(a, ra, k + 1);
    const q1 = at(b, rb, k + 1);
    const q0 = at(b, rb, k);
    for (const e of [p0, p1, q1, p0, q1, q0]) m.vert([e.p[0], e.p[1]], e.p[2], e.n, col);
  }
}

// 円すい（針葉樹の葉）：底の中心 c・半径 r から、高さ h の先へ
function addCone(m, c, r, h, col, shade, rnd, sides = 10) {
  const slope = r / h;
  const nl = Math.hypot(1, slope);
  const top = [c[0], c[1], c[2] + h];
  const rim = [];
  for (let k = 0; k < sides; k++) {
    const t = (k / sides) * Math.PI * 2;
    const rr = r * (0.9 + rnd() * 0.2);
    rim.push({ p: [c[0] + Math.cos(t) * rr, c[1] + Math.sin(t) * rr, c[2] - rnd() * 0.12 * h], n: [Math.cos(t) / nl, Math.sin(t) / nl, slope / nl] });
  }
  rim.push(rim[0]);
  const lit = (p) => {
    const s = shade(p[2]);
    return [col[0] * s, col[1] * s, col[2] * s, col[3]];
  };
  for (let k = 0; k < sides; k++) {
    const a = rim[k];
    const b = rim[k + 1];
    const tn = [(a.n[0] + b.n[0]) / 2, (a.n[1] + b.n[1]) / 2, a.n[2]];
    m.vert([a.p[0], a.p[1]], a.p[2], a.n, lit(a.p));
    m.vert([b.p[0], b.p[1]], b.p[2], b.n, lit(b.p));
    m.vert([top[0], top[1]], top[2], tn, lit(top));
    // 底（下から見える）
    m.vert([c[0], c[1]], c[2], [0, 0, -1], lit(a.p));
    m.vert([b.p[0], b.p[1]], b.p[2], [0, 0, -1], lit(b.p));
    m.vert([a.p[0], a.p[1]], a.p[2], [0, 0, -1], lit(a.p));
  }
}

// 木：幹と、形の種類ごとの葉の塊。高さ height・枝の広がり crown（直径）。葉の下のほうは暗く（木の中の影）
const TREE_LEAF = { broad: "leafBroad", round: "leafRound", ginkgo: "leafGinkgo", conifer: "leafConifer", cherry: "leafCherry" };
// 枝の下（幹だけのところ）の高さ ÷ 木の高さ。歩くときのぶつかり（幹）にも使う
export const TREE_CLEAR = { broad: 0.32, round: 0.3, ginkgo: 0.18, conifer: 0.08, cherry: 0.34 };
export const trunkRadius = (f) => Math.min(0.55, Math.max(0.1, 0.022 * f.height + 0.004 * f.crown));
function addTree(m, f, groundAt, cols, tint) {
  const p = toXY(f.coords[0]);
  const g = groundAt(f.coords[0]);
  if (!Number.isFinite(g)) return;
  const rnd = seeded(hashStr(f.id));
  const h = f.height;
  const w = f.crown;
  const kind = TREE_LEAF[f.kind] ? f.kind : "broad";
  const cb = g + h * TREE_CLEAR[kind]; // 葉の始まる高さ
  const top = g + h;
  const ch = top - cb; // 葉の高さ
  const leaf = tint(rgba(cols[TREE_LEAF[kind]]));
  const bark = tint(rgba(cols[kind === "cherry" ? "barkCherry" : "trunk"]));
  const shade = (z) => 0.62 + 0.38 * Math.min(1, Math.max(0, (z - cb) / Math.max(0.1, ch)));
  const tr = trunkRadius(f);
  const at = (dx, dy, z) => [p[0] + dx, p[1] + dy, z];
  const jit = (a) => (rnd() - 0.5) * 2 * a;
  if (kind === "cherry") {
    // サクラ（ソメイヨシノ）：太く短い幹が低いところで 3〜4 本の太い枝に分かれ、横へ低く長く伸びる。葉は横に広い平たい傘（下が平ら）
    const fork = g + Math.min(2.2, h * 0.22);
    addLimb(m, at(0, 0, g - 0.3), at(jit(0.25), jit(0.25), fork), tr, tr * 0.8, bark);
    const a0 = rnd() * Math.PI * 2;
    const nb = 3 + (rnd() < 0.5 ? 1 : 0);
    const tips = [];
    for (let k = 0; k < nb; k++) {
      const t = a0 + (k / nb) * Math.PI * 2 + jit(0.45);
      const r = w * (0.3 + jit(0.06));
      const tip = at(Math.cos(t) * r, Math.sin(t) * r, cb + ch * (0.3 + rnd() * 0.15));
      const mid = at(Math.cos(t) * r * 0.45, Math.sin(t) * r * 0.45, fork + (tip[2] - fork) * 0.65);
      addLimb(m, at(0, 0, fork - 0.2), mid, tr * 0.62, tr * 0.42, bark, 6);
      addLimb(m, mid, tip, tr * 0.42, tr * 0.18, bark, 5);
      tips.push(t);
    }
    // 葉：まん中の大きな平たい塊と、枝の先ごとの塊・そのあいだの塊（外へ垂れ下がる）
    addBlob(m, at(jit(w * 0.04), jit(w * 0.04), cb + ch * 0.62), [w * 0.3, w * 0.3, ch * 0.32], leaf, rnd, { shade });
    for (const t of tips) {
      for (const [dt, rk, zk] of [[0, 0.33, 0.48], [0.5, 0.24, 0.4]]) {
        const tt = t + dt + jit(0.15);
        const sz = 0.8 + rnd() * 0.35;
        addBlob(m, at(Math.cos(tt) * w * rk, Math.sin(tt) * w * rk, cb + ch * (zk + rnd() * 0.12)), [w * 0.2 * sz, w * 0.2 * sz, ch * 0.24 * sz], leaf, rnd, { shade });
      }
    }
    return;
  }
  // 幹（葉の中まで）
  addLimb(m, at(0, 0, g - 0.3), at(jit(0.2), jit(0.2), cb + ch * (kind === "conifer" ? 0.8 : 0.45)), tr, tr * 0.55, bark);
  if (kind === "broad") {
    // ケヤキ：幹から何本かの太い枝が斜め上へ広がり（下から見える）、その先に葉の塊が傘のように
    const a0 = rnd() * Math.PI * 2;
    for (let k = 0; k < 4; k++) {
      const t = a0 + (k / 4) * Math.PI * 2 + jit(0.4);
      addLimb(m, at(0, 0, cb - ch * 0.05), at(Math.cos(t) * w * 0.27, Math.sin(t) * w * 0.27, cb + ch * 0.42), tr * 0.6, tr * 0.25, bark, 5);
    }
    addBlob(m, at(jit(w * 0.04), jit(w * 0.04), cb + ch * 0.6), [w * 0.36, w * 0.36, ch * 0.36], leaf, rnd, { shade });
    const n = 6;
    for (let k = 0; k < n; k++) {
      const t = a0 + (k / n) * Math.PI * 2 + jit(0.3);
      const r = w * (0.26 + jit(0.03));
      const s = 0.85 + rnd() * 0.3;
      addBlob(m, at(Math.cos(t) * r, Math.sin(t) * r, cb + ch * (0.4 + rnd() * 0.15)), [w * 0.24 * s, w * 0.24 * s, ch * 0.26 * s], leaf, rnd, { shade });
    }
    addBlob(m, at(jit(w * 0.08), jit(w * 0.08), top - ch * 0.24), [w * 0.25, w * 0.25, ch * 0.22], leaf, rnd, { shade });
  } else if (kind === "round") {
    // 丸い木（クスノキ・サクラなど）：大きな塊に、まわりの小さな塊
    addBlob(m, at(0, 0, cb + ch * 0.5), [w * 0.42, w * 0.42, ch * 0.5], leaf, rnd, { shade });
    const a0 = rnd() * Math.PI * 2;
    for (let k = 0; k < 5; k++) {
      const t = a0 + (k / 5) * Math.PI * 2 + jit(0.35);
      const r = w * (0.25 + jit(0.04));
      addBlob(m, at(Math.cos(t) * r, Math.sin(t) * r, cb + ch * (0.38 + rnd() * 0.2)), [w * 0.24, w * 0.24, ch * 0.3], leaf, rnd, { shade });
    }
  } else if (kind === "ginkgo") {
    // イチョウ：縦長の卵形（下が太く、上へ細く）
    for (const [zk, rk, hk] of [[0.24, 0.48, 0.28], [0.54, 0.42, 0.28], [0.8, 0.29, 0.21]]) {
      addBlob(m, at(jit(w * 0.05), jit(w * 0.05), cb + ch * zk), [w * rk, w * rk, ch * hk], leaf, rnd, { shade, lump: 0.12 });
    }
  } else {
    // 針葉樹：重ねた円すい
    for (let k = 0; k < 3; k++) addCone(m, at(jit(0.1), jit(0.1), cb + ch * k * 0.27), (w / 2) * (1 - 0.27 * k), ch * (k === 2 ? 0.46 : 0.42), leaf, shade, rnd);
  }
}

// 生け垣：緑の箱に、上と横のでこぼこ（小さな塊を並べる）
function addHedge(m, f, groundAt, col) {
  const { pts } = densify(f.coords.map(toXY), 0.7);
  const rnd = seeded(hashStr(f.id));
  const hw = f.thickness / 2;
  const bot = [];
  const top = [];
  for (const p of pts) {
    const g = groundAt(toLngLat(p));
    if (!Number.isFinite(g)) return;
    bot.push(g - 0.3);
    top.push(g + f.height - Math.min(0.25, f.height * 0.3));
  }
  const side = [col[0] * 0.88, col[1] * 0.88, col[2] * 0.88, col[3]];
  m.prism(offsetLine(pts, hw), offsetLine(pts, -hw), bot, top, { top: col, side });
  // 上の丸み：刈りこんだ上のふくらみを、少しずつ重ねて
  const r = Math.max(0.25, hw);
  pts.forEach((p, i) => {
    const s = 0.95 + rnd() * 0.1;
    addBlob(m, [p[0], p[1], top[i]], [r * s, r * s, Math.min(0.3, f.height * 0.3)], col, rnd, { lump: 0.06, sphere: ICO0 });
  });
}

function addWall(m, f, groundAt, c) {
  const { pts } = densify(f.coords.map(toXY), 2);
  const hw = f.thickness / 2;
  const Lo = offsetLine(pts, hw + 0.4);
  const Ro = offsetLine(pts, -hw - 0.4);
  // 下は両側の低いほうの地面より下まで、上は高いほうの地面 + 高さ（擁壁でも、上の地面から高さが出る）
  const bot = [];
  const top = [];
  for (let i = 0; i < pts.length; i++) {
    const g = [pts[i], Lo[i], Ro[i]].map((p) => groundAt(toLngLat(p))).filter(Number.isFinite);
    if (!g.length) return;
    bot.push(Math.min(...g) - 0.5);
    top.push(Math.max(...g) + f.height);
  }
  m.prism(offsetLine(pts, hw), offsetLine(pts, -hw), bot, top, { top: c, side: c });
}

// 柵（wall の kind "fence"）：縦の格子（0.11m おき）と上下の横の棒、2m おきの柱。向こうが透ける。高さは地面から
function addFence(m, f, groundAt, c) {
  const xy = f.coords.map(toXY);
  const h = f.height;
  const half = Math.min(0.03, f.thickness / 2);
  for (let i = 0; i + 1 < xy.length; i++) {
    const p = xy[i];
    const q = xy[i + 1];
    const L = Math.hypot(q[0] - p[0], q[1] - p[1]);
    if (L < 1e-3) continue;
    const u = [(q[0] - p[0]) / L, (q[1] - p[1]) / L];
    const nn = [-u[1], u[0]];
    const at = (s) => [p[0] + u[0] * s, p[1] + u[1] * s];
    const g0 = f.rim ? railGround(groundAt, p, nn) : groundAt(toLngLat(p));
    const g1 = f.rim ? railGround(groundAt, q, nn) : groundAt(toLngLat(q));
    if (!Number.isFinite(g0) || !Number.isFinite(g1)) continue;
    const gz = (s) => g0 + ((g1 - g0) * s) / L;
    // 縦の格子：細い板（面の向きは柵の横向き）
    const k = Math.max(1, Math.round(L / 0.11));
    for (let j = 0; j <= k; j++) {
      const sv = (L * j) / k;
      const A = at(Math.max(0, sv - 0.012));
      const B = at(Math.min(L, sv + 0.012));
      const z = gz(sv);
      m.quad([[A, z - 0.05], [B, z - 0.05], [B, z + h], [A, z + h]], [nn[0], nn[1], 0], c);
    }
    // 上と下の横の棒・柱
    const line = [at(0), at(L)];
    const L1 = line.map((v) => [v[0] + nn[0] * half, v[1] + nn[1] * half]);
    const R1 = line.map((v) => [v[0] - nn[0] * half, v[1] - nn[1] * half]);
    m.prism(L1, R1, [g0 + h - 0.05, g1 + h - 0.05], [g0 + h, g1 + h], { top: c, side: c });
    m.prism(L1, R1, [g0 + 0.06, g1 + 0.06], [g0 + 0.1, g1 + 0.1], { top: c, side: c });
    const np = Math.max(1, Math.round(L / 2));
    for (let j = 0; j <= np; j++) {
      const sv = (L * j) / np;
      const post = [at(Math.max(0, sv - 0.03)), at(Math.min(L, sv + 0.03))];
      const z = gz(sv);
      m.prism(post.map((v) => [v[0] + nn[0] * 0.03, v[1] + nn[1] * 0.03]), post.map((v) => [v[0] - nn[0] * 0.03, v[1] - nn[1] * 0.03]), [z - 0.1, z - 0.1], [z + h, z + h], { top: c, side: c });
    }
  }
}

// 太陽光パネルの屋根：ふちの笠木の幅と、パネルの行の目地の間隔（m）
const SOLAR_EDGE = 0.6;
const SOLAR_ROW = 1.7;
// 直線 p0 + d·t と凸な多角形 poly の重なり：[t0, t1]（重ならなければ null）
function clipLineConvex(poly, p0, d) {
  const s = ringArea(poly) > 0 ? 1 : -1;
  let t0 = -Infinity;
  let t1 = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const ex = b[0] - a[0];
    const ey = b[1] - a[1];
    const f0 = s * (ex * (p0[1] - a[1]) - ey * (p0[0] - a[0])); // 辺の内側で正
    const fd = s * (ex * d[1] - ey * d[0]);
    if (Math.abs(fd) < 1e-12) {
      if (f0 < 0) return null;
      continue;
    }
    if (fd > 0) t0 = Math.max(t0, -f0 / fd);
    else t1 = Math.min(t1, -f0 / fd);
  }
  return t1 > t0 ? [t0, t1] : null;
}

// 2 点 a・b（[xy, z]）のあいだの角材（size 角。横の面は鉛直＝斜めの柱も、横から見て幅が変わらない）。両端はふた
function addBeam(m, a, b, size, c) {
  const d = [b[0][0] - a[0][0], b[0][1] - a[0][1], b[1] - a[1]];
  const L = Math.hypot(...d);
  if (L < 1e-6) return;
  const w = d.map((v) => v / L);
  // 横（水平で、向きに直角）と縦（向きと横に直角）。真上を向く材は東西を横に
  let hz = [-w[1], w[0], 0];
  const hl = Math.hypot(hz[0], hz[1]);
  hz = hl < 1e-6 ? [1, 0, 0] : [hz[0] / hl, hz[1] / hl, 0];
  const vt = [w[1] * hz[2] - w[2] * hz[1], w[2] * hz[0] - w[0] * hz[2], w[0] * hz[1] - w[1] * hz[0]];
  const hs = size / 2;
  const corner = (p, sh, sv) => [[p[0][0] + hz[0] * sh * hs + vt[0] * sv * hs, p[0][1] + hz[1] * sh * hs + vt[1] * sv * hs], p[1] + vt[2] * sv * hs];
  const ks = [[1, 1], [-1, 1], [-1, -1], [1, -1]];
  for (let k = 0; k < 4; k++) {
    const [s0, v0] = ks[k];
    const [s1, v1] = ks[(k + 1) % 4];
    const nn = [0, 1, 2].map((j) => (hz[j] * (s0 + s1) + vt[j] * (v0 + v1)) / 2);
    const nl = Math.hypot(...nn) || 1;
    m.quad([corner(a, s0, v0), corner(b, s0, v0), corner(b, s1, v1), corner(a, s1, v1)], nn.map((v) => v / nl), c);
  }
  for (const [p, sg] of [[a, -1], [b, 1]]) m.quad(ks.map(([sh, sv]) => corner(p, sh, sv)), w.map((v) => v * sg), c);
}

// 2 点 a・b（[xy, z]）のあいだの丸い管（半径 r、sides 角形）。両端はふた
function addTube(m, a, b, r, c, sides = 6) {
  const d = [b[0][0] - a[0][0], b[0][1] - a[0][1], b[1] - a[1]];
  const L = Math.hypot(...d);
  if (L < 1e-6) return;
  const w = d.map((v) => v / L);
  // w に直角な 2 本（e1・e2）
  const t = Math.abs(w[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
  let e1 = [w[1] * t[2] - w[2] * t[1], w[2] * t[0] - w[0] * t[2], w[0] * t[1] - w[1] * t[0]];
  const l1 = Math.hypot(...e1);
  e1 = e1.map((v) => v / l1);
  const e2 = [w[1] * e1[2] - w[2] * e1[1], w[2] * e1[0] - w[0] * e1[2], w[0] * e1[1] - w[1] * e1[0]];
  const ring = (p, k) => {
    const an = (2 * Math.PI * k) / sides;
    const o = [0, 1, 2].map((j) => (e1[j] * Math.cos(an) + e2[j] * Math.sin(an)) * r);
    return [[p[0][0] + o[0], p[0][1] + o[1]], p[1] + o[2]];
  };
  for (let k = 0; k < sides; k++) {
    const am = (2 * Math.PI * (k + 0.5)) / sides;
    const n = [0, 1, 2].map((j) => e1[j] * Math.cos(am) + e2[j] * Math.sin(am));
    [ring(a, k), ring(b, k), ring(b, k + 1), ring(a, k), ring(b, k + 1), ring(a, k + 1)].forEach((p) => m.vert(p[0], p[1], n, c));
  }
  for (const [p, sg] of [[a, -1], [b, 1]]) {
    for (let k = 0; k < sides; k++) [p, ring(p, k), ring(p, k + 1)].forEach((q) => m.vert(q[0], q[1], w.map((v) => v * sg), c));
  }
}

// ガラスの手すり（wall の kind "glass"）：ガラスの板（地面から高さまで）と、上の細い手すり・下の細い枠。高さは両わきの高いほうの地面から（railGround）。
// curb があれば下は幅 curbWidth の石の縁石（折れ目は角まで延ばしてつなぐ）で、ガラスと下の枠はその上。
// ガラスの板は gm（あとで半透明で重ねる形。なければ m）
function addGlassRail(m, f, groundAt, glassCol, railCol, curbCol, gm = m) {
  const xy = f.coords.map(toXY);
  const h = f.height;
  const cb = f.curb || 0;
  // 点ごとの線に直角な向き（両はしはその区間、途中は前の区間）
  const nAt = (i) => {
    const [p, q] = i + 1 < xy.length ? [xy[i], xy[i + 1]] : [xy[i - 1], xy[i]];
    const L = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1;
    return [-(q[1] - p[1]) / L, (q[0] - p[0]) / L];
  };
  if (cb > 0) {
    const ln = offsetLine(xy, xy.map(() => curbWidth(f) / 2));
    const rn = offsetLine(xy, xy.map(() => -curbWidth(f) / 2));
    const gs = xy.map((p, i) => railGround(groundAt, p, nAt(i)));
    for (let i = 0; i + 1 < xy.length; i++) {
      if (!Number.isFinite(gs[i]) || !Number.isFinite(gs[i + 1])) continue;
      m.prism([ln[i], ln[i + 1]], [rn[i], rn[i + 1]], [gs[i] - 0.1, gs[i + 1] - 0.1], [gs[i] + cb, gs[i + 1] + cb], { top: curbCol, side: curbCol });
    }
  }
  for (let i = 0; i + 1 < xy.length; i++) {
    const p = xy[i];
    const q = xy[i + 1];
    const L = Math.hypot(q[0] - p[0], q[1] - p[1]);
    if (L < 1e-3) continue;
    const nn = [-(q[1] - p[1]) / L, (q[0] - p[0]) / L];
    const g0 = railGround(groundAt, p, nn);
    const g1 = railGround(groundAt, q, nn);
    if (!Number.isFinite(g0) || !Number.isFinite(g1)) continue;
    const side = (d) => [[p, q].map((v) => [v[0] + nn[0] * d, v[1] + nn[1] * d]), [p, q].map((v) => [v[0] - nn[0] * d, v[1] - nn[1] * d])];
    const [Lg, Rg] = side(0.012);
    gm.prism(Lg, Rg, [g0 + cb + 0.05, g1 + cb + 0.05], [g0 + h - 0.05, g1 + h - 0.05], { top: glassCol, side: glassCol });
    const [Lr, Rr] = side(0.03);
    m.prism(Lr, Rr, [g0 + h - 0.06, g1 + h - 0.06], [g0 + h, g1 + h], { top: railCol, side: railCol });
    m.prism(Lr, Rr, [g0 + cb - 0.05, g1 + cb - 0.05], [g0 + cb + 0.06, g1 + cb + 0.06], { top: railCol, side: railCol });
  }
}

// 斜めの格子（wall の kind "slant"）：ステンレスの丸棒の柵。断面は三角形：足もとの幅は thickness（両側の足の線は中心線から
// ±thickness/2）、上は 1 本の手すり（height。upright の側の足の真上＝直角三角形、なければまん中＝二等辺の A）。
// 左の面と右の面の棒を上の 1 点で合わせた「Λ」を SLANT_PITCH m おきに
// （左の面の棒の足は柵の向きに後ろへ、右の面の棒の足は前へ。傾きは点ごとの leans（度。点のあいだは距離で直線に））。
// 両側の足の線に太い丸棒、そのあいだに SLANT_TIE m おきの横の棒、両側の面の上から SLANT_MID m 下に細い手すり、
// 点ごとに A の形の枠（両側の足から上の手すりへ）。下は縁石（curb。幅は curbWidth）。高さは地面から
const SLANT_PITCH = 0.12;
const SLANT_TIE = 0.55;
const SLANT_MID = 0.25;
function addSlantFence(m, f, groundAt, c, curbCol) {
  const xy = f.coords.map(toXY);
  const cb = f.curb || 0;
  const gs = xy.map((p) => groundAt(toLngLat(p)));
  if (!gs.every(Number.isFinite)) return;
  if (cb > 0) {
    const ln = offsetLine(xy, xy.map(() => curbWidth(f) / 2));
    const rn = offsetLine(xy, xy.map(() => -curbWidth(f) / 2));
    for (let i = 0; i + 1 < xy.length; i++) m.prism([ln[i], ln[i + 1]], [rn[i], rn[i + 1]], [gs[i] - 0.1, gs[i + 1] - 0.1], [gs[i] + cb, gs[i + 1] + cb], { top: curbCol, side: curbCol });
  }
  const cum = cumulative(xy);
  const L = cum[cum.length - 1];
  const leans = f.leans || xy.map(() => 10);
  const RB = 0.04; // 足の線の丸棒の半径
  const half = Math.max(0, f.thickness / 2 - RB); // 中心線から足の線まで
  const ax = f.upright === "left" ? half : f.upright === "right" ? -half : 0; // 上の手すり（中心線から左へ）
  const zBot = (i) => gs[i] + cb + RB;
  const zTop = (i) => gs[i] + f.height;
  // 距離 s の中心線の点・向き u・左向き nl・棒の下と上の高さ・傾き
  const along = (s) => {
    let i = 1;
    while (i < cum.length - 1 && cum[i] < s) i++;
    const seg = cum[i] - cum[i - 1] || 1;
    const t = (s - cum[i - 1]) / seg;
    const u = [(xy[i][0] - xy[i - 1][0]) / seg, (xy[i][1] - xy[i - 1][1]) / seg];
    const p = [xy[i - 1][0] + (xy[i][0] - xy[i - 1][0]) * t, xy[i - 1][1] + (xy[i][1] - xy[i - 1][1]) * t];
    const lerp = (a, b) => a + (b - a) * t;
    return { p, u, nl: [-u[1], u[0]], zb: lerp(zBot(i - 1), zBot(i)), zt: lerp(zTop(i - 1), zTop(i)), lean: lerp(leans[i - 1], leans[i]) };
  };
  const at = (p, u, nl, a, o) => [p[0] + u[0] * a + nl[0] * o, p[1] + u[1] * a + nl[1] * o];
  const n = Math.max(1, Math.floor(L / SLANT_PITCH));
  for (let k = 0; k < n; k++) {
    const s = ((k + 0.5) * L) / n;
    const { p, u, nl, zb, zt, lean } = along(s);
    const d = Math.min(0.6, (zt - zb) * Math.tan((lean * Math.PI) / 180));
    // 端の Λ は足を柵の端までに
    const da = Math.min(d, s), db = Math.min(d, L - s);
    const top = at(p, u, nl, 0, ax);
    addTube(m, [at(p, u, nl, -da, half), zb], [top, zt], 0.013, c, 5);
    addTube(m, [at(p, u, nl, db, -half), zb], [top, zt], 0.013, c, 5);
  }
  // 足の線の丸棒・上の手すり・両側の面の細い手すり（面の上の、上の手すりから SLANT_MID m 下）
  const feet = [half, -half].map((o) => offsetLine(xy, xy.map(() => o)));
  const topLine = offsetLine(xy, xy.map(() => ax));
  const mids = [half, -half].map((o) => offsetLine(xy, xy.map((_, i) => ax + ((o - ax) * SLANT_MID) / Math.max(0.3, zTop(i) - zBot(i)))));
  for (let i = 0; i + 1 < xy.length; i++) {
    for (const ft of feet) addTube(m, [ft[i], zBot(i)], [ft[i + 1], zBot(i + 1)], RB, c, 8);
    addTube(m, [topLine[i], zTop(i)], [topLine[i + 1], zTop(i + 1)], 0.025, c, 8);
    for (const md of mids) addTube(m, [md[i], zTop(i) - SLANT_MID], [md[i + 1], zTop(i + 1) - SLANT_MID], 0.015, c, 6);
  }
  // 足もとの横の棒（両側の足の線のあいだ）
  if (half > 0.05) {
    const nt = Math.max(1, Math.round(L / SLANT_TIE));
    for (let k = 0; k <= nt; k++) {
      const { p, u, nl, zb } = along((k * L) / nt);
      addTube(m, [at(p, u, nl, 0, half), zb], [at(p, u, nl, 0, -half), zb], 0.022, c, 6);
    }
  }
  // 点ごとの三角形の枠（区画の継ぎ目と両端）：両側の足から上の手すりへ
  xy.forEach((p, i) => {
    for (const ft of feet) addTube(m, [ft[i], gs[i] + cb], [topLine[i], zTop(i) + 0.02], 0.025, c, 6);
  });
}

// クロスの柵（wall の kind "xbrace"）：角の柱（bay m おき。なしは 1.8m）と、上と下の平たい横の棒、柱のあいだに X の筋交い
// （平たい鋼の棒）。折れ目と両端は柱 2 本。高さは地面から（rim なら両わきの高いほうの地面から）
function addCrossRail(m, f, groundAt, c) {
  const xy = f.coords.map(toXY);
  const h = f.height;
  const bay = f.bay || 1.8;
  const POST = 0.05;
  for (let i = 0; i + 1 < xy.length; i++) {
    const p = xy[i];
    const q = xy[i + 1];
    const L = Math.hypot(q[0] - p[0], q[1] - p[1]);
    if (L < 0.2) continue;
    const nn = [-(q[1] - p[1]) / L, (q[0] - p[0]) / L];
    const g0 = f.rim ? railGround(groundAt, p, nn) : groundAt(toLngLat(p));
    const g1 = f.rim ? railGround(groundAt, q, nn) : groundAt(toLngLat(q));
    if (!Number.isFinite(g0) || !Number.isFinite(g1)) continue;
    // 両端の柱は辺の内側へ POST、柱どうしのあいだを bay に近い等分
    const at = (s) => [p[0] + ((q[0] - p[0]) * s) / L, p[1] + ((q[1] - p[1]) * s) / L];
    const gz = (s) => g0 + ((g1 - g0) * s) / L;
    const s0 = POST, s1 = L - POST;
    const n = Math.max(1, Math.round((s1 - s0) / bay));
    const posts = Array.from({ length: n + 1 }, (_, k) => s0 + ((s1 - s0) * k) / n);
    for (const sv of posts) addBeam(m, [at(sv), gz(sv) - 0.05], [at(sv), gz(sv) + h], POST, c);
    // 上と下の横の棒（平たい棒：太さ 0.03 の角材で）
    for (const z of [h - 0.02, 0.1]) addBeam(m, [at(s0), gz(s0) + z], [at(s1), gz(s1) + z], 0.03, c);
    // 筋交い：柱のあいだに X（下の棒から上の棒へ）
    for (let k = 0; k < n; k++) {
      const a = posts[k] + POST / 2, b = posts[k + 1] - POST / 2;
      addBeam(m, [at(a), gz(a) + 0.12], [at(b), gz(b) + h - 0.04], 0.025, c);
      addBeam(m, [at(a), gz(a) + h - 0.04], [at(b), gz(b) + 0.12], 0.025, c);
    }
  }
}

// ベンチ（wall の kind "bench"）：木の座面（上の面が高さ height、奥行き thickness、厚さ 0.07）と、BENCH_LEG m おきの木の脚。
// 点の並びに沿って（閉じた並び＝最初と同じ点で終われば、木のまわりを囲むベンチ。角は留め継ぎ）
const BENCH_LEG = 1.4;
function addBench(m, f, groundAt, c) {
  const xy = f.coords.map(toXY);
  if (xy.length < 2) return;
  const hw = f.thickness / 2;
  const L = offsetLine(xy, hw), R = offsetLine(xy, -hw);
  const gs = xy.map((p) => groundAt(toLngLat(p)));
  if (!gs.every(Number.isFinite)) return;
  const top = gs.map((g) => g + f.height);
  const side = [c[0] * 0.82, c[1] * 0.82, c[2] * 0.82, c[3]];
  m.prism(L, R, top.map((z) => z - 0.07), top, { top: c, side, bottom: side }, { bottom: true });
  // 脚：区間ごとに両端（角から 0.25m）と、そのあいだ BENCH_LEG m おき。座面の奥行きいっぱいの板の脚
  for (let i = 0; i + 1 < xy.length; i++) {
    const p = xy[i], q = xy[i + 1];
    const len = Math.hypot(q[0] - p[0], q[1] - p[1]);
    if (len < 0.3) continue;
    const u = [(q[0] - p[0]) / len, (q[1] - p[1]) / len];
    const nl = [-u[1], u[0]];
    const n = Math.max(1, Math.round((len - 0.5) / BENCH_LEG));
    for (let k = 0; k <= n; k++) {
      const sv = 0.25 + ((len - 0.5) * k) / n;
      const c0 = [p[0] + u[0] * sv, p[1] + u[1] * sv];
      const g = gs[i] + ((gs[i + 1] - gs[i]) * sv) / len;
      const z1 = g + f.height - 0.07;
      const leg = [-1, 1].map((sg) => [c0[0] + nl[0] * sg * (hw - 0.04), c0[1] + nl[1] * sg * (hw - 0.04)]);
      const lf = leg.map((v) => [v[0] - u[0] * 0.05, v[1] - u[1] * 0.05]);
      const lb = leg.map((v) => [v[0] + u[0] * 0.05, v[1] + u[1] * 0.05]);
      m.prism([lf[0], lf[1]], [lb[0], lb[1]], [g - 0.05, g - 0.05], [z1, z1], { top: side, side });
    }
  }
}

// ガードパイプ（wall の kind "rail"）：2m おきの柱（丸い管）と、上と中ほどの横の管（高さ 0.6m 未満は上の 1 本）。高さは地面から
function addRail(m, f, groundAt, c) {
  const xy = f.coords.map(toXY);
  const h = f.height;
  const r = Math.min(0.035, Math.max(0.02, f.thickness / 2));
  for (let i = 0; i + 1 < xy.length; i++) {
    const p = xy[i];
    const q = xy[i + 1];
    const L = Math.hypot(q[0] - p[0], q[1] - p[1]);
    if (L < 1e-3) continue;
    const nn = [-(q[1] - p[1]) / L, (q[0] - p[0]) / L];
    const g0 = f.rim ? railGround(groundAt, p, nn) : groundAt(toLngLat(p));
    const g1 = f.rim ? railGround(groundAt, q, nn) : groundAt(toLngLat(q));
    if (!Number.isFinite(g0) || !Number.isFinite(g1)) continue;
    const at = (s) => [p[0] + ((q[0] - p[0]) * s) / L, p[1] + ((q[1] - p[1]) * s) / L];
    const gz = (s) => g0 + ((g1 - g0) * s) / L;
    // 高さ 0.6m 未満（足もとの低い手すり）は上の 1 本だけ
    for (const z of h < 0.6 ? [h - r] : [h - r, h * 0.55]) addTube(m, [at(0), g0 + z], [at(L), g1 + z], r, c);
    const np = Math.max(1, Math.round(L / 2));
    for (let j = 0; j <= np; j++) {
      if (j === 0 && i > 0) continue; // 折れ目の柱は前の区間で
      const sv = (L * j) / np;
      addTube(m, [at(sv), gz(sv) - 0.1], [at(sv), gz(sv) + h], r * 1.15, c);
    }
  }
}

// 信号機（signal）：柱・腕・車の信号（腕の先。横に 3 灯：見る人から左が青、まん中が黄、右が赤）・歩行者の信号（柱に。上が赤、下が青）。
// 点いている灯は、歩行者だけが渡れるとき（車の信号はどれも赤、歩行者の信号はどれも青。切りかえはしない）
function addSignal(m, f, groundAt, cols, tint) {
  const p = toXY(f.coords[0]);
  const g = groundAt(f.coords[0]);
  if (!Number.isFinite(g)) return;
  const col = (k) => tint(rgba(cols[k]));
  const pole = col("signalPole");
  const box = col("signalBox");
  const off = col("signalOff");
  const dir = (b) => [Math.sin((b * Math.PI) / 180), Math.cos((b * Math.PI) / 180)]; // 方位 → 平面の向き（東・北）
  const zt = g + f.height;
  addTube(m, [p, g - 0.2], [p, zt + 0.35], 0.11, pole, 8);
  // 腕：柱の上から bearing の向きへ（少し上がる）
  const ud = dir(f.bearing);
  const end = [p[0] + ud[0] * f.arm, p[1] + ud[1] * f.arm];
  if (f.arm > 0) addTube(m, [p, zt], [end, zt + f.arm * 0.04], 0.065, pole, 6);
  // 箱（中心 c・高さ z、面の向き b、横幅 w・高さ hh・奥行き d）と、面の上の丸い灯
  const head = (c, z, b, w, hh, d, lamps) => {
    const n = dir(b);
    const s = [n[1], -n[0]]; // 面を見る人の右（面の向き n を見る人は -n を向く。その人の右は (n[1], -n[0])）
    const P = (x, dd) => [c[0] + s[0] * x + n[0] * dd, c[1] + s[1] * x + n[1] * dd];
    m.prism([P(-w / 2, d / 2), P(w / 2, d / 2)], [P(-w / 2, -d / 2), P(w / 2, -d / 2)], [z - hh / 2, z - hh / 2], [z + hh / 2, z + hh / 2], { top: box, side: box, bottom: box }, { bottom: true });
    for (const { x, y, r, on, sq } of lamps) {
      const N = [n[0], n[1], 0];
      const K = sq ? 4 : 12;
      for (let k = 0; k < K; k++) {
        const a0 = (2 * Math.PI * k) / K + (sq ? Math.PI / 4 : 0);
        const a1 = (2 * Math.PI * (k + 1)) / K + (sq ? Math.PI / 4 : 0);
        const rr = sq ? r * Math.SQRT2 : r;
        [[x, y], [x + rr * Math.cos(a0), y + rr * Math.sin(a0)], [x + rr * Math.cos(a1), y + rr * Math.sin(a1)]].forEach(([xx, yy]) => m.vert(P(xx, d / 2 + 0.01), z + yy, N, on || off));
      }
      // ひさし（灯の上に、面から前へ）
      if (!sq) m.quad([[P(x - r, d / 2), z + y + r + 0.02], [P(x + r, d / 2), z + y + r + 0.02], [P(x + r, d / 2 + 0.2), z + y + r + 0.02], [P(x - r, d / 2 + 0.2), z + y + r + 0.02]], [0, 0, 1], box);
    }
  };
  if (f.face != null) {
    head(end, zt - 0.05, f.face, 1.25, 0.45, 0.28, [
      { x: -0.4, y: 0, r: 0.14, on: null },
      { x: 0, y: 0, r: 0.14, on: null },
      { x: 0.4, y: 0, r: 0.14, on: col("lampRed") },
    ]);
  }
  for (const b of f.peds || []) {
    const n = dir(b);
    head([p[0] + n[0] * 0.3, p[1] + n[1] * 0.3], g + 2.9, b, 0.42, 0.86, 0.22, [
      { x: 0, y: 0.2, r: 0.14, on: null, sq: true },
      { x: 0, y: -0.2, r: 0.14, on: col("lampGreen"), sq: true },
    ]);
  }
}

// 壁の文字（building の letters）の字形：大文字の高さ 1 の線の並び（[x, y] の折れ線）と幅。弧は円・楕円の点で
const arcPts = (cx, cy, rx, ry, a0, a1, n = 16) => Array.from({ length: n + 1 }, (_, k) => {
  const a = ((a0 + ((a1 - a0) * k) / n) * Math.PI) / 180;
  return [cx + rx * Math.cos(a), cy + ry * Math.sin(a)];
});
const GLYPHS = {
  A: { w: 0.8, s: [[[0, 0], [0.4, 1], [0.8, 0]], [[0.14, 0.33], [0.66, 0.33]]] },
  B: { w: 0.6, s: [[[0.32, 0.52], [0, 0.52], [0, 1], [0.3, 1], ...arcPts(0.3, 0.76, 0.24, 0.24, 90, -90, 10)], [[0, 0.52], [0, 0], [0.33, 0], ...arcPts(0.33, 0.26, 0.26, 0.26, -90, 90, 10)]] },
  C: { w: 0.9, s: [arcPts(0.5, 0.5, 0.5, 0.5, 45, 315, 24)] },
  D: { w: 0.8, s: [[[0.3, 0], [0, 0], [0, 1], [0.3, 1], ...arcPts(0.3, 0.5, 0.5, 0.5, 90, -90, 16)]] },
  E: { w: 0.52, s: [[[0.52, 1], [0, 1], [0, 0], [0.52, 0]], [[0, 0.5], [0.45, 0.5]]] },
  F: { w: 0.52, s: [[[0.52, 1], [0, 1], [0, 0]], [[0, 0.5], [0.45, 0.5]]] },
  G: { w: 1, s: [[...arcPts(0.5, 0.5, 0.5, 0.5, 45, 360, 24), [0.55, 0.5]]] },
  H: { w: 0.7, s: [[[0, 0], [0, 1]], [[0.7, 0], [0.7, 1]], [[0, 0.5], [0.7, 0.5]]] },
  I: { w: 0, s: [[[0, 0], [0, 1]]] },
  J: { w: 0.42, s: [[[0.42, 1], ...arcPts(0.21, 0.24, 0.21, 0.24, 0, -180, 10)]] },
  K: { w: 0.62, s: [[[0, 0], [0, 1]], [[0.6, 1], [0, 0.38]], [[0.2, 0.58], [0.62, 0]]] },
  L: { w: 0.48, s: [[[0, 1], [0, 0], [0.48, 0]]] },
  M: { w: 0.9, s: [[[0, 0], [0.1, 1], [0.45, 0], [0.8, 1], [0.9, 0]]] },
  N: { w: 0.7, s: [[[0, 0], [0, 1], [0.7, 0], [0.7, 1]]] },
  O: { w: 1, s: [arcPts(0.5, 0.5, 0.5, 0.5, 0, 360, 28)] },
  P: { w: 0.56, s: [[[0, 0], [0, 1], [0.3, 1], ...arcPts(0.3, 0.74, 0.26, 0.26, 90, -90, 12), [0, 0.48]]] },
  Q: { w: 1, s: [arcPts(0.5, 0.5, 0.5, 0.5, 0, 360, 28), [[0.6, 0.28], [0.98, -0.06]]] },
  R: { w: 0.6, s: [[[0, 0], [0, 1], [0.3, 1], ...arcPts(0.3, 0.74, 0.26, 0.26, 90, -90, 12), [0, 0.48]], [[0.26, 0.48], [0.6, 0]]] },
  S: { w: 0.56, s: [[[0.52, 0.88], [0.42, 0.98], [0.27, 1], [0.11, 0.96], [0.03, 0.83], [0.06, 0.67], [0.2, 0.57], [0.38, 0.48], [0.52, 0.37], [0.56, 0.21], [0.49, 0.07], [0.31, 0], [0.13, 0.02], [0, 0.12]]] },
  T: { w: 0.7, s: [[[0, 1], [0.7, 1]], [[0.35, 1], [0.35, 0]]] },
  U: { w: 0.66, s: [[[0, 1], ...arcPts(0.33, 0.33, 0.33, 0.33, 180, 360, 14), [0.66, 1]]] },
  V: { w: 0.76, s: [[[0, 1], [0.38, 0], [0.76, 1]]] },
  W: { w: 1.02, s: [[[0, 1], [0.255, 0], [0.51, 1], [0.765, 0], [1.02, 1]]] },
  X: { w: 0.66, s: [[[0, 1], [0.66, 0]], [[0.66, 1], [0, 0]]] },
  Y: { w: 0.68, s: [[[0, 1], [0.34, 0.5], [0.68, 1]], [[0.34, 0.5], [0.34, 0]]] },
  Z: { w: 0.64, s: [[[0.04, 1], [0.64, 1], [0, 0], [0.64, 0]]] },
  "&": { w: 0.78, s: [[[0.78, 0], [0.2, 0.62], [0.13, 0.76], [0.16, 0.9], [0.28, 0.99], [0.41, 0.97], [0.48, 0.86], [0.44, 0.72], [0.3, 0.6], [0.1, 0.45], [0.02, 0.3], [0.05, 0.13], [0.18, 0.02], [0.36, 0], [0.55, 0.08], [0.72, 0.32]]] },
  0: { w: 0.6, s: [arcPts(0.3, 0.5, 0.3, 0.5, 0, 360, 24)] },
  1: { w: 0.32, s: [[[0, 0.82], [0.3, 1], [0.3, 0]]] },
  2: { w: 0.56, s: [[[0.02, 0.78], [0.08, 0.92], [0.24, 1], [0.42, 0.96], [0.52, 0.8], [0.46, 0.62], [0, 0], [0.56, 0]]] },
  3: { w: 0.55, s: [[[0.02, 0.9], [0.15, 1], [0.35, 1], [0.48, 0.88], [0.48, 0.68], [0.32, 0.55], [0.18, 0.55]], [[0.32, 0.55], [0.5, 0.42], [0.53, 0.2], [0.41, 0.04], [0.22, 0], [0.04, 0.08]]] },
  4: { w: 0.6, s: [[[0.45, 0], [0.45, 1], [0, 0.3], [0.6, 0.3]]] },
  5: { w: 0.55, s: [[[0.5, 1], [0.09, 1], [0.04, 0.56], [0.2, 0.62], [0.38, 0.6], [0.52, 0.45], [0.54, 0.25], [0.42, 0.06], [0.25, 0], [0.05, 0.08]]] },
  6: { w: 0.55, s: [[[0.45, 0.95], [0.3, 1], [0.12, 0.9], [0.02, 0.6], [0.02, 0.3], [0.12, 0.06], [0.28, 0], [0.45, 0.06], [0.54, 0.25], [0.48, 0.45], [0.3, 0.53], [0.12, 0.45], [0.03, 0.3]]] },
  7: { w: 0.55, s: [[[0, 1], [0.55, 1], [0.15, 0]]] },
  8: { w: 0.55, s: [arcPts(0.275, 0.76, 0.22, 0.24, 0, 360, 16), arcPts(0.275, 0.26, 0.275, 0.26, 0, 360, 18)] },
  9: { w: 0.54, s: [[[0.1, 0.05], [0.25, 0], [0.42, 0.1], [0.52, 0.4], [0.52, 0.7], [0.42, 0.94], [0.26, 1], [0.09, 0.94], [0, 0.75], [0.06, 0.55], [0.24, 0.47], [0.42, 0.55], [0.51, 0.7]]] },
  "-": { w: 0.4, s: [[[0, 0.45], [0.4, 0.45]]] },
  "'": { w: 0.06, s: [[[0.03, 0.72], [0.03, 1]]] },
  // 看板の漢字（東京科学大学）：1 の正方形の中の線
  東: { w: 1, s: [[[0.08, 0.86], [0.92, 0.86]], [[0.2, 0.72], [0.2, 0.34]], [[0.2, 0.72], [0.8, 0.72], [0.8, 0.34]], [[0.2, 0.53], [0.8, 0.53]], [[0.2, 0.34], [0.8, 0.34]], [[0.5, 1], [0.5, 0]], [[0.46, 0.34], [0.06, 0.04]], [[0.54, 0.34], [0.94, 0.04]]] },
  京: { w: 1, s: [[[0.5, 1], [0.5, 0.88]], [[0.06, 0.86], [0.94, 0.86]], [[0.24, 0.72], [0.24, 0.46]], [[0.24, 0.72], [0.76, 0.72], [0.76, 0.46]], [[0.24, 0.46], [0.76, 0.46]], [[0.5, 0.46], [0.5, 0.02], [0.4, 0.1]], [[0.3, 0.32], [0.12, 0.1]], [[0.7, 0.32], [0.88, 0.1]]] },
  科: { w: 1, s: [[[0.4, 0.98], [0.08, 0.88]], [[0.04, 0.68], [0.44, 0.68]], [[0.24, 0.9], [0.24, 0]], [[0.23, 0.62], [0.04, 0.24]], [[0.26, 0.56], [0.42, 0.42]], [[0.6, 0.9], [0.7, 0.82]], [[0.58, 0.7], [0.7, 0.6]], [[0.5, 0.4], [0.98, 0.48]], [[0.8, 1], [0.8, 0]]] },
  学: { w: 1, s: [[[0.26, 0.98], [0.33, 0.86]], [[0.5, 1], [0.52, 0.86]], [[0.76, 0.98], [0.66, 0.86]], [[0.08, 0.7], [0.08, 0.8], [0.92, 0.8], [0.9, 0.7]], [[0.28, 0.66], [0.7, 0.66], [0.5, 0.52]], [[0.5, 0.52], [0.5, 0.02], [0.4, 0.08]], [[0.06, 0.38], [0.94, 0.38]]] },
  大: { w: 1, s: [[[0.08, 0.66], [0.92, 0.66]], [[0.5, 1], [0.5, 0.6], [0.06, 0.02]], [[0.52, 0.56], [0.94, 0.02]]] },
  // 駅と病院の看板の漢字（大岡山駅・中央改札・東急病院）
  岡: { w: 1, s: [[[0.1, 0], [0.1, 0.94], [0.9, 0.94], [0.9, 0.06], [0.8, 0]], [[0.33, 0.84], [0.4, 0.74]], [[0.67, 0.84], [0.6, 0.74]], [[0.24, 0.68], [0.76, 0.68]], [[0.5, 0.68], [0.5, 0.18]], [[0.28, 0.48], [0.28, 0.18], [0.72, 0.18]], [[0.72, 0.48], [0.72, 0.18]]] },
  山: { w: 1, s: [[[0.5, 0.96], [0.5, 0.06]], [[0.12, 0.66], [0.12, 0.06], [0.88, 0.06]], [[0.88, 0.66], [0.88, 0.06]]] },
  駅: { w: 1, s: [[[0.06, 0.95], [0.06, 0.34]], [[0.06, 0.95], [0.42, 0.95]], [[0.06, 0.79], [0.38, 0.79]], [[0.06, 0.63], [0.38, 0.63]], [[0.22, 0.95], [0.22, 0.47]], [[0.06, 0.47], [0.44, 0.47], [0.44, 0.07], [0.37, 0.02]], [[0.1, 0.31], [0.08, 0.18]], [[0.18, 0.31], [0.17, 0.18]], [[0.26, 0.31], [0.26, 0.18]], [[0.34, 0.31], [0.35, 0.18]], [[0.55, 0.92], [0.93, 0.92], [0.93, 0.67], [0.55, 0.67]], [[0.55, 0.92], [0.55, 0.45], [0.49, 0.04]], [[0.67, 0.67], [0.98, 0.04]]] },
  中: { w: 1, s: [[[0.14, 0.76], [0.86, 0.76], [0.86, 0.36], [0.14, 0.36], [0.14, 0.76]], [[0.5, 0.98], [0.5, 0.02]]] },
  央: { w: 1, s: [[[0.2, 0.46], [0.2, 0.78], [0.8, 0.78], [0.8, 0.46]], [[0.04, 0.46], [0.96, 0.46]], [[0.5, 0.98], [0.5, 0.46], [0.12, 0.03]], [[0.54, 0.4], [0.94, 0.03]]] },
  改: { w: 1, s: [[[0.06, 0.9], [0.38, 0.9], [0.38, 0.62], [0.08, 0.62], [0.08, 0.12], [0.42, 0.27]], [[0.66, 0.98], [0.54, 0.62]], [[0.6, 0.78], [0.97, 0.78]], [[0.88, 0.78], [0.56, 0.03]], [[0.64, 0.48], [0.98, 0.03]]] },
  札: { w: 1, s: [[[0.04, 0.72], [0.46, 0.72]], [[0.25, 0.98], [0.25, 0]], [[0.24, 0.64], [0.04, 0.26]], [[0.27, 0.55], [0.44, 0.42]], [[0.62, 0.95], [0.62, 0.12], [0.69, 0.05], [0.98, 0.05], [0.98, 0.26]]] },
  急: { w: 1, s: [[[0.42, 0.98], [0.24, 0.78]], [[0.35, 0.88], [0.74, 0.88], [0.62, 0.74]], [[0.2, 0.74], [0.8, 0.74], [0.8, 0.42], [0.2, 0.42]], [[0.24, 0.58], [0.8, 0.58]], [[0.12, 0.3], [0.05, 0.12]], [[0.3, 0.33], [0.3, 0.06], [0.74, 0.06], [0.78, 0.17]], [[0.5, 0.32], [0.56, 0.22]], [[0.8, 0.32], [0.93, 0.14]]] },
  病: { w: 1, s: [[[0.5, 1], [0.5, 0.9]], [[0.2, 0.9], [0.96, 0.9]], [[0.2, 0.9], [0.2, 0.4], [0.04, 0]], [[0.04, 0.76], [0.12, 0.68]], [[0.03, 0.56], [0.12, 0.5]], [[0.32, 0.75], [0.92, 0.75]], [[0.38, 0.61], [0.38, 0.02]], [[0.38, 0.61], [0.87, 0.61], [0.87, 0.06], [0.8, 0.02]], [[0.62, 0.75], [0.62, 0.46], [0.47, 0.3]], [[0.64, 0.42], [0.78, 0.29]]] },
  院: { w: 1, s: [[[0.08, 0.98], [0.08, 0]], [[0.08, 0.98], [0.26, 0.98], [0.16, 0.72], [0.28, 0.55], [0.21, 0.42], [0.12, 0.42]], [[0.68, 1], [0.68, 0.92]], [[0.4, 0.84], [0.4, 0.92], [0.96, 0.92], [0.96, 0.84]], [[0.52, 0.72], [0.84, 0.72]], [[0.4, 0.52], [0.98, 0.52]], [[0.58, 0.52], [0.51, 0.19], [0.38, 0.04]], [[0.76, 0.52], [0.76, 0.09], [0.98, 0.09], [0.98, 0.2]]] },
  ".": { w: 0.06, s: [[[0.03, 0], [0.03, 0.06]]] },
  " ": { w: 0.3, s: [] },
};
const LETTER_GAP = 0.18; // 字と字のあいだ（大文字の高さに対して）
const LETTER_STROKE = 0.075; // 線の太さ（同じく）
const LETTER_DEPTH = 0.04; // 壁からの厚み（m）
const LETTER_OFF = 0.02; // 壁から浮かせる（m）
// 平らな面の上の線分 (x0, y0)→(x1, y1)（面の上の x・y m）を、太さ sw・面から d0〜d1 m 浮いた角材に。
// plane は { P(x, y, d)（面の上の点から外へ d m の点 → [平面の点, 高さ]）, N（面の外向き）, U・V（面の上の x・y の向き。3 次元） }
function planeBar(m, plane, x0, y0, x1, y1, sw, d0, d1, c, side) {
  const dx = x1 - x0, dy = y1 - y0;
  const len = Math.hypot(dx, dy);
  if (len < 1e-6) return;
  const tx = dx / len, ty = dy / len;
  const e = sw / 2; // 継ぎ目が切れないよう両端を伸ばす
  const ax = x0 - tx * e, ay = y0 - ty * e, bx = x1 + tx * e, by = y1 + ty * e;
  const ox = -ty * (sw / 2), oy = tx * (sw / 2);
  const q = [[ax + ox, ay + oy], [bx + ox, by + oy], [bx - ox, by - oy], [ax - ox, ay - oy]];
  const { P, N, U, V } = plane;
  m.quad([P(q[3][0], q[3][1], d1), P(q[2][0], q[2][1], d1), P(q[1][0], q[1][1], d1), P(q[0][0], q[0][1], d1)], N, c);
  for (let k = 0; k < 4; k++) {
    const s0 = q[k], s1 = q[(k + 1) % 4];
    const ex = s1[0] - s0[0], ey = s1[1] - s0[1];
    const el = Math.hypot(ex, ey) || 1;
    // 角材の側面の向き：面の上で辺の外向き（ey, -ex）を 3D に
    const nx = ey / el, ny = -ex / el;
    m.quad([P(s0[0], s0[1], d0), P(s1[0], s1[1], d0), P(s1[0], s1[1], d1), P(s0[0], s0[1], d1)], [0, 1, 2].map((i) => U[i] * nx + V[i] * ny), side);
  }
}
// 字の並び text を、面の上の (x, y)（行の左下）から字の高さ size で。字のあいだは gap（m）、kx は横の縮め、stroke は線の太さ
// （size に対して）、shear は斜体（上へ 1 進むと右へ shear）
function planeText(m, plane, text, x, y, size, opt, c, side) {
  const { gap = size * LETTER_GAP, kx = 1, stroke = LETTER_STROKE, d0 = LETTER_OFF, d1 = LETTER_OFF + LETTER_DEPTH, shear = 0 } = opt;
  const sw = size * stroke;
  let cx = x + sw / 2;
  for (const ch of text) {
    const gl = GLYPHS[ch] || GLYPHS[" "];
    for (const st of gl.s) {
      for (let k = 0; k + 1 < st.length; k++) {
        const [u0, v0] = st[k];
        const [u1, v1] = st[k + 1];
        planeBar(m, plane, cx + (u0 + shear * v0) * size * kx, y + v0 * size, cx + (u1 + shear * v1) * size * kx, y + v1 * size, sw, d0, d1, c, side);
      }
    }
    cx += gl.w * size * kx + gap;
  }
}
// 1 行の文字を、壁の上の a→b（host）に。字の幅は大文字の高さ size に比例し、字のあいだを広げ縮めて行の幅に合わせる
// （狭すぎるときは横に縮める）。line なら下の端に行の幅の横線
function addLetters(m, l, host, g0, c) {
  const { a, u, n, L } = host;
  const glyphs = [...l.text].map((ch) => GLYPHS[ch] || GLYPHS[" "]);
  const sw = l.size * LETTER_STROKE;
  const natural = glyphs.reduce((s, gl) => s + gl.w, 0) * l.size + sw;
  const gaps = glyphs.length - 1;
  let gap = gaps ? (L - natural) / gaps : 0;
  let kx = 1;
  if (gap < l.size * 0.05) {
    gap = l.size * 0.05;
    kx = (L - gap * gaps - sw) / (natural - sw);
  }
  const z0 = g0 + l.z;
  const plane = {
    P: (x, y, d) => [[a[0] + u[0] * x + n[0] * d, a[1] + u[1] * x + n[1] * d], z0 + y],
    N: [n[0], n[1], 0], U: [u[0], u[1], 0], V: [0, 0, 1],
  };
  const side2 = c.map((v, i) => (i < 3 ? v * 0.82 : v));
  planeText(m, plane, l.text, 0, 0, l.size, { gap, kx }, c, side2);
  if (l.line) planeBar(m, plane, 0, 0, L, 0, sw, LETTER_OFF, LETTER_OFF + LETTER_DEPTH, c, side2);
}

// 看板（sign）：板（厚さのある箱。前の面は style の色、ステンレスは縁つき）と脚、前の面の文字・区切りの線・Science Tokyo の印。
// 文字は面から浮いた細い角材（ステンレスは暗い切り文字、白い板は薄い灰色）。脚は板の両端から板の面のまま地面まで（1 本ならまん中）
const SIGN_TEXT_DEPTH = 0.012;
const NOTICE_BAND = 0.3; // お知らせの看板（notice）の緑の帯の高さ（板の高さに対して）
const SIGN_RIM = 0.025; // ステンレスの看板の前の面の縁の幅
// 校章（Science Tokyo のシンボルマーク）：大学のサイトのヘッダーの SVG の 3 つの形を折れ線にしたもの。高さ 1・左下が 0,0。
// 上下の帯（ink：看板では磨いたステンレスで暗く映る）と、上の帯の左の下から下の帯の右の上へ渡る明るい帯（swoosh）。幅は高さの 0.7225 倍
const LOGO_SHAPES = [
  { fill: "ink", pts: [[0.722, 1], [0.573, 0.993], [0.434, 0.972], [0.307, 0.94], [0.193, 0.898], [0.095, 0.848], [0.014, 0.79], [0.01, 0.787], [0.007, 0.783], [0.004, 0.778], [0.002, 0.773], [0, 0.767], [0, 0.761], [0, 0.539], [0.003, 0.545], [0.011, 0.553], [0.114, 0.623], [0.226, 0.677], [0.345, 0.716], [0.468, 0.742], [0.594, 0.756], [0.722, 0.76]] },
  { fill: "ink", pts: [[0.722, 0.272], [0.722, 0.495], [0.722, 0.493], [0.719, 0.491], [0.715, 0.489], [0.71, 0.488], [0.703, 0.487], [0.696, 0.486], [0.564, 0.472], [0.436, 0.449], [0.314, 0.415], [0.199, 0.372], [0.094, 0.321], [0, 0.262], [0, 0], [0.087, 0.055], [0.185, 0.106], [0.29, 0.151], [0.4, 0.19], [0.513, 0.22], [0.626, 0.241], [0.631, 0.242], [0.642, 0.244], [0.657, 0.246], [0.671, 0.248], [0.683, 0.25], [0.69, 0.251], [0.695, 0.251], [0.701, 0.252], [0.707, 0.254], [0.713, 0.257], [0.718, 0.26], [0.721, 0.265], [0.722, 0.269]] },
  { fill: "swoosh", pts: [[0.722, 0.495], [0.718, 0.504], [0.707, 0.514], [0.644, 0.555], [0.575, 0.591], [0.501, 0.622], [0.423, 0.649], [0.341, 0.671], [0.255, 0.688], [0.211, 0.671], [0.169, 0.652], [0.128, 0.631], [0.087, 0.607], [0.048, 0.581], [0.011, 0.553], [0.003, 0.545], [0, 0.539], [0.002, 0.534], [0.012, 0.532], [0.071, 0.524], [0.132, 0.513], [0.195, 0.499], [0.259, 0.481], [0.322, 0.46], [0.384, 0.436], [0.434, 0.448], [0.485, 0.459], [0.537, 0.468], [0.589, 0.476], [0.642, 0.482], [0.696, 0.486], [0.703, 0.487], [0.71, 0.488], [0.715, 0.489], [0.719, 0.491], [0.722, 0.493]] },
];
function addSign(m, f, groundAt, cols, tint) {
  const g = groundAt(toLngLat(f.coords[0]));
  if (!Number.isFinite(g)) return;
  const fr = signFrame(f);
  const W = f.width, H = f.height, T = f.thickness;
  const white = f.style === "white";
  const notice = f.style === "notice"; // 白い板の上に緑の帯（帯の中の行は白い字）
  const dark = f.style === "dark" || f.style === "red"; // 黒い板（red は赤い板）に白い字（店の看板。縁なし）
  const board = f.style === "red" ? "redPanel" : "signDark";
  const face = tint(rgba(cols[dark ? board : white || notice ? "plateFace" : "signFace"]));
  const side = tint(rgba(cols[dark ? board : white ? "plateText" : "signSide"]));
  const ink = tint(rgba(cols[dark ? "plateFace" : white ? "plateText" : "signText"]));
  const inkSide = ink.map((v, i) => (i < 3 ? v * 0.8 : v));
  const at = (x, y, d) => {
    const [p, z] = fr.at(x, y, d);
    return [p, g + z];
  };
  const U = [fr.ex[0], fr.ex[1], 0];
  const V = [fr.n[0] * fr.ey[0], fr.n[1] * fr.ey[0], fr.ey[1]];
  const N = [fr.n[0] * fr.en[0], fr.n[1] * fr.en[0], fr.en[1]];
  const neg = (v) => v.map((k) => -k);
  // 板：前（d 0）・後ろ（d -T）・上下・左右
  m.quad([at(0, 0, 0), at(W, 0, 0), at(W, H, 0), at(0, H, 0)], N, face);
  m.quad([at(W, 0, -T), at(0, 0, -T), at(0, H, -T), at(W, H, -T)], neg(N), side);
  m.quad([at(0, H, 0), at(W, H, 0), at(W, H, -T), at(0, H, -T)], V, side);
  m.quad([at(W, 0, 0), at(0, 0, 0), at(0, 0, -T), at(W, 0, -T)], neg(V), side);
  m.quad([at(0, 0, -T), at(0, 0, 0), at(0, H, 0), at(0, H, -T)], neg(U), side);
  m.quad([at(W, 0, 0), at(W, 0, -T), at(W, H, -T), at(W, H, 0)], U, side);
  // 脚：板の両端（1 本ならまん中）から、板の面のまま地面の 0.1m 下まで（角材）
  const yGround = -(f.z + 0.1) / (fr.ey[1] || 1);
  for (let k = 0; k < f.legs; k++) {
    const x = f.legs === 1 ? W / 2 : 0.025 + ((W - 0.05) * k) / (f.legs - 1);
    addBeam(m, at(x, 0.05, -T / 2), at(x, yGround, -T / 2), 0.045, side);
  }
  const plane = { P: at, N, U, V };
  const d0 = 0, d1 = SIGN_TEXT_DEPTH;
  // ステンレスの縁（前の面のふちを少し浮かせて）
  if (!white && !dark) {
    const r = SIGN_RIM / 2;
    for (const [x0, y0, x1, y1] of [[r, r, W - r, r], [W - r, r, W - r, H - r], [W - r, H - r, r, H - r], [r, H - r, r, r]]) planeBar(m, plane, x0, y0, x1, y1, SIGN_RIM, 0, 0.006, side, side);
  }
  // お知らせの看板の緑の帯：上の NOTICE_BAND の割合（ふちを少しあける）
  const bandY = H * (1 - NOTICE_BAND);
  if (notice) {
    const green = tint(rgba(cols.noticeGreen));
    m.quad([at(0.02, bandY, 0.003), at(W - 0.02, bandY, 0.003), at(W - 0.02, H - 0.02, 0.003), at(0.02, H - 0.02, 0.003)], N, green);
  }
  const plateWhite = tint(rgba(cols.plateFace));
  // 漢字の行は線を少し太く。緑の帯の中の行は白
  for (const l of f.lines) {
    const inBand = notice && l.y >= bandY - 0.005;
    planeText(m, plane, l.text, l.x, l.y, l.size, { stroke: [...l.text].some((ch) => ch > "~") ? 0.085 : LETTER_STROKE, d0, d1 }, inBand ? plateWhite : ink, inBand ? plateWhite : inkSide);
  }
  for (const r of f.rules) planeBar(m, plane, r[0], r[1], r[2], r[3], 0.008, d0, d1, ink, inkSide);
  // 校章：形ごとに面の上の平らな多角形（面から少し浮かせる）。明るい帯はステンレスの看板では白く、白い板では板より少し暗く
  if (f.logo && f.logo[3]) addLogo(m, plane, f.logo, cols, tint);
  else if (f.logo) {
    const [lx, ly, lh] = f.logo;
    const swoosh = tint(rgba(cols[white ? "plateSwoosh" : "signSwoosh"]));
    for (const sh of LOGO_SHAPES) {
      const idx = earcut(sh.pts.flat(), null, 2);
      for (const i of idx) {
        const [p, z] = at(lx + sh.pts[i][0] * lh, ly + sh.pts[i][1] * lh, 0.004);
        m.vert(p, z, N, sh.fill === "ink" ? ink : swoosh);
      }
    }
  }
}

// 看板の印（校章でないもの）：[左下の x, y, 高さ, 種類]。mcd マクドナルドの黄色い M（2 つの弧と、まん中で合わさって下へ下りる脚）/
// tokyu 東急の赤い丸と白い逆三角 / tokyustore 東急ストアの赤い四角と白い輪・2 人の頭と腕
function addLogo(m, plane, logo, cols, tint) {
  const [lx, ly, lh, kind] = logo;
  const { P, N } = plane;
  const fill = (pts, col, d) => {
    for (const i of earcut(pts.flat(), null, 2)) {
      const [p, z] = P(lx + pts[i][0] * lh, ly + pts[i][1] * lh, d);
      m.vert(p, z, N, col);
    }
  };
  const circle = (cx, cy, r, n = 28) => Array.from({ length: n }, (_, k) => [cx + r * Math.cos((2 * Math.PI * k) / n), cy + r * Math.sin((2 * Math.PI * k) / n)]);
  const bar = (pts, w, col, d0, d1) => {
    for (let k = 0; k + 1 < pts.length; k++) planeBar(m, plane, lx + pts[k][0] * lh, ly + pts[k][1] * lh, lx + pts[k + 1][0] * lh, ly + pts[k + 1][1] * lh, w * lh, d0, d1, col, col);
  };
  const white = tint(rgba(cols.plateFace));
  if (kind === "mcd") {
    const yellow = tint(rgba(cols.mcdYellow));
    const arch = Array.from({ length: 17 }, (_, k) => [0.31 - 0.24 * Math.cos((Math.PI * k) / 16), 0.45 + 0.48 * Math.sin((Math.PI * k) / 16)]);
    const left = [[0.07, 0], ...arch, [0.59, 0]];
    bar(left, 0.15, yellow, 0.004, 0.03);
    bar(left.map(([x, y]) => [1.18 - x, y]), 0.15, yellow, 0.004, 0.03);
  } else if (kind === "tokyu") {
    fill(circle(0.5, 0.5, 0.5), tint(rgba(cols.tokyuRed)), 0.004);
    fill([[0.27, 0.68], [0.52, 0.22], [0.78, 0.68]], white, 0.007);
  } else if (kind === "tokyustore") {
    fill([[0, 0], [1, 0], [1, 1], [0, 1]], tint(rgba(cols.tokyuRed)), 0.004);
    bar([...circle(0.5, 0.5, 0.34, 24), [0.84, 0.5]], 0.06, white, 0.006, 0.009);
    fill(circle(0.4, 0.62, 0.07, 12), white, 0.008);
    fill(circle(0.6, 0.62, 0.07, 12), white, 0.008);
    bar([[0.3, 0.47], [0.5, 0.3], [0.7, 0.47]], 0.07, white, 0.006, 0.009);
  }
}

// 決まった乱数（0〜1）：位置などの数から
const leafHash = (a, b, c) => {
  const h = Math.sin(a * 127.1 + b * 311.7 + c * 74.7) * 43758.5453;
  return h - Math.floor(h);
};
// 壁面緑化（material green）の壁：1m ほどの区画ごとに緑の濃さを変える（葉の茂みのむら。ところどころ赤く・黄色く色づいた葉）。
// 区画の色は平面の位置と高さで決まる（となりの区間とつながる）
function greenWall(m, p, q, bp, bq, tp, tq, n, c) {
  const L = Math.hypot(q[0] - p[0], q[1] - p[1]);
  if (L < 1e-3) return;
  const K = Math.max(1, Math.round(L / 0.8));
  const R = Math.max(1, Math.round(Math.max(tp - bp, tq - bq) / 0.7));
  for (let i = 0; i < K; i++) {
    const t0 = i / K, t1 = (i + 1) / K;
    const P0 = [p[0] + (q[0] - p[0]) * t0, p[1] + (q[1] - p[1]) * t0];
    const P1 = [p[0] + (q[0] - p[0]) * t1, p[1] + (q[1] - p[1]) * t1];
    const b0 = bp + (bq - bp) * t0, b1 = bp + (bq - bp) * t1, e0 = tp + (tq - tp) * t0, e1 = tp + (tq - tp) * t1;
    for (let j = 0; j < R; j++) {
      const z0a = b0 + ((e0 - b0) * j) / R, z0b = b0 + ((e0 - b0) * (j + 1)) / R;
      const z1a = b1 + ((e1 - b1) * j) / R, z1b = b1 + ((e1 - b1) * (j + 1)) / R;
      const r = leafHash(Math.round((P0[0] + P1[0]) * 1.3), Math.round((P0[1] + P1[1]) * 1.3), Math.round((z0a + z0b) * 0.8));
      const k = 0.88 + r * 0.22;
      let col = [c[0] * k, c[1] * k, c[2] * k, c[3]];
      if (r > 0.985) col = mix(col, [Math.min(1, c[0] * 1.6), c[1] * 0.85, c[2] * 0.75, c[3]], 0.6);
      else if (r < 0.03) col = mix(col, [Math.min(1, c[0] * 1.3), Math.min(1, c[1] * 1.1), c[2] * 0.75, c[3]], 0.6);
      m.quad([[P0, z0a], [P1, z1a], [P1, z1b], [P0, z0b]], n, col);
    }
  }
}

// 格子のスクリーン（建物の trellis）：壁の前の鋼の格子。縦の柱を pitch m おき、rows の高さに横の材。planters の高さに
// つる草のプランター（灰色の箱と上の低い緑）を掛け、プランターから上の段へつるがのぼる（区画ごとに 2 本、高さは決まった乱数 × vines）
const TRELLIS_BAR = 0.16;
function addTrellis(m, tr, q, n, g0, look) {
  const L = Math.hypot(q[1][0] - q[0][0], q[1][1] - q[0][1]);
  if (L < 0.3) return;
  const u = [(q[1][0] - q[0][0]) / L, (q[1][1] - q[0][1]) / L];
  const at = (s, d) => [q[0][0] + u[0] * s + n[0] * d, q[0][1] + u[1] * s + n[1] * d];
  const d = tr.depth;
  const K = Math.max(1, Math.round(L / tr.pitch));
  const posts = Array.from({ length: K + 1 }, (_, k) => (L * k) / K);
  for (const s of posts) addBeam(m, [at(s, d), g0 + tr.bottom], [at(s, d), g0 + tr.top], TRELLIS_BAR, look.trellis);
  const rows = [...new Set([tr.bottom, ...tr.rows, tr.top])].filter((r) => r >= tr.bottom && r <= tr.top).sort((a, b) => a - b);
  for (const r of rows) addBeam(m, [at(0, d), g0 + r], [at(L, d), g0 + r], TRELLIS_BAR * 0.75, look.trellis);
  const pl = (tr.planters || []).filter((r) => r >= tr.bottom && r < tr.top).sort((a, b) => a - b);
  const vines = tr.vines ?? 0.6;
  const nn = [n[0], n[1], 0];
  pl.forEach((r, k) => {
    const z = g0 + r;
    m.prism([at(0, d - 0.3), at(L, d - 0.3)], [at(0, d + 0.32), at(L, d + 0.32)], [z - 0.4, z - 0.4], [z + 0.08, z + 0.08], { top: look.planter, side: look.planter, bottom: look.planter }, { bottom: true });
    m.prism([at(0.05, d - 0.22), at(L - 0.05, d - 0.22)], [at(0.05, d + 0.24), at(L - 0.05, d + 0.24)], [z + 0.08, z + 0.08], [z + 0.3, z + 0.3], { top: look.vine[0], side: look.vine[1] });
    const span = (k + 1 < pl.length ? pl[k + 1] : tr.top) - r - 0.3;
    if (span <= 0 || vines <= 0) return;
    for (let i = 0; i < K; i++) {
      for (let j = 0; j < 2; j++) {
        const s0 = posts[i] + (posts[i + 1] - posts[i]) * (0.1 + 0.8 * leafHash(i * 3.1 + j, r, q[0][0] * 0.37 + q[0][1] * 0.11));
        const w = 0.12 + 0.22 * leafHash(j * 5.7 + i, r * 1.3, q[0][1] * 0.29);
        const h = span * vines * (0.35 + 0.65 * leafHash(i + j * 1.7, r * 2.1, 3.3));
        const col = look.vine[Math.min(2, Math.floor(leafHash(i * 1.9 + j, r, 7.7) * 3))];
        const a = Math.max(0, s0 - w / 2), b = Math.min(L, s0 + w / 2);
        m.quad([[at(a, d + 0.03), z + 0.3], [at(b, d + 0.03), z + 0.3], [at(b, d + 0.03), z + 0.3 + h], [at(a, d + 0.03), z + 0.3 + h]], nn, col);
      }
    }
  });
}

function addBridge(m, f, groundAt, pal, cols, tint) {
  const { cum, elev } = vertexElevations(f.coords, f.z, groundAt);
  if (!finite(elev)) return;
  const xy = f.coords.map(toXY);
  const { pts, s } = densify(xy, 2);
  const deck = s.map((v) => lerpAlong(cum, elev, v));
  const hw = f.width / 2;
  // 木の床（deck）は路面の「木の床」と同じ色（まわりの地面に貼った木の床と続く）
  const surface = tint(rgba(f.surface === "rail" ? pal.rail : f.surface === "street" ? pal.street : f.surface === "deck" ? cols.bridgeDeck : pal.walk));
  const side = tint(rgba(cols.deckSide));
  m.prism(offsetLine(pts, hw), offsetLine(pts, -hw), deck.map((v) => v - f.thickness), deck, { top: surface, side, bottom: side }, { bottom: true });
  if (f.railing) {
    const rc = tint(rgba(cols.railing));
    const up = deck.map((v) => v + 1.1);
    [1, -1].forEach((sg) => m.prism(...band(pts, sg * hw, sg * (hw - 0.12)), deck, up, { top: rc, side: rc }));
  }
  if (f.piers) {
    // 柱：途中の頂点と、長い区間（20m 超）の中ほど
    const spots = [];
    for (let i = 1; i < xy.length - 1; i++) spots.push(cum[i]);
    for (let i = 0; i < xy.length - 1; i++) if (cum[i + 1] - cum[i] > 20) spots.push((cum[i] + cum[i + 1]) / 2);
    const pc = tint(rgba(cols.pier));
    const pw = Math.min(0.8, f.width / 3);
    spots.forEach((sv) => {
      const k = s.findIndex((v) => v >= sv - 1e-6);
      const i = Math.max(1, k);
      const a = pts[i - 1];
      const b = pts[i];
      const t = (sv - s[i - 1]) / (s[i] - s[i - 1] || 1);
      const p = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
      const dl = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
      const dir = [(b[0] - a[0]) / dl, (b[1] - a[1]) / dl];
      const line = [[p[0] - (dir[0] * pw) / 2, p[1] - (dir[1] * pw) / 2], [p[0] + (dir[0] * pw) / 2, p[1] + (dir[1] * pw) / 2]];
      const g = groundAt(toLngLat(p));
      const under = lerpAlong(cum, elev, sv) - f.thickness;
      if (!Number.isFinite(g) || under - g < 0.8) return;
      m.prism(offsetLine(line, pw / 2), offsetLine(line, -pw / 2), [g - 0.5, g - 0.5], [under, under], { top: pc, side: pc });
    });
  }
}

// 帯の片側（sg = 1 左、-1 右）の外の地面：壁の外の面から 0.4m 先（pts は中心線を細かくした点、c・hb はその点ごとの中心のずれと土台の半幅）
const outerGround = (groundAt, pts, c, hb, sg) => offsetLine(pts, hb.map((h, i) => c[i] + sg * (h + 0.4))).map((p) => groundAt(toLngLat(p)));

// 坂・階段の両わきの斜面が 0（垂直）のとき：坂の面とまわりの地面の段差に壁を立てる（両わきと両端）。
// 壁は帯のふちから外へ sl.wt（土台の横幅から決まる厚さ）。上は高いほう（坂の面か外の地面）より少し上
function addSlopeWalls(m, sl, groundAt, c) {
  const { pts, s } = densify(sl.xy, 1);
  const { hw, hb, c: cs } = halfWidths(sl, s);
  const inner = s.map((v) => lerpAlong(sl.prof.s, sl.prof.e, v));
  const low = s.map((v, i) => Math.min(inner[i], lerpAlong(sl.under.s, sl.under.e, v))); // 階段は段の下の地面が一段ぶん低いところがある
  [1, -1].forEach((sg) => {
    const out = outerGround(groundAt, pts, cs, hb, sg);
    if (!finite(out)) return;
    // 壁の下の地面（帯のふちと壁のまん中）まで下ろす：まわりより高い階段の下は元の地面のままで、平地のふちをまたぐとそこが低い
    const foot = [hw, hw.map((h, i) => (h + hb[i]) / 2)].map((d) => offsetLine(pts, d.map((v, i) => cs[i] + sg * v)).map((p) => groundAt(toLngLat(p))));
    const bot = low.map((v, i) => Math.min(v, out[i], ...foot.map((g) => (Number.isFinite(g[i]) ? g[i] : Infinity))) - 0.3);
    const top = inner.map((v, i) => Math.max(v, out[i]) + 0.05);
    m.prism(...band(pts, hw.map((v, i) => cs[i] + sg * v), hb.map((v, i) => cs[i] + sg * v)), bot, top, { top: c, side: c });
  });
  // 両端：土台の端の線（左の壁の外〜右の壁の外）から外へ壁の厚さぶん。段差がほとんどなければ立てない
  const Ls = offsetLine(pts, hb.map((v, i) => cs[i] + v));
  const Rs = offsetLine(pts, hb.map((v, i) => cs[i] - v));
  [[0, 1], [pts.length - 1, pts.length - 2]].forEach(([i, j]) => {
    const dx = pts[i][0] - pts[j][0];
    const dy = pts[i][1] - pts[j][1];
    const l = Math.hypot(dx, dy) || 1;
    const u = [dx / l, dy / l]; // 外向き
    const outer = groundAt(toLngLat([pts[i][0] + u[0] * (sl.wt + 0.4), pts[i][1] + u[1] * (sl.wt + 0.4)]));
    if (!Number.isFinite(outer) || Math.abs(inner[i] - outer) < 0.15) return;
    const line = [Ls[i], Rs[i]];
    const nx = -(line[1][1] - line[0][1]);
    const ny = line[1][0] - line[0][0];
    const d = nx * u[0] + ny * u[1] > 0 ? sl.wt : -sl.wt;
    // 端の線と壁の下の地面まで下ろす
    const foot = [Ls[i], pts[i], Rs[i], [pts[i][0] + u[0] * sl.wt * 0.5, pts[i][1] + u[1] * sl.wt * 0.5]].map((q) => groundAt(toLngLat(q))).filter(Number.isFinite);
    const bot = Math.min(inner[i], outer, ...foot) - 0.3;
    const top = Math.max(inner[i], outer) + 0.05;
    m.prism(...band(line, 0, d), [bot, bot], [top, top], { top: c, side: c });
  });
}

// 平らな多角形の柱（poly は平面の m、z0〜z1）：上の面と、まわりの面（外向き）
function solidPoly(m, poly, z0, z1, top, side) {
  const ccw = ringArea(poly) > 0;
  m.polygon([poly], z1, [0, 0, 1], top);
  poly.forEach((a, i) => {
    const b = poly[(i + 1) % poly.length];
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (L < 1e-6) return;
    const n = ccw ? [(b[1] - a[1]) / L, -(b[0] - a[0]) / L, 0] : [-(b[1] - a[1]) / L, (b[0] - a[0]) / L, 0];
    m.quad([[a, z0], [b, z0], [b, z1], [a, z1]], n, side);
  });
}

// 天井のある平地（lid＝terraceLid）：床（開いた口の外 0.05m まで。口の前の床と同じ色）、壁の辺の壁（ふちから外へ WALL_T、床の 0.3m 下から
// 天井まで。faces の面＝ガラスの扉など）、天井と、ふた（上はまわりの地面の 0.02m 上で、地面に貼った路面の色）。colors は buildMesh
function addCovered(m, tr, lid, c, look, colors) {
  const ring = tr.ring;
  const n = ring.length;
  const out = ringArea(ring) > 0 ? 1 : -1;
  const z0 = tr.elev;
  const z1 = lid.under;
  m.polygon([lid.floor], z0 + 0.005, [0, 0, 1], colors.floor(ring, lid));
  ring.forEach((a, i) => {
    if (!lid.walls[i]) return;
    const b = ring[(i + 1) % n];
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (L < 1e-6) return;
    const nn = [((b[1] - a[1]) / L) * out, (-(b[0] - a[0]) / L) * out]; // 外向き
    const off = (p) => [p[0] + nn[0] * WALL_T, p[1] + nn[1] * WALL_T];
    m.prism([a, b], [off(a), off(b)], [z0 - 0.3, z0 - 0.3], [z1, z1], { top: c, side: c }, { caps: false });
    const fc = tr.f.faces?.[i];
    if (fc && look) addFace(m, fc, { i, s0: 0, s1: L, L }, a, b, [z0, z0], [z1, z1], [-nn[0], -nn[1]], look);
  });
  m.polygon([lid.poly], z1, [0, 0, -1], colors.ceiling);
  m.polygon([lid.poly], lid.top - WALL_SINK, [0, 0, 1], colors.lid(lid.poly));
}

// 平地の壁の上の面（と天井のある平地のふた）は、高いほうの地面より WALL_SINK 下：地面がそのまま見えて、段差の補間で地面が下がる
// ところ（壁の帯の上）だけ壁の上の面が見える（地面より上に出すと、帯のふちが段になって線のように見える）
const WALL_SINK = 0.03;
// 平地のふちを垂直に切ったとき：ふちに沿って、平地とまわりの地面の段差に壁を立てる。
// 坂道・階段がふちを横切るところと、となりの平地のほうが高いところ（そちらが壁を立てる）はあける。
// 壁を立てない階段（walls: false）は、横切るところだけあけ、両わきのふちに沿うところは残す（平地の壁がその両わきの壁になる。
// 判定は campus3dFeatures.js の edgeOpen：焼き込みでも同じところのふちの外を掘らない）。
// ふちの外が建物で、その建物の壁が平地の高さより下まであれば、建物の壁が平地の壁（buildings：{ ring, bot }）。
// 天井のある平地（lids：平地 → terraceLid）は addCovered で描き、そのふちに面した低い平地の壁は、天井から上（まぐさ）だけ
function addTerraceWalls(m, tr, { groundAt, terraces, paths, buildings = [], lids = null, covered = null, topColor = null }, c, look = null) {
  const lid = lids?.get(tr);
  if (lid) {
    addCovered(m, tr, lid, c, look, covered);
    return;
  }
  const { pts } = densify([...tr.ring, tr.ring[0]], 1);
  const out = ringArea(tr.ring) > 0 ? -1 : 1; // 左回りなら中は進む向きの左なので、外は右
  // 外の地面を測る点：ふちから外へ WALL_T + 0.4。角では両どなりの辺の向きそれぞれで（留め継ぎの点は角から遠く、上端がとがる）
  const last0 = pts.length - 1;
  const nrm = (a, b) => { const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1; return [(-(b[1] - a[1]) / l) * out, ((b[0] - a[0]) / l) * out]; };
  const outers = pts.map((p, i) => {
    const prev = i > 0 ? pts[i - 1] : pts[last0 - 1];
    const next = i < last0 ? pts[i + 1] : pts[1];
    const ns = [nrm(prev, p), nrm(p, next)];
    const same = Math.abs(ns[0][0] - ns[1][0]) + Math.abs(ns[0][1] - ns[1][1]) < 1e-6;
    return (same ? ns.slice(0, 1) : ns).map((n) => [p[0] + n[0] * (WALL_T + 0.4), p[1] + n[1] * (WALL_T + 0.4)]);
  });
  const gaps = paths.filter((sl) => !isOpenStairs(sl.f)).map((sl) => ({ sl, hv: sl.hbv.map((h) => h + (sl.side > 0 ? WALL_T : 0)) }));
  const opens = paths.filter((sl) => isOpenStairs(sl.f)).map((sl) => stairsOpening(sl.f));
  // ふちの向き（点の前と後ろの辺。ring は閉じてあるので、最初と最後は同じ点）
  const dirOf = (a, b) => { const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1; return [(b[0] - a[0]) / l, (b[1] - a[1]) / l]; };
  const last = pts.length - 1;
  const lintel = pts.map(() => null); // 天井のある平地の口の上の点：その平地のふた（terraceLid）
  // ほかの平地の天井のある部屋の開いた口（壁でない辺）。口の線の上の点は、口の中ならまぐさ、口の両端はふつうの壁（外の地面を測る点が
  // 部屋のふちちょうどになって、部屋の中か外かが数 mm でゆれないように、ここで決める）
  const mouths = [];
  if (lids) for (const [t, L] of lids) if (t !== tr) t.ring.forEach((a, k) => { if (!L.walls[k]) mouths.push({ a, b: t.ring[(k + 1) % t.ring.length], L }); });
  const onMouth = (p) => {
    for (const mo of mouths) {
      const dx = mo.b[0] - mo.a[0];
      const dy = mo.b[1] - mo.a[1];
      const len = Math.hypot(dx, dy);
      const t = ((p[0] - mo.a[0]) * dx + (p[1] - mo.a[1]) * dy) / len;
      if (Math.abs((p[0] - mo.a[0]) * dy - (p[1] - mo.a[1]) * dx) / len < 0.05 && t > -0.005 && t < len + 0.005) return { L: mo.L, inside: t > 0.005 && t < len - 0.005 };
    }
    return null;
  };
  const ground = pts.map((p, i) => {
    const qs = outers[i];
    const mo = onMouth(p);
    if (mo?.inside) {
      lintel[i] = mo.L;
      return null;
    }
    if (gaps.some(({ sl, hv }) => stripDistance(sl.xy, sl.cum, hv, p, sl.cv).D <= 0)) return null;
    if (opens.length) {
      // 角の点は、どちらかの辺が階段のふちに沿っていれば残す（壁が角まで届く）
      const dirs = [dirOf(i > 0 ? pts[i - 1] : pts[last - 1], p), dirOf(p, i < last ? pts[i + 1] : pts[1])];
      if (dirs.every((dir) => edgeOpen(opens, p, dir))) return null;
    }
    if (buildings.some((bd) => bd.bot <= tr.elev + 0.05 && qs.every((q) => pointInRing(q[0], q[1], bd.ring)))) return null;
    // となりの平地のほうが高ければ、そちらが壁を立てる（ふちを斜めにした平地 side > 0 は壁を立てないので、こちらで）。
    // そちらが天井のある平地なら、こちらは天井から上の壁（まぐさ）だけ
    if (!mo && terraces.some((t) => t !== tr && !(t.side > 0) && t.elev > tr.elev + 0.05 && qs.some((q) => pointInRing(q[0], q[1], t.ring)))) return null;
    // 天井のある平地のふたの下（掘った帯）は、ふたの上の地面の高さ（口の両わきの壁が、掘った帯で低くならないように）
    let g = Math.max(...qs.map((q) => groundAt(toLngLat(q))));
    if (lids) for (const [t, L] of lids) if (t !== tr && qs.some((q) => pointInRing(q[0], q[1], L.poly))) g = Math.max(g, L.top);
    return Number.isFinite(g) && Math.abs(tr.elev - g) >= 0.15 ? g : null;
  });
  // 壁の上の面の色（点ごと）：段差の高い側の、壁の帯の外の路面の色（topColor。なければ壁の色）
  const topOf = (i, g) => {
    if (!topColor || g == null) return c;
    const prev = i > 0 ? pts[i - 1] : pts[last0 - 1];
    const next = i < last0 ? pts[i + 1] : pts[1];
    const no = nrm(prev, next);
    const d = g > tr.elev ? WALL_T + WALL_CAP + 0.4 : -(WALL_CAP + 0.4);
    return topColor(tr.f, [pts[i][0] + no[0] * d, pts[i][1] + no[1] * d]) || c;
  };
  const tops = pts.map((_, i) => topOf(i, ground[i]));
  const sameCol = (a, b) => a === b || (a[0] === b[0] && a[1] === b[1] && a[2] === b[2] && a[3] === b[3]);
  // 壁を立てる点が続くところ（上の色が同じところ）ごとに1枚
  for (let k = 0; k < pts.length; ) {
    if (ground[k] == null) { k++; continue; }
    let j = k;
    while (j + 1 < pts.length && ground[j + 1] != null && sameCol(tops[j + 1], tops[k])) j++;
    if (j + 1 < pts.length && ground[j + 1] != null) j++; // 色の変わり目の点は両方の区間に入れる（すき間なく）
    if (j > k) {
      const gs = ground.slice(k, j + 1);
      // 壁はふちから外へ WALL_T（地面の段差のつなぎ目をこの中に隠す）。表示の地面は、低い地面が高い側へ壁の外まで少しへこんで出る
      // （深い掘り下げで、壁のふちがのこぎりの歯のよう）ので、高い側へ WALL_CAP 広く：掘り下げ（外が高い）なら外へ、盛り（中が高い）なら中へ
      const inner = gs.map((g) => (g > tr.elev ? 0 : -out * WALL_CAP));
      const outer = gs.map((g) => out * (WALL_T + (g > tr.elev ? WALL_CAP : 0)));
      m.prism(...band(pts.slice(k, j + 1), inner, outer), gs.map((g) => Math.min(tr.elev, g) - 0.3), gs.map((g) => Math.max(tr.elev, g) - WALL_SINK), { top: tops[k], side: c });
    }
    k = j > k && j + 1 < pts.length && ground[j + 1] != null ? j : j + 1;
  }
  // 壁の帯の端が、出隅で開いたふち（坂道・階段が横切るところ）に続くとき：帯の端の面と、となりの辺の外向きのあいだに扇形のすき間が
  // あいて、ふちの外の掘った地面が見える（明かり取りの南東の角：南の壁の帯の端と、大階段の上の端）。そこを扇形の柱でふさぐ。
  // 坂道・階段の通り道にかかるところは、ふさがない
  const inPath = (q) => gaps.some(({ sl, hv }) => stripDistance(sl.xy, sl.cum, hv, q, sl.cv).D <= 0.02) || opens.some((o) => stripDistance(o.xy, o.cum, o.hwv, q, o.cv).D <= 0.02);
  const isOpen = (i) => ground[i] == null && !lintel[i];
  for (let i = 0; i < last; i++) {
    if (ground[i] == null) continue;
    const ip = i > 0 ? i - 1 : last - 1; // ふちは閉じている（最初と最後は同じ点）
    const inx = i + 1;
    const endRun = isOpen(inx) && ground[ip] != null; // 壁の帯の終わり（次の点から開く）
    const startRun = isOpen(ip) && ground[inx] != null; // 壁の帯の始まり（前の点まで開いている）
    if (!endRun && !startRun) continue;
    const P = pts[i];
    const turn = (P[0] - pts[ip][0]) * (pts[inx][1] - P[1]) - (P[1] - pts[ip][1]) * (pts[inx][0] - P[0]);
    if (turn * out > 0) continue; // 出隅だけ
    const n1 = nrm(pts[ip], P);
    const n2 = nrm(P, pts[inx]);
    const a1 = Math.atan2(n1[1], n1[0]);
    let da = Math.atan2(n2[1], n2[0]) - a1;
    while (da > Math.PI) da -= 2 * Math.PI;
    while (da < -Math.PI) da += 2 * Math.PI;
    if (Math.abs(da) < 0.03) continue;
    const w = WALL_T + WALL_CAP;
    // 角の外を掘っていなくても、ふさぐ：表示の地面は半 px ずれるので、帯の下の掘った地面が帯の端の外にはみ出して見える
    const nSeg = Math.max(1, Math.ceil(Math.abs(da) / (Math.PI / 8)));
    const fan = [P];
    for (let q = 0; q <= nSeg; q++) {
      const ang = a1 + (da * q) / nSeg;
      fan.push([P[0] + Math.cos(ang) * w, P[1] + Math.sin(ang) * w]);
    }
    if (fan.slice(1).some(inPath) || inPath([(fan[1][0] + fan[nSeg + 1][0]) / 2, (fan[1][1] + fan[nSeg + 1][1]) / 2])) continue;
    solidPoly(m, fan, Math.min(tr.elev, ground[i]) - 0.3, Math.max(tr.elev, ground[i]) - WALL_SINK, tops[i], c);
  }
  // まぐさ：天井のある平地の口の上。天井からまわりの地面の高さの壁で、上の帯はとなりの壁と同じ（外へ WALL_T + WALL_CAP、上は地面 + 0.05）。
  // 口の両わきの点（壁の点）まで 1 点ずつ広げる（口の両わきの細い辺のすき間をふさぐ。壁の端の面が口のわきの面）
  for (let k = 0; k < pts.length; ) {
    const L = lintel[k];
    if (!L) { k++; continue; }
    let j = k;
    while (j + 1 < pts.length && lintel[j + 1] === L) j++;
    const a0 = k > 0 && ground[k - 1] != null ? k - 1 : k;
    const b0 = j + 1 < pts.length && ground[j + 1] != null ? j + 1 : j;
    if (b0 > a0) {
      const run = pts.slice(a0, b0 + 1);
      const tc = topColor ? topColor(tr.f, (() => { const no = nrm(pts[a0], pts[b0]); const mid = [(pts[a0][0] + pts[b0][0]) / 2, (pts[a0][1] + pts[b0][1]) / 2]; return [mid[0] + no[0] * (WALL_T + WALL_CAP + 0.4), mid[1] + no[1] * (WALL_T + WALL_CAP + 0.4)]; })()) || c : c;
      m.prism(...band(run, run.map(() => 0), run.map(() => out * (WALL_T + WALL_CAP))), run.map(() => L.under), run.map(() => L.top - WALL_SINK), { top: tc, side: c });
      // まぐさと、となりの壁の継ぎ目（壁の点 a0・b0）：別々の角柱なので、ふちが曲がる角（出隅）では、壁の帯の端と、口の線を後ろへ
      // 延ばした線（その先は天井のある平地のふた）のあいだに、三角のすき間があいて掘った地面が見える（明かり取りの南西の角：西の壁と
      // 地下 2 階の南西の口）。壁の帯の外の面の線と口の線の交わり M までの三角の柱でふさぐ
      const w = WALL_T + WALL_CAP;
      const dirOf = (p, q) => { const l = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1; return [(q[0] - p[0]) / l, (q[1] - p[1]) / l]; };
      // 線 p + λ·d と q + μ·e の交わり（[λ, μ]。平行なら null）
      const meet = (p, d, q, e) => {
        const den = d[0] * e[1] - d[1] * e[0];
        if (Math.abs(den) < 1e-6) return null;
        return [((q[0] - p[0]) * e[1] - (q[1] - p[1]) * e[0]) / den, ((q[0] - p[0]) * d[1] - (q[1] - p[1]) * d[0]) / den];
      };
      [[a0, a0 > 0 ? a0 - 1 : last - 1, a0 + 1, true], [b0, b0 - 1, b0 < last ? b0 + 1 : 1, false]].forEach(([i, ip, inx, atStart]) => {
        if (atStart ? a0 === k : b0 === j) return; // 壁の点まで広げたはしだけ
        const P = pts[i];
        // 出隅だけ（ふちが外へ曲がる）。ほぼまっすぐなら、すき間はない
        const turn = (P[0] - pts[ip][0]) * (pts[inx][1] - P[1]) - (P[1] - pts[ip][1]) * (pts[inx][0] - P[0]);
        const dIn = dirOf(pts[ip], P);
        const dOut = dirOf(P, pts[inx]);
        if (Math.abs(dIn[0] * dOut[1] - dIn[1] * dOut[0]) < 0.02 || turn * out > 0) return;
        // 壁の帯（はしでは a0 の前、b0 の後ろ）と、口（まぐさ）の線
        const wallN = atStart ? nrm(pts[ip], P) : nrm(P, pts[inx]);
        const wallD = atStart ? dIn : [-dOut[0], -dOut[1]]; // 壁の帯の外の面の線を、角へ向かって延ばす向き
        const mouthD = atStart ? [-dOut[0], -dOut[1]] : dIn; // 口の線を、角から外へ延ばす向き
        const C = [P[0] + wallN[0] * w, P[1] + wallN[1] * w]; // 壁の帯の端の外の角
        const r = meet(C, wallD, P, mouthD);
        const M = r && r[0] >= 0 && r[0] <= 3 * w && r[1] >= 0 && r[1] <= 3 * w ? [C[0] + wallD[0] * r[0], C[1] + wallD[1] * r[0]] : null;
        if (!M) return;
        const z1 = Math.max(ground[i], L.top) - WALL_SINK;
        const z0 = Math.min(tr.elev, ground[i]) - 0.3;
        solidPoly(m, [P, C, M], z0, z1, tc, c);
      });
    }
    k = j + 1;
  }
  if (!look) return;
  // 辺ごとの面の見た目：壁のある区間（両端とも壁を立てる点）ごとに、段差の低いほうに向く面へ。
  // 区間 j は、ふちを細かくした点 j → j+1（densify と同じく、辺 i を ceil(長さ) 等分した何番目か）
  if (tr.f.faces) {
    const segs = [];
    tr.ring.forEach((a, i) => {
      const b = tr.ring[(i + 1) % tr.ring.length];
      const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const n = Math.max(1, Math.ceil(L / 1));
      for (let s = 0; s < n; s++) segs.push({ i, s0: (L * s) / n, s1: (L * (s + 1)) / n, L });
    });
    // 盛りの面は、辺の両端で壁の帯の外の角（留め継ぎ）まで（出た角なら伸ばし、入った角なら縮める）
    const corners = offsetRingBy(tr.ring, tr.ring.map(() => WALL_T));
    for (let j = 0; j + 1 < pts.length; j++) {
      const se = segs[j];
      const fc = tr.f.faces[se.i];
      if (!fc || ground[j] == null || ground[j + 1] == null) continue;
      const gs = [ground[j], ground[j + 1]];
      const sunk = gs[0] + gs[1] > 2 * tr.elev; // 掘り下げ：面は中（ふちの上）、盛り：面は外（ふちから WALL_T 外）
      const no = nrm(pts[j], pts[j + 1]); // 外向き
      const d = sunk ? 0 : WALL_T;
      let [p, q] = [pts[j], pts[j + 1]].map((v) => [v[0] + no[0] * d, v[1] + no[1] * d]);
      if (!sunk && corners.length === tr.ring.length) {
        if (se.s0 < 1e-9) p = corners[se.i];
        if (se.s1 > se.L - 1e-9) q = corners[(se.i + 1) % tr.ring.length];
      }
      const lo = sunk ? [tr.elev, tr.elev] : gs;
      const hi = gs.map((g) => Math.max(tr.elev, g) - WALL_SINK);
      addFace(m, fc, segs[j], p, q, lo, hi, sunk ? [-no[0], -no[1]] : no, look);
    }
  }
  // 梁：両端は壁の中へ 0.3m 入れる。上は top（平らにした地面から）か、両端の外の地面
  (tr.f.beams || []).forEach((bm) => {
    const [a, b] = bm.coords.map(toXY);
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const u = [(b[0] - a[0]) / L, (b[1] - a[1]) / L];
    const outside = (p, sg) => groundAt(toLngLat([p[0] + sg * u[0] * (WALL_T + 0.4), p[1] + sg * u[1] * (WALL_T + 0.4)]));
    const top = bm.top != null ? [tr.elev + bm.top, tr.elev + bm.top] : [outside(a, -1), outside(b, 1)];
    if (!top.every(Number.isFinite)) return;
    const line = [[a[0] - u[0] * 0.3, a[1] - u[1] * 0.3], [b[0] + u[0] * 0.3, b[1] + u[1] * 0.3]];
    m.prism(offsetLine(line, bm.width / 2), offsetLine(line, -bm.width / 2), top.map((t) => t - bm.depth), top, { top: c, side: c, bottom: c }, { bottom: true });
  });
}

// 平地の壁の面（faces の1つ fc）を、区間 p→q（辺の上の se.s0〜se.s1 m）に描く。lo・hi は両端の面の下と上の標高、n は面の向き。
// ガラス（base〜glass。縦の桟は辺の始まりから pitch m ごと、横の桟は rows、下の端に枠、上の端に桟）と扉（doors：ガラスの下の端から
// DOOR_H の暗いガラスと枠）、れんが（ガラスの上から面の上まで。目地つき）。どれも壁の面から少し出す
const FACE_OFF = 0.012;
const MULL_W = 0.07; // 桟の幅（m）
const MULL_D = 0.05; // 桟の出（ガラスの面から）
const DOOR_H = 2.4;
const BRICK_COURSE = 0.3; // れんがの目地の間隔
function addFace(m, fc, se, p, q, lo, hi, n, look) {
  const span = se.s1 - se.s0 || 1;
  const N = [n[0], n[1], 0];
  const u = [(q[0] - p[0]) / span, (q[1] - p[1]) / span]; // 辺の向き（区間の長さ = span）
  const at = (s, d) => { const t = (s - se.s0) / span; return [p[0] + (q[0] - p[0]) * t + n[0] * d, p[1] + (q[1] - p[1]) * t + n[1] * d]; };
  const zAt = (arr, s) => arr[0] + (arr[1] - arr[0]) * ((s - se.s0) / span);
  // 面に平行な四角：辺の上の s0〜s1、下 b・上 t（標高の関数 s → z）、面から d 出して、角ごとの色
  const panel = (s0, s1, b, t, d, cs) => {
    const A = at(s0, d);
    const B = at(s1, d);
    const zb = [b(s0), b(s1)];
    const zt = [t(s0), t(s1)];
    if (zt[0] - zb[0] < 1e-3 && zt[1] - zb[1] < 1e-3) return;
    m.quadColors([[A, zb[0]], [B, zb[1]], [B, Math.max(zb[1], zt[1])], [A, Math.max(zb[0], zt[0])]], N, Array.isArray(cs[0]) ? cs : [cs, cs, cs, cs]);
  };
  // 桟（面から出た細い角材）：前の面と上の面と両わき
  const bar = (s0, s1, b, t, col) => {
    panel(s0, s1, b, t, FACE_OFF + MULL_D, col);
    const top = [at(s0, FACE_OFF), at(s1, FACE_OFF), at(s1, FACE_OFF + MULL_D), at(s0, FACE_OFF + MULL_D)];
    m.quad([[top[0], t(s0)], [top[1], t(s1)], [top[2], t(s1)], [top[3], t(s0)]], [0, 0, 1], col);
    [[s0, -1], [s1, 1]].forEach(([s, sg]) => {
      const a0 = at(s, FACE_OFF);
      const a1 = at(s, FACE_OFF + MULL_D);
      m.quad([[a0, b(s)], [a1, b(s)], [a1, t(s)], [a0, t(s)]], [u[0] * sg, u[1] * sg, 0], col);
    });
  };
  const flat = (z) => () => z;
  const base = (s) => zAt(lo, s) + (fc.base || 0);
  const gTop = (s) => Math.min(zAt(lo, s) + (fc.glass || 0), zAt(hi, s));
  if (fc.glass) {
    const [g0, g1] = fc.frost ? look.frost : look.glass;
    const h = fc.glass - (fc.base || 0);
    const col = (s, z) => mix(g0, g1, Math.min(1, Math.max(0, (z - base(s)) / h)));
    const cs = (s0, s1) => [col(s0, base(s0)), col(s1, base(s1)), col(s1, gTop(s1)), col(s0, gTop(s0))];
    panel(se.s0, se.s1, base, gTop, FACE_OFF, cs(se.s0, se.s1));
    // 扉：ガラスの下の端から DOOR_H の暗いガラス（両わきと上に枠）
    (fc.doors || []).forEach(([d0, d1]) => {
      const s0 = Math.max(se.s0, d0 * se.L);
      const s1 = Math.min(se.s1, d1 * se.L);
      if (s1 - s0 < 1e-3) return;
      const dt = (s) => Math.min(base(s) + DOOR_H, gTop(s));
      panel(s0, s1, base, dt, FACE_OFF + 0.004, look.door);
      bar(s0, s1, (s) => dt(s) - 0.1, dt, look.frame);
      [d0 * se.L, d1 * se.L].forEach((s) => {
        if (s < se.s0 - 1e-6 || s > se.s1 + 1e-6 || (Math.abs(s - se.s1) < 1e-6 && se.s1 < se.L - 1e-6)) return;
        bar(Math.max(0, s - MULL_W), Math.min(se.L, s + MULL_W), base, dt, look.frame);
      });
    });
    // 下の端の枠と上の端の桟、横の桟
    bar(se.s0, se.s1, base, (s) => base(s) + 0.12, look.frame);
    bar(se.s0, se.s1, (s) => gTop(s) - 0.08, gTop, look.frame);
    // 横の桟（扉の高さより下なら扉のところをあける）
    (fc.rows || []).forEach((r) => {
      const z = (s) => zAt(lo, s) + r;
      if (z(se.s0) >= gTop(se.s0)) return;
      let cuts = [[se.s0, se.s1]];
      if (r < (fc.base || 0) + DOOR_H) {
        (fc.doors || []).forEach(([d0, d1]) => {
          cuts = cuts.flatMap(([a, b]) => [[a, Math.min(b, d0 * se.L)], [Math.max(a, d1 * se.L), b]]).filter(([a, b]) => b - a > 1e-3);
        });
      }
      cuts.forEach(([a, b]) => bar(a, b, (s) => z(s) - 0.04, (s) => z(s) + 0.04, look.frame));
    });
    // 縦の桟：辺の始まりから pitch ごと（辺の両端にも）。区間の境目の桟は、始まりの側の区間で幅ぜんぶを描く
    const pitch = fc.pitch || 1.5;
    const k = Math.max(1, Math.round(se.L / pitch));
    for (let i = 0; i <= k; i++) {
      const s = (se.L * i) / k;
      if (s < se.s0 - 1e-6 || s > se.s1 + 1e-6 || (Math.abs(s - se.s1) < 1e-6 && se.s1 < se.L - 1e-6)) continue;
      bar(Math.max(0, s - MULL_W / 2), Math.min(se.L, s + MULL_W / 2), base, gTop, look.frame);
    }
  }
  // ウッドデッキの縁：上の DECK_FASCIA は木の板、その下は奥の暗いすき間と灰色の束（辺の始まりから DECK_POST m おき）
  if (fc.deck && look.deckFace) {
    const top = (s) => zAt(hi, s);
    const fb = (s) => Math.max(zAt(lo, s), top(s) - DECK_FASCIA);
    panel(se.s0, se.s1, fb, top, FACE_OFF, look.deckFace);
    panel(se.s0, se.s1, (s) => zAt(lo, s), fb, FACE_OFF, look.deckGap);
    const k0 = Math.ceil((se.s0 - DECK_POST / 2) / DECK_POST);
    for (let k = k0; (k + 0.5) * DECK_POST - 0.08 < se.s1; k++) {
      const c0 = (k + 0.5) * DECK_POST;
      const a = Math.max(se.s0, c0 - 0.08), b = Math.min(se.s1, c0 + 0.08);
      if (b - a < 0.01) continue;
      panel(a, b, (s) => zAt(lo, s), fb, FACE_OFF + 0.004, look.deckPost);
    }
  }
  // れんが：ガラスの上（ガラスがなければ面の下）から上まで。目地は下の地面から BRICK_COURSE ごと
  if (fc.brick) {
    const from = fc.glass ? gTop : (s) => zAt(lo, s);
    const to = (s) => zAt(hi, s);
    panel(se.s0, se.s1, from, to, FACE_OFF, look.brick);
    for (let z = BRICK_COURSE; z < 80; z += BRICK_COURSE) {
      const zl = (s) => zAt(lo, s) + z;
      if (zl(se.s0) > to(se.s0) - 0.05 && zl(se.s1) > to(se.s1) - 0.05) break;
      if (zl(se.s0) < from(se.s0) + 0.05 || zl(se.s0) > to(se.s0) - 0.05) continue;
      panel(se.s0, se.s1, zl, (s) => zl(s) + 0.025, FACE_OFF + 0.003, look.brickLine);
    }
  }
}

// 線分 a-b と c-d が交わる、a-b の上の位置（0〜1 のあいだ。交わらなければ null）
function crossT(a, b, c, d) {
  const r = [b[0] - a[0], b[1] - a[1]];
  const s = [d[0] - c[0], d[1] - c[1]];
  const den = r[0] * s[1] - r[1] * s[0];
  if (Math.abs(den) < 1e-12) return null;
  const t = ((c[0] - a[0]) * s[1] - (c[1] - a[1]) * s[0]) / den;
  const u = ((c[0] - a[0]) * r[1] - (c[1] - a[1]) * r[0]) / den;
  return t > 1e-9 && t < 1 - 1e-9 && u >= -1e-9 && u <= 1 + 1e-9 ? t : null;
}
const closeRing = (r) => [...r, r[0]];

// くり抜きの床と天井の高さ（地面から m）：点ごとの高さ（floors・ceils。null の点は bottom・top）を、くり抜きの形を三角形に
// 分けて平らな面で結ぶ（点のあいだは連続した斜めの面）。tris は三角形ごとの平面の式 [a, b, c]（高さ = a·x + b·y + c）
const planeVal = (fn, p) => fn[0] * p[0] + fn[1] * p[1] + fn[2];
export function carveSurfaces(cr, cv) {
  const fl = cr.map((_, i) => cv.floors?.[i] ?? cv.bottom);
  const ce = cv.top == null ? null : cr.map((_, i) => Math.max(fl[i] + 0.3, cv.ceils?.[i] ?? cv.top));
  const flat = (v) => v.every((x) => Math.abs(x - v[0]) < 1e-6);
  const sloped = !flat(fl) || (ce && !flat(ce));
  if (!sloped) return { sloped, tris: [], floorAt: () => fl[0], ceilAt: ce ? () => ce[0] : null };
  const plane = (i, j, k, v) => {
    const p = cr[i];
    const dq = [cr[j][0] - p[0], cr[j][1] - p[1]];
    const dr = [cr[k][0] - p[0], cr[k][1] - p[1]];
    const d = dq[0] * dr[1] - dr[0] * dq[1];
    if (Math.abs(d) < 1e-9) return [0, 0, (v[i] + v[j] + v[k]) / 3];
    const a = ((v[j] - v[i]) * dr[1] - (v[k] - v[i]) * dq[1]) / d;
    const b = (dq[0] * (v[k] - v[i]) - dr[0] * (v[j] - v[i])) / d;
    return [a, b, v[i] - a * p[0] - b * p[1]];
  };
  const idx = earcut(cr.flat(), null, 2);
  const tris = [];
  for (let t = 0; t + 2 < idx.length; t += 3) {
    const [i, j, k] = [idx[t], idx[t + 1], idx[t + 2]];
    tris.push({ ring: [cr[i], cr[j], cr[k]], fl: plane(i, j, k, fl), ce: ce ? plane(i, j, k, ce) : null });
  }
  // 点 p のある三角形（ふちの上や少し外なら、いちばん近い三角形）
  const triAt = (p) => {
    let best = null;
    for (const t of tris) {
      const [a, b, c] = t.ring;
      const d = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1]);
      if (Math.abs(d) < 1e-12) continue;
      const w1 = ((b[1] - c[1]) * (p[0] - c[0]) + (c[0] - b[0]) * (p[1] - c[1])) / d;
      const w2 = ((c[1] - a[1]) * (p[0] - c[0]) + (a[0] - c[0]) * (p[1] - c[1])) / d;
      const out = Math.max(0, -w1, -w2, -(1 - w1 - w2)); // 外にはみ出している量
      if (!best || out < best.out) best = { t, out };
    }
    return best ? best.t : tris[0];
  };
  return { sloped, tris, floorAt: (p) => planeVal(triAt(p).fl, p), ceilAt: ce ? (p) => planeVal(triAt(p).ce, p) : null };
}
// 線分 p→q を step m ごとの点に
const stepsAlong = (p, q, step = 0.5) => {
  const n = Math.max(1, Math.ceil(Math.hypot(q[0] - p[0], q[1] - p[1]) / step));
  return Array.from({ length: n + 1 }, (_, k) => [p[0] + ((q[0] - p[0]) * k) / n, p[1] + ((q[1] - p[1]) * k) / n]);
};

// くり抜きの点のうち、建物のふちから REACH m 以内のものは、ふちの外 OUT m へ出す：ふちに合わせて（吸い付かせて）描いたのに
// ふちとの細いすき間やふちちょうどの重なりで、建物の端が薄く残らないように。角の近く（両どなりの辺とも近い）なら角の外へ
const REACH = 0.8;
const OUT = 0.3;
export function reachOut(cr, ring) {
  const n = ring.length;
  const out = ringArea(ring) > 0 ? 1 : -1; // 左回りなら外は辺の右
  const edges = ring.map((a, i) => {
    const b = ring[(i + 1) % n];
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    return { a, b, l, nrm: [((b[1] - a[1]) / l) * out, (-(b[0] - a[0]) / l) * out] };
  });
  return cr.map((p) => {
    const near = [];
    edges.forEach((e, i) => {
      const t = Math.max(0, Math.min(1, ((p[0] - e.a[0]) * (e.b[0] - e.a[0]) + (p[1] - e.a[1]) * (e.b[1] - e.a[1])) / (e.l * e.l)));
      const q = [e.a[0] + (e.b[0] - e.a[0]) * t, e.a[1] + (e.b[1] - e.a[1]) * t];
      const d = Math.hypot(p[0] - q[0], p[1] - q[1]);
      if (d <= REACH) near.push({ i, q, d });
    });
    if (!near.length) return p;
    near.sort((x, y) => x.d - y.d);
    const e0 = near[0];
    // 角：いちばん近い辺のとなりの辺も近く、その角の点が近い
    const other = near.find((x) => x.i === (e0.i + 1) % n || x.i === (e0.i - 1 + n) % n);
    if (other) {
      const vi = other.i === (e0.i + 1) % n ? (e0.i + 1) % n : e0.i;
      const v = ring[vi];
      if (Math.hypot(p[0] - v[0], p[1] - v[1]) <= REACH * 1.5) {
        const m = [edges[e0.i].nrm[0] + edges[other.i].nrm[0], edges[e0.i].nrm[1] + edges[other.i].nrm[1]];
        const ml = Math.hypot(m[0], m[1]) || 1;
        return [v[0] + (m[0] / ml) * OUT * 1.5, v[1] + (m[1] / ml) * OUT * 1.5];
      }
    }
    const nr = edges[e0.i].nrm;
    return [e0.q[0] + nr[0] * OUT, e0.q[1] + nr[1] * OUT];
  });
}

// 建物（地図の建物の置きかえ）：屋根（斜めに切る面ごとに平らな多角形に分けて張る＝roofPieces）と、まわりの壁。地面は MapLibre の
// fill-extrusion と同じく形の点の平均の位置で測り（屋上の高さはそこから）、下は形の点でいちばん低い地面より 1m 下まで。
// 地面まで切れたところ（屋根の高さ 0）は建物がない。
// くり抜き（ベランダ・テラス）：建物と重なるところの床（床の高さ）と天井（天井の高さ。上まで抜けていれば屋根ごと無し）、
// 外の壁はそこだけ床から天井まであけ、くり抜きのふちの奥の壁と、床のふちの手すり壁（1.1m）を立てる。clip は polygon-clipping
// （なければくり抜かない）
const ROOF_MIN = 0.05;
const RAIL_H = 1.1;
const RAIL_T = 0.12;
const PLANT_DEPTH = 0.9; // 段々の屋根で、これより奥行きのある段だけ植え込みにする（m）
const PLANT_CHUNK = 2; // 植え込みかどうかを決める区切り（東西 m ごと）
// look は見た目（buildMesh）：ガラスの色 [下, 上]・窓の桟・屋上の緑・軒の色
function addBuilding(m, f, groundAt, c, clip = null, look = null) {
  const ring = f.coords.map(toXY);
  if (ring.length < 3) return;
  const mean = ring.reduce((a, p) => [a[0] + p[0] / ring.length, a[1] + p[1] / ring.length], [0, 0]);
  const g0 = groundAt(f.groundRef || toLngLat(mean));
  const gs = ring.map((p) => groundAt(toLngLat(p))).filter(Number.isFinite);
  if (!Number.isFinite(g0) || !gs.length) return;
  const bot = Math.min(g0, ...gs) - 1;
  // 宙に浮いた建物（base）：外の壁は下の面（船底の形なら点ごと）から。下の面は下向きに描く
  const soff = buildingSoffit(f, ring);
  const bAt = (p) => (soff ? g0 + soff.at(p) : bot);
  // 鉄骨の外階段：壁と屋根のかわりに鉄骨
  if (f.frame) {
    if (look) addFrame(m, f, ring, g0, bot, look);
    return;
  }
  const cIn = [c[0] * 0.86, c[1] * 0.86, c[2] * 0.86, c[3]]; // くり抜きの奥（奥の壁・天井）は少し暗く：外の壁と同じ向きでも、へこみが見えるように
  const roof = buildingRoof(f);
  const hAt = roof.hAt;
  const pieces = roofPieces(f, ring);
  // 段々の屋根（step）：段ごとの水平な多角形（pieces）と、段の境目の蹴上げ
  const stepped = roof.step > 0;
  const risers = stepped ? roofRisers(f, ring) : [];
  // 屋根の色：屋上の緑なら緑、木の床なら木の色。段々の屋根に屋上の緑なら、段ごとに植え込み（緑）か木の段（半分ほどが植え込み。
  // 段の高さで決まる）。低いところ（いちばん低い段から 2m まで）・いちばん高いところ・奥行きの浅い段（PLANT_DEPTH より浅い＝
  // 観客席）は木の段。奥行きは段の高さ ÷ 斜面の傾き（扇の段は要から離れるほど深い）
  const zLow = stepped ? Math.min(...roof.cuts.map((ct) => roof.level(ct.low))) : 0;
  const planted = (z) => f.roof === "green" && z > zLow + 2 && z < roof.H - 1e-6 && seeded(hashStr(`${f.id}:${Math.round(z * 100)}`))() < 0.5;
  const depthAt = (p) => {
    const d = 0.05;
    const g = Math.hypot(roof.hSmooth([p[0] + d, p[1]]) - roof.hSmooth([p[0] - d, p[1]]), roof.hSmooth([p[0], p[1] + d]) - roof.hSmooth([p[0], p[1] - d])) / (2 * d);
    return g > 1e-6 ? roof.step / g : Infinity;
  };
  // 上のほう（いちばん高いところの 8 割より上）は、植え込みが続かず箱がところどころ（PLANT_CHUNK m ごとに 4 割）
  const greenAt = (p, z) => (!stepped ? f.roof === "green" : planted(z) && depthAt(p) >= PLANT_DEPTH && (z < roof.H * 0.8 || seeded(hashStr(`${f.id}:${Math.round(z * 100)}:${Math.floor(p[0] / PLANT_CHUNK)}`))() < 0.4));
  const roofCol = (z, p = null) => (!look || !f.roof ? c : f.roof === "deck" ? look.deck : f.roof === "glass" ? look.glassRoof : f.roof === "solar" ? look.parapet : !stepped || (p ? greenAt(p, z) : planted(z)) ? look.green : look.deck);
  // くり抜き：建物と重なるところ（inside）と、天井が屋根より上なら上まで抜ける（open）
  const carves = !clip ? [] : (f.carves || []).map((cv) => {
    const cr = reachOut(cv.coords.map(toXY), ring);
    let inside = [];
    try {
      inside = clip.intersection([closeRing(ring)], [closeRing(cr)]);
    } catch {
      inside = [];
    }
    if (!inside.length) return null;
    const sf = carveSurfaces(cr, cv);
    // 天井がどこでも屋根より上なら、上まで抜ける（屋根に穴をあける）
    const open = !sf.ceilAt || inside.flatMap((pg) => pg[0]).every((p) => sf.ceilAt(p) >= hAt(p) - ROOF_MIN);
    return { ...cv, ring: cr, inside, open, ...sf };
  }).filter(Boolean);
  const carveAt = (p) => carves.find((cv) => pointInRing(p[0], p[1], cv.ring)) || null;
  // 屋根（上まで抜けたくり抜きのところは除く）。段々の屋根で植え込みになりうる段は、東西 PLANT_CHUNK m ごとに区切って、
  // 区切りごとに奥行きで植え込みか木の段か決める
  const openRings = carves.filter((cv) => cv.open).map((cv) => [closeRing(cv.ring)]);
  // 屋根の板があれば：斜めの屋根は BOARD_BASE_DROP 下げて暗く（板のあいだのすき間）、板は1枚ずつ厚さ BOARD_T の板
  const boardList = roof.boards.list;
  if (boardList.length) {
    for (const { poly, fn } of pieces) {
      const l = Math.hypot(fn[0], fn[1], 1);
      let parts = [[poly]];
      if (openRings.length) {
        try {
          parts = clip.difference([closeRing(poly)], ...openRings);
        } catch {
          parts = [[poly]];
        }
      }
      for (const pg of parts) m.polygon(pg, (p) => g0 + Math.max(0, planeVal(fn, p) - BOARD_BASE_DROP), [-fn[0] / l, -fn[1] / l, 1 / l], look ? look.riser : cIn);
    }
    // 段の蹴上げ：板のふちのすぐ外（建物の中で、上まで抜けたくり抜きでないところ）の、いちばん高い下の面（下の板の上面か、板の下の暗い面）。
    // 外にもっと高い板がかぶっていれば null（そのふちは見えない）。建物の外・くり抜きの上は null（張り出しのまま）
    const baseAt = (p) => Math.max(0, roof.hSmooth(p) - BOARD_BASE_DROP);
    // 線分 a→q のうち、建物の形の中にある範囲（[t0, t1] の並び）
    const insideSpans = (a, q) => {
      const ts = [0, 1];
      ring.forEach((r, i) => {
        const t = crossT(a, q, r, ring[(i + 1) % ring.length]);
        if (t != null) ts.push(t);
      });
      ts.sort((x, y) => x - y);
      const out = [];
      for (let k = 0; k + 1 < ts.length; k++) {
        const tm = (ts[k] + ts[k + 1]) / 2;
        if (ts[k + 1] - ts[k] > 1e-6 && pointInRing(a[0] + (q[0] - a[0]) * tm, a[1] + (q[1] - a[1]) * tm, ring)) out.push([ts[k], ts[k + 1]]);
      }
      return out;
    };
    const belowAt = (p, zTop, self) => {
      if (!pointInRing(p[0], p[1], ring) || carves.some((cv) => cv.open && pointInRing(p[0], p[1], cv.ring))) return null;
      let best = baseAt(p);
      for (const o of boardList) {
        if (o === self || p[0] < o.box[0] || p[0] > o.box[2] || p[1] < o.box[1] || p[1] > o.box[3] || !pointInRing(p[0], p[1], o.ring)) continue;
        const z = o.zAt(p);
        if (z > zTop + 0.01) return null;
        best = Math.max(best, z);
      }
      return best;
    };
    for (const b of boardList) {
      const r = ringArea(b.ring) > 0 ? b.ring : b.ring.slice().reverse();
      const zt = (p) => g0 + b.zAt(p);
      const zb = (p) => zt(p) - BOARD_T;
      const top = !look ? c : b.kind === "green" ? look.green : look.deck;
      const side = [top[0] * 0.8, top[1] * 0.8, top[2] * 0.8, top[3]];
      const ln = Math.hypot(b.fn[0], b.fn[1], 1);
      m.polygon([r], zt, [-b.fn[0] / ln, -b.fn[1] / ln, 1 / ln], top);
      m.polygon([r], zb, [b.fn[0] / ln, b.fn[1] / ln, -1 / ln], look ? look.eave : cIn);
      r.forEach((a, i) => {
        const q = r[(i + 1) % r.length];
        const L = Math.hypot(q[0] - a[0], q[1] - a[1]);
        if (L < 1e-6) return;
        const nrm = [(q[1] - a[1]) / L, -(q[0] - a[0]) / L, 0];
        m.quad([[a, zb(a)], [q, zb(q)], [q, zt(q)], [a, zt(a)]], nrm, side);
        // 蹴上げ：板の下から下の面まで、ふちに沿って 0.75m ごとに（となりどうしで下の面が同じなら 1 枚に）。段のあいだから下が透けないように。
        // 建物の形の中のところだけ（ふちの近くで外へ出ると、外の壁の角から板の色の柱のように見える）
        const n = Math.max(1, Math.ceil(L / 0.75));
        const inside = insideSpans(a, q);
        let run = null;
        const flush = () => {
          if (!run) return;
          for (const [s0, s1] of inside) {
            const t0 = Math.max(run.t0, s0);
            const t1 = Math.min(run.t1, s1);
            if (t1 - t0 < 1e-4) continue;
            const p0 = [a[0] + (q[0] - a[0]) * t0, a[1] + (q[1] - a[1]) * t0];
            const p1 = [a[0] + (q[0] - a[0]) * t1, a[1] + (q[1] - a[1]) * t1];
            m.quad([[p0, g0 + run.z], [p1, g0 + run.z], [p1, zb(p1)], [p0, zb(p0)]], nrm, side);
          }
          run = null;
        };
        for (let k = 0; k < n; k++) {
          const t0 = k / n, t1 = (k + 1) / n;
          const mid = [a[0] + (q[0] - a[0]) * ((t0 + t1) / 2), a[1] + (q[1] - a[1]) * ((t0 + t1) / 2)];
          const zbm = b.zAt(mid) - BOARD_T;
          const z = belowAt([mid[0] + nrm[0] * 0.08, mid[1] + nrm[1] * 0.08], zbm, b);
          if (z == null || zbm - z < 0.02) { flush(); continue; }
          if (run && Math.abs(run.z - z) < 0.02) run.t1 = t1;
          else { flush(); run = { t0, t1, z }; }
        }
        flush();
      });
    }
  }
  for (const { poly, fn } of boardList.length ? [] : pieces) {
    const l = Math.hypot(fn[0], fn[1], 1);
    const zf = (p) => g0 + fn[0] * p[0] + fn[1] * p[1] + fn[2];
    let parts = [[poly]];
    if (openRings.length) {
      try {
        parts = clip.difference([closeRing(poly)], ...openRings);
      } catch {
        parts = [[poly]];
      }
    }
    const nrm = [-fn[0] / l, -fn[1] / l, 1 / l];
    // ガラスの屋根：斜面の向き（傾きの向き）の縦の桟を、それに直角の向きに glassPitch m ごと
    if (look && f.roof === "glass" && Math.hypot(fn[0], fn[1]) > 1e-4) {
      const gl = Math.hypot(fn[0], fn[1]);
      const w = [-fn[1] / gl, fn[0] / gl];
      const ws = poly.map((p) => p[0] * w[0] + p[1] * w[1]);
      const pitchR = f.glassPitch || 1.5;
      for (let c0 = Math.ceil(Math.min(...ws) / pitchR) * pitchR; c0 < Math.max(...ws); c0 += pitchR) {
        const ts = [];
        poly.forEach((a, i) => {
          const b = poly[(i + 1) % poly.length];
          const wa = a[0] * w[0] + a[1] * w[1] - c0;
          const wb = b[0] * w[0] + b[1] * w[1] - c0;
          if ((wa < 0) !== (wb < 0)) {
            const t = wa / (wa - wb);
            ts.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
          }
        });
        ts.sort((p, q) => p[0] * fn[0] + p[1] * fn[1] - (q[0] * fn[0] + q[1] * fn[1]));
        for (let k = 0; k + 1 < ts.length; k += 2) {
          const [p, q] = [ts[k], ts[k + 1]];
          const o = [w[0] * 0.03, w[1] * 0.03];
          const lift = (x) => zf(x) + 0.03;
          m.quad([[[p[0] - o[0], p[1] - o[1]], lift(p)], [[q[0] - o[0], q[1] - o[1]], lift(q)], [[q[0] + o[0], q[1] + o[1]], lift(q)], [[p[0] + o[0], p[1] + o[1]], lift(p)]], nrm, look.mullion);
        }
      }
    }
    for (const pg of parts) {
      if (!stepped || !look || !planted(fn[2]) || pg.length > 1) {
        m.polygon(pg, zf, nrm, roofCol(fn[2], stepped && look && planted(fn[2]) ? pg[0][0] : null));
        continue;
      }
      const r0 = pg[0][0][0] === pg[0][pg[0].length - 1][0] && pg[0][0][1] === pg[0][pg[0].length - 1][1] ? pg[0].slice(0, -1) : pg[0];
      const xs = r0.map((p) => p[0]);
      for (let x0 = Math.floor(Math.min(...xs) / PLANT_CHUNK) * PLANT_CHUNK; x0 < Math.max(...xs); x0 += PLANT_CHUNK) {
        const ch = clipHalf(clipHalf(r0, (p) => p[0] - x0), (p) => x0 + PLANT_CHUNK - p[0]);
        if (ch.length < 3 || Math.abs(ringArea(ch)) < 1e-4) continue;
        const cx = ch.reduce((a, p) => [a[0] + p[0] / ch.length, a[1] + p[1] / ch.length], [0, 0]);
        m.polygon([ch], zf, nrm, roofCol(fn[2], cx));
      }
    }
  }
  // 段々の屋根の蹴上げ（屋上が緑・木の床なら暗い色で、上の端に段の板の小口＝木の色の帯 0.1m。下から見ると明るい線が並ぶ）。
  // 上まで抜けたくり抜きの中は、くり抜きの床より上を描かない
  const opens = carves.filter((cv) => cv.open);
  const NOSE = 0.1;
  for (const { a, b, lo, hi, n } of risers) {
    const rc = look && f.roof ? look.riser : cIn;
    const nose = look && f.roof ? look.deck : null;
    const ks = [0, 1];
    for (const cv of opens) {
      cv.ring.forEach((cp, j) => {
        const t = crossT(a, b, cp, cv.ring[(j + 1) % cv.ring.length]);
        if (t != null) ks.push(t);
      });
    }
    ks.sort((x, y) => x - y);
    for (let k = 0; k + 1 < ks.length; k++) {
      if (ks[k + 1] - ks[k] < 1e-6) continue;
      const p = [a[0] + (b[0] - a[0]) * ks[k], a[1] + (b[1] - a[1]) * ks[k]];
      const q = [a[0] + (b[0] - a[0]) * ks[k + 1], a[1] + (b[1] - a[1]) * ks[k + 1]];
      const mid = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
      const cv = opens.find((o) => pointInRing(mid[0], mid[1], o.ring));
      const top = cv ? Math.min(hi, Math.max(0, cv.floorAt(mid))) : hi;
      if (top - lo < 0.01) continue;
      const band = nose && top === hi && top - lo > NOSE * 2 ? NOSE : 0;
      m.quad([[p, g0 + lo], [q, g0 + lo], [q, g0 + top - band], [p, g0 + top - band]], [n[0], n[1], 0], rc);
      if (band) m.quad([[p, g0 + top - band], [q, g0 + top - band], [q, g0 + top], [p, g0 + top]], [n[0], n[1], 0], nose);
    }
  }
  // くり抜きの床は屋根より上にしない：屋根の面ごとに分けて、屋根のほうが低いところは屋根（段）の高さに張る。
  // 屋根の面は凸なら半平面で切り（ほとんどがそう）、凸でなければ polygon-clipping で
  const boxOf = (r) => [Math.min(...r.map((p) => p[0])), Math.min(...r.map((p) => p[1])), Math.max(...r.map((p) => p[0])), Math.max(...r.map((p) => p[1]))];
  const pieceBox = carves.length ? pieces.map(({ poly }) => boxOf(poly)) : [];
  const convex = (r) => {
    let sg = 0;
    for (let i = 0; i < r.length; i++) {
      const [a, b, d] = [r[i], r[(i + 1) % r.length], r[(i + 2) % r.length]];
      const cr = (b[0] - a[0]) * (d[1] - b[1]) - (b[1] - a[1]) * (d[0] - b[0]);
      if (Math.abs(cr) < 1e-9) continue;
      if (sg && Math.sign(cr) !== sg) return false;
      sg = Math.sign(cr);
    }
    return true;
  };
  const floorUnder = (outer, fl) => {
    const fb = boxOf(outer);
    const out = [];
    pieces.forEach(({ poly, fn }, i) => {
      const pb = pieceBox[i];
      if (pb[0] > fb[2] || pb[2] < fb[0] || pb[1] > fb[3] || pb[3] < fb[1]) return;
      let parts = [];
      if (convex(poly)) {
        const ccwP = ringArea(poly) > 0;
        let r = outer;
        for (let j = 0; j < poly.length && r.length >= 3; j++) {
          const a = poly[j];
          const b = poly[(j + 1) % poly.length];
          r = clipHalf(r, (p) => ((b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0])) * (ccwP ? 1 : -1));
        }
        if (r.length >= 3) parts = [r];
      } else {
        try {
          parts = clip.intersection([closeRing(outer)], [closeRing(poly)]).map((pg) => pg[0].slice(0, -1));
        } catch {
          parts = [];
        }
      }
      for (const r of parts) {
        const below = clipHalf(r, (p) => planeVal(fn, p) - planeVal(fl, p)); // 床のほうが低い
        const above = clipHalf(r, (p) => planeVal(fl, p) - planeVal(fn, p)); // 屋根のほうが低い
        if (below.length >= 3 && Math.abs(ringArea(below)) > 1e-4) out.push({ poly: below, fn: fl, col: look && f.roof ? look.deck : c }); // 屋上が緑・木の床なら、くり抜きの床も木
        if (above.length >= 3 && Math.abs(ringArea(above)) > 1e-4) out.push({ poly: above, fn, col: roofCol(fn[2], above.reduce((a, p) => [a[0] + p[0] / above.length, a[1] + p[1] / above.length], [0, 0])) });
      }
    });
    return out;
  };
  // くり抜きの床と天井（斜めなら、くり抜きの三角形ごとに）
  const nUp = (fn) => { const l = Math.hypot(fn[0], fn[1], 1); return [-fn[0] / l, -fn[1] / l, 1 / l]; };
  for (const cv of carves) {
    const parts = !cv.sloped ? cv.inside.map((pg) => ({ pg, fl: [0, 0, cv.floorAt()], ce: cv.ceilAt ? [0, 0, cv.ceilAt()] : null })) : cv.tris.flatMap((t) => {
      let r = [];
      try {
        r = clip.intersection(cv.inside, [closeRing(t.ring)]);
      } catch {
        r = [];
      }
      return r.map((pg) => ({ pg, fl: t.fl, ce: t.ce }));
    });
    for (const { pg, fl, ce } of parts) {
      if (pg[0].some((p) => planeVal(fl, p) > ROOF_MIN)) {
        const r0 = pg[0];
        const outer = r0.length > 1 && r0[0][0] === r0[r0.length - 1][0] && r0[0][1] === r0[r0.length - 1][1] ? r0.slice(0, -1) : r0;
        // 屋根の板のある建物は、屋根＝板（斜めの屋根は板の下の暗い面）なので、床をそのまま張る（暗い面の高さに下げない）
        const floors = boardList.length ? [{ poly: outer, fn: fl, col: look && f.roof ? look.deck : c }] : floorUnder(outer, fl);
        for (const { poly, fn, col } of floors) m.polygon([poly], (p) => g0 + Math.max(0, planeVal(fn, p)), nUp(fn), col);
      }
      if (!cv.open && ce) {
        const up = nUp(ce);
        m.polygon(pg, (p) => g0 + Math.max(planeVal(fl, p), Math.min(planeVal(ce, p), hAt(p))), [-up[0], -up[1], -up[2]], cIn);
      }
    }
  }
  // 外の壁の1区間（p〜q、屋根の高さ hp・hq）。ガラス張りなら、地面から glass m（屋根が低ければ屋根まで）をガラスにして、
  // 縦の桟とガラスの上の端の横の桟（と床の高さの横の桟 glassRows）を、壁の面から少し外に。縦の桟は辺ごとに等間隔：辺の始まりから
  // glassPitch m（辺の長さを割り切れる長さに直す）ごとで、区間の中のものだけ（edge：辺の長さ len と、区間の始まりの位置 s0）。
  // glassFrame "light" は細い明るい枠（アルミ）
  const glassTop = look && f.glass > 0 ? f.glass : 0;
  const pitch = f.glassPitch || 1.5;
  const lightFrame = f.glassFrame === "light";
  const mw = lightFrame ? 0.05 : 0.1; // 縦の桟の幅
  const mCol = look ? (lightFrame ? mix(look.frame, look.mullion, 0.35) : look.mullion) : null; // 明るい枠も、空を映すガラスの上の方で見分けがつくよう少し暗く
  // from（[p の下の端, q の下の端]。地面から m）：くり抜きの天井より上だけの壁（なければ壁の下の端から）
  const wallSeg = (p, q, hp, hq, n, glassy = true, edge = null, from = null) => {
    const bp = from ? g0 + from[0] : bAt(p);
    const bq = from ? g0 + from[1] : bAt(q);
    if (!glassTop || !glassy) {
      if (f.material === "green") greenWall(m, p, q, bp, bq, g0 + hp, g0 + hq, n, c);
      else m.quad([[p, bp], [q, bq], [q, g0 + hq], [p, g0 + hp]], n, c);
      return;
    }
    const gp = Math.min(glassTop, hp);
    const gq = Math.min(glassTop, hq);
    const [lo, hi] = look.glass;
    const L = Math.hypot(q[0] - p[0], q[1] - p[1]);
    if (L < 1e-3) return;
    const ux = (q[0] - p[0]) / L;
    const uy = (q[1] - p[1]) / L;
    const len = edge ? edge.len : L;
    const s0 = edge ? edge.s0 : 0;
    // 区間のつなぎ目（辺の途中）は 2cm 重ねる：となりの区間とガラスの上の高さがちがうと、つなぎ目に1画素のすき間が出る（色は高さだけで
    // 決まるので、重なっても見分けがつかない）
    const xa = s0 > 1e-6 ? 0.02 : 0;
    const xb = s0 + L < len - 1e-6 ? 0.02 : 0;
    const pg = [p[0] - ux * xa, p[1] - uy * xa];
    const qg = [q[0] + ux * xb, q[1] + uy * xb];
    const [lp, lq] = from ? [mix(lo, hi, Math.max(0, from[0]) / glassTop), mix(lo, hi, Math.max(0, from[1]) / glassTop)] : [lo, lo]; // 色は高さで決まる（となりの壁と続く）
    m.quadColors([[pg, bp], [qg, bq], [qg, g0 + gq], [pg, g0 + gp]], n, [lp, lq, mix(lo, hi, gq / glassTop), mix(lo, hi, gp / glassTop)]);
    if (hp > gp + 1e-3 || hq > gq + 1e-3) m.quad([[p, g0 + gp], [q, g0 + gq], [q, g0 + hq], [p, g0 + hp]], n, c);
    const ox = n[0] * 0.03;
    const oy = n[1] * 0.03;
    const K = Math.max(1, Math.round(len / pitch));
    for (let j = 0; j <= K; j++) {
      const sv = (len * j) / K - s0;
      // 区間の終わりの桟は次の区間で（辺の終わりだけはここで）
      if (sv < -1e-6 || sv > L + 1e-6 || (sv > L - 1e-6 && s0 + L < len - 1e-6)) continue;
      const t = Math.min(1, Math.max(0, sv / L));
      const cx = p[0] + (q[0] - p[0]) * t + ox;
      const cy = p[1] + (q[1] - p[1]) * t + oy;
      const a = [cx - (ux * mw) / 2, cy - (uy * mw) / 2];
      const b = [cx + (ux * mw) / 2, cy + (uy * mw) / 2];
      const gt = g0 + gp + (gq - gp) * t;
      const gb = bp + (bq - bp) * t;
      m.quad([[a, gb], [b, gb], [b, gt], [a, gt]], n, mCol);
    }
    const pa = [p[0] + ox, p[1] + oy];
    const qa = [q[0] + ox, q[1] + oy];
    // 床の高さの横の桟（地下の階のガラスの、床の見えるところ）
    for (const r of f.glassRows || []) {
      if (r > Math.min(gp, gq) - 0.1 || (from && r < Math.max(from[0], from[1]) + 0.1)) continue;
      m.quad([[pa, g0 + r - 0.08], [qa, g0 + r - 0.08], [qa, g0 + r + 0.08], [pa, g0 + r + 0.08]], n, mCol);
    }
    const hd = lightFrame ? 0.08 : 0.12;
    m.quad([[pa, g0 + gp - hd], [qa, g0 + gq - hd], [qa, g0 + gq], [pa, g0 + gp]], n, mCol);
  };
  // パネルの目地（joints：[横の間隔, 縦の間隔, 横の目地の基準の高さ]）：壁の面から JOINT_OFF 外の暗い細い帯。縦は辺ごとに等間隔
  // （辺の長さを割り切れる間隔に直す。角は除く。短い辺＝丸みの細かい辺には描かない）、横は基準の高さから縦の間隔ごと。窓は面から
  // WIN_OFF 外なので、窓のところは窓の奥に隠れる
  const jt = look && f.joints ? f.joints : null;
  const jointCol = jt ? [c[0] * 0.8, c[1] * 0.81, c[2] * 0.83, c[3]] : null;
  const jointSeg = (p, q, hp, hq, n, edge) => {
    const L = Math.hypot(q[0] - p[0], q[1] - p[1]);
    if (L < 1e-3) return;
    const ux = (q[0] - p[0]) / L;
    const uy = (q[1] - p[1]) / L;
    const o = [n[0] * JOINT_OFF, n[1] * JOINT_OFF];
    const at = (t) => [p[0] + (q[0] - p[0]) * t + o[0], p[1] + (q[1] - p[1]) * t + o[1]];
    if (edge.len >= jt[0]) {
      const K = Math.max(1, Math.round(edge.len / jt[0]));
      for (let j = 1; j < K; j++) {
        const sv = (edge.len * j) / K - edge.s0;
        if (sv < 0 || sv > L) continue;
        const t = sv / L;
        const cpt = at(t);
        const a = [cpt[0] - (ux * JOINT_W) / 2, cpt[1] - (uy * JOINT_W) / 2];
        const b = [cpt[0] + (ux * JOINT_W) / 2, cpt[1] + (uy * JOINT_W) / 2];
        const top = g0 + hp + (hq - hp) * t;
        m.quad([[a, bot], [b, bot], [b, top], [a, top]], n, jointCol);
      }
    }
    const zb = jt[2] || 0;
    for (let z = zb + Math.ceil((0.1 - zb) / jt[1]) * jt[1]; z < Math.max(hp, hq) - 0.1; z += jt[1]) {
      // 壁の上の端（hp → hq）が目地より上のところだけ
      let t0 = 0;
      let t1 = 1;
      if (hp < z + 0.05) t0 = (z + 0.05 - hp) / (hq - hp);
      if (hq < z + 0.05) t1 = (z + 0.05 - hp) / (hq - hp);
      if (t1 - t0 < 1e-3) continue;
      const A = at(t0);
      const B = at(t1);
      m.quad([[A, g0 + z - JOINT_W / 2], [B, g0 + z - JOINT_W / 2], [B, g0 + z + JOINT_W / 2], [A, g0 + z + JOINT_W / 2]], n, jointCol);
    }
  };
  // 外の壁：ふちの辺を、屋根の分かれ目（分けた多角形の点が辺の上にあるところ。段々の屋根なら段の境目も）とくり抜きのふちで区切って。
  // 段々の屋根は区間ごとに上が平ら（区間のまん中の段の高さ）
  const ccw = ringArea(ring) > 0;
  const onEdge = [...pieces.flatMap(({ poly }) => poly), ...(soff ? soff.pieces.flatMap(({ poly }) => poly) : [])]; // 下の面（船底）の折れ目でも区切る
  const edgeBreaks = (a, b) => {
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const l2 = dx * dx + dy * dy;
    const ks = [0, 1];
    for (const q of onEdge) {
      const k = ((q[0] - a[0]) * dx + (q[1] - a[1]) * dy) / l2;
      if (k > 1e-6 && k < 1 - 1e-6 && Math.abs((q[0] - a[0]) * dy - (q[1] - a[1]) * dx) / Math.sqrt(l2) < 1e-4) ks.push(k);
    }
    for (const cv of carves) {
      cv.ring.forEach((cp, j) => {
        const t = crossT(a, b, cp, cv.ring[(j + 1) % cv.ring.length]);
        if (t != null) ks.push(t);
      });
    }
    // 屋根の板のふちと交わるところ（板ごとに壁の上の高さが変わる）
    for (const bd of boardList) {
      bd.ring.forEach((cp, j) => {
        const t = crossT(a, b, cp, bd.ring[(j + 1) % bd.ring.length]);
        if (t != null) ks.push(t);
      });
    }
    return ks.sort((x, y) => x - y);
  };
  const flatTops = stepped || boardList.length > 0; // 区間ごとに上が平ら（区間のまん中の高さ）
  ring.forEach((a, i) => {
    const b = ring[(i + 1) % ring.length];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const l2 = dx * dx + dy * dy;
    if (l2 < 1e-9) return;
    const ks = edgeBreaks(a, b);
    const l = Math.sqrt(l2);
    const n = ccw ? [dy / l, -dx / l, 0] : [-dy / l, dx / l, 0]; // 外向き
    for (let k = 0; k + 1 < ks.length; k++) {
      if (ks[k + 1] - ks[k] < 1e-6) continue;
      const p = [a[0] + dx * ks[k], a[1] + dy * ks[k]];
      const q = [a[0] + dx * ks[k + 1], a[1] + dy * ks[k + 1]];
      const mid = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
      // 区間のまん中でいちばん上の板が傾いていれば、壁の上はその板の面に沿って斜めに（平らにすると、長い区間で板より上に出る）
      const tb = boardList.length ? roof.boards.at(mid) : null;
      const tilt = tb && (tb.fn[0] !== 0 || tb.fn[1] !== 0) ? tb : null;
      let hp = tilt ? Math.max(0, tilt.zAt(p)) : flatTops ? hAt(mid) : hAt(p);
      // 建物の角の近く（1m 以内）で、区間のまん中の上に板がない（板の角が壁の線から少しずれた細いすき間）なら、少し内側の板の高さ
      // （壁がそこだけ板の下の面まで下がって、角にすき間があく）
      if (boardList.length && !tb && Math.min(Math.hypot(mid[0] - a[0], mid[1] - a[1]), Math.hypot(mid[0] - b[0], mid[1] - b[1])) < 1) {
        for (const d of [0.3, 0.6]) {
          const inner = [mid[0] - n[0] * d, mid[1] - n[1] * d];
          const ib = roof.boards.at(inner);
          if (ib) { hp = Math.max(hp, ib.zAt(inner)); break; }
        }
      }
      const hq = tilt ? Math.max(0, tilt.zAt(q)) : flatTops ? hp : hAt(q);
      if (hp <= ROOF_MIN && hq <= ROOF_MIN) continue;
      const cv = carveAt(mid);
      if (!cv) {
        wallSeg(p, q, hp, hq, n, !f.glassSides || f.glassSides[i] !== false, { len: l, s0: ks[k] * l });
        if (jt && !(glassTop && (!f.glassSides || f.glassSides[i] !== false))) jointSeg(p, q, hp, hq, n, { len: l, s0: ks[k] * l });
        continue;
      }
      // くり抜きのところ：床より下と、天井より上だけ（床・天井が斜めでも続くよう 0.5m ごとに）
      const P = stepsAlong(p, q);
      const H = tilt ? P.map((x) => Math.max(0, tilt.zAt(x))) : flatTops ? P.map(() => hp) : P.map(hAt);
      const FL = P.map((x) => Math.max(0, cv.floorAt(x)));
      const CE = cv.open ? null : P.map((x) => cv.ceilAt(x));
      // 床のふち：屋根のほうが低ければ屋根の上。ただし屋根の板のある建物は床のまま（板のあいだの暗い面は床より低くてよい）
      const FB = FL.map((v, s) => (boardList.length ? v : Math.min(v, H[s])));
      // 床より下：ガラス張りの辺で、床の高さが辺に沿ってまっすぐ（平らか一様な傾き）なら、ほかの壁と同じガラス（窓の桟つき）を1枚で
      // （テラスの下の1階の窓が、となりの壁の窓と続く）
      const L = Math.hypot(q[0] - p[0], q[1] - p[1]);
      const lin = FB.every((v, s) => Math.abs(v - (FB[0] + ((FB[FB.length - 1] - FB[0]) * Math.hypot(P[s][0] - p[0], P[s][1] - p[1])) / L)) < 0.01);
      const glassBelow = glassTop > 0 && lin && (!f.glassSides || f.glassSides[i] !== false) && Math.max(FB[0], FB[FB.length - 1]) > ROOF_MIN;
      if (glassBelow) wallSeg(p, q, FB[0], FB[FB.length - 1], n, true, { len: l, s0: ks[k] * l });
      // 天井より上：同じく、ガラス張りの辺で天井が辺に沿ってまっすぐなら、ほかの壁と同じガラスを1枚で（吹きさらしの入口の上の格子とガラス）
      const CB = CE ? CE.map((v, s) => Math.max(FL[s], Math.min(v, H[s]))) : null;
      const linC = CB && CB.every((v, s) => Math.abs(v - (CB[0] + ((CB[CB.length - 1] - CB[0]) * Math.hypot(P[s][0] - p[0], P[s][1] - p[1])) / L)) < 0.01);
      const glassAbove = linC && glassTop > 0 && (!f.glassSides || f.glassSides[i] !== false) && Math.min(hp, hq) > Math.max(CB[0], CB[CB.length - 1]) + 0.05;
      if (glassAbove) wallSeg(p, q, hp, hq, n, true, { len: l, s0: ks[k] * l }, [CB[0], CB[CB.length - 1]]);
      for (let s = 0; s + 1 < P.length; s++) {
        if (!glassBelow && (FL[s] > ROOF_MIN || FL[s + 1] > ROOF_MIN)) m.quad([[P[s], bot], [P[s + 1], bot], [P[s + 1], g0 + FB[s + 1]], [P[s], g0 + FB[s]]], n, c);
        if (CE && !glassAbove) m.quad([[P[s], g0 + CB[s]], [P[s + 1], g0 + CB[s + 1]], [P[s + 1], g0 + H[s + 1]], [P[s], g0 + H[s]]], n, c);
      }
      // 床のふちの手すり壁（外の壁の面から内へ。床に沿って。屋根のほうが低いところは屋根の上）
      if (cv.rail && FB.some((v) => v > ROOF_MIN)) {
        const inn = [-n[0] * RAIL_T, -n[1] * RAIL_T];
        const top = FB.map((v, s) => g0 + v + Math.min(RAIL_H, CE ? Math.max(0, CE[s] - v) : RAIL_H));
        m.prism(P, P.map((x) => [x[0] + inn[0], x[1] + inn[1]]), FB.map((v) => g0 + v), top, { top: c, side: c });
      }
    }
  });
  // 段々の屋根の軒：段の板を、段の向き（斜面の同じ高さの線の向き）に壁の外へ eave m 張り出す。先は段の向きに直角に切るので、
  // 段に斜めに交わる壁では段ごとに出がずれる（のこぎりの歯）。段が壁とほぼ平行なところ・平らなところは、ふつうの軒（壁に直角、
  // 頭がぶつからない 2.5m 以上だけ）。板は薄く（段の高さの 6 割、0.25m まで）、上と小口は段の色、下は軒の色
  if (boardList.length) {
    // 屋根の板があれば、張り出しは板そのもの（軒は出さない）
  } else if (look && f.eave > 0 && stepped) {
    const e = f.eave;
    const T = Math.min(0.25, roof.step * 0.6);
    const hs = roof.hSmooth;
    const along = (p) => {
      const d = 0.05;
      const gx = (hs([p[0] + d, p[1]]) - hs([p[0] - d, p[1]])) / (2 * d);
      const gy = (hs([p[0], p[1] + d]) - hs([p[0], p[1] - d])) / (2 * d);
      const g = Math.hypot(gx, gy);
      return g < 1e-3 ? null : [-gy / g, gx / g];
    };
    ring.forEach((a, i) => {
      if (f.eaveSides && f.eaveSides[i] === false) return;
      const b = ring[(i + 1) % ring.length];
      const dx = b[0] - a[0];
      const dy = b[1] - a[1];
      const l = Math.hypot(dx, dy);
      if (l < 1e-6) return;
      const no = ccw ? [dy / l, -dx / l] : [-dy / l, dx / l];
      const ks = edgeBreaks(a, b);
      // 同じ段の区間をつなぐ（上まで抜けたくり抜きのところは出さない）
      const runs = [];
      for (let k = 0; k + 1 < ks.length; k++) {
        if (ks[k + 1] - ks[k] < 1e-6) continue;
        const p = [a[0] + dx * ks[k], a[1] + dy * ks[k]];
        const q = [a[0] + dx * ks[k + 1], a[1] + dy * ks[k + 1]];
        const mid = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
        const z = hAt(mid);
        const skip = z < 0.3 || !!carveAt(mid)?.open;
        const last = runs[runs.length - 1];
        if (last && !last.skip && !skip && Math.abs(last.z - z) < 1e-6) last.q = q;
        else runs.push({ p, q, z, skip });
      }
      for (const { p, q, z, skip } of runs) {
        if (skip) continue;
        const mid = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
        let u = along([mid[0] - no[0] * 0.1, mid[1] - no[1] * 0.1]);
        if (u && Math.abs(u[0] * no[0] + u[1] * no[1]) < 0.4) u = null;
        if (!u && z < 2.5) continue;
        if (u && u[0] * no[0] + u[1] * no[1] < 0) u = [-u[0], -u[1]];
        const d = u || no;
        const sp = p[0] * d[0] + p[1] * d[1];
        const sq = q[0] * d[0] + q[1] * d[1];
        const se = (u ? Math.max(sp, sq) : 0) + e;
        const P2 = u ? [p[0] + d[0] * (se - sp), p[1] + d[1] * (se - sp)] : [p[0] + d[0] * e, p[1] + d[1] * e];
        const Q2 = u ? [q[0] + d[0] * (se - sq), q[1] + d[1] * (se - sq)] : [q[0] + d[0] * e, q[1] + d[1] * e];
        const zt = g0 + z;
        const zb = zt - T;
        const top = roofCol(z, [mid[0] - no[0] * 0.3, mid[1] - no[1] * 0.3]);
        m.quad([[p, zt], [q, zt], [Q2, zt], [P2, zt]], [0, 0, 1], top);
        m.quad([[p, zb], [q, zb], [Q2, zb], [P2, zb]], [0, 0, -1], look.eave);
        m.quad([[P2, zb], [Q2, zb], [Q2, zt], [P2, zt]], [d[0], d[1], 0], top);
        // 両わきの小口（となりの段と高さがちがうので見える）
        for (const [s, t, o] of [[p, P2, q], [q, Q2, p]]) {
          const sx = t[0] - s[0];
          const sy = t[1] - s[1];
          const sl = Math.hypot(sx, sy);
          if (sl < 1e-6) continue;
          const sn = (o[0] - s[0]) * -sy + (o[1] - s[1]) * sx > 0 ? [sy / sl, -sx / sl] : [-sy / sl, sx / sl];
          m.quad([[s, zb], [t, zb], [t, zt], [s, zt]], [sn[0], sn[1], 0], top);
        }
      }
    });
  } else if (look && f.eave > 0) {
    // 軒：屋根のふちから外へ eave m、厚さ 0.3m の板（屋根の高さが 1m より低い辺には出さない）。角は留め継ぎ
    const O = offsetLine([ring[ring.length - 1], ...ring, ring[0], ring[1]], ccw ? -f.eave : f.eave).slice(1, -1);
    const T = Math.min(0.6, 0.15 + f.eave * 0.18); // 大きく張り出す軒ほど厚く
    ring.forEach((a, i) => {
      if (f.eaveSides && f.eaveSides[i] === false) return;
      const j = (i + 1) % ring.length;
      const b = ring[j];
      const ha = Math.max(0, hAt(a));
      const hb = Math.max(0, hAt(b));
      if (Math.max(ha, hb) < 1) return;
      const oa = O[i];
      const ob = O[i + 1];
      const za = g0 + ha;
      const zb = g0 + hb;
      const dx = b[0] - a[0];
      const dy = b[1] - a[1];
      const l = Math.hypot(dx, dy) || 1;
      const no = ccw ? [dy / l, -dx / l, 0] : [-dy / l, dx / l, 0];
      m.quad([[a, za], [b, zb], [ob, zb], [oa, za]], null, look.eave);
      m.quad([[a, za - T], [b, zb - T], [ob, zb - T], [oa, za - T]], [0, 0, -1], look.eave);
      m.quad([[oa, za - T], [ob, zb - T], [ob, zb], [oa, za]], no, look.eave);
    });
  }
  // 屋上の緑：草の塊を散らす（くり抜きのところ・屋根の低いところは除く。段々の屋根なら植え込みの段だけに、小さめに）。
  // 屋根の板があれば、植え込みの板の上に
  if (look && boardList.length) {
    const rnd = seeded(hashStr(`${f.id}:boards`));
    for (const b of boardList) {
      if (b.kind !== "green") continue;
      const [x0, y0, x1, y1] = b.box;
      const want = Math.min(10, Math.max(1, Math.round(Math.abs(ringArea(b.ring)) / 1.2)));
      let placed = 0;
      for (let k = 0; k < want * 6 && placed < want; k++) {
        const p = [x0 + rnd() * (x1 - x0), y0 + rnd() * (y1 - y0)];
        if (!pointInRing(p[0], p[1], b.ring)) continue;
        const r = 0.25 + rnd() * 0.3;
        const s = 0.8 + rnd() * 0.35;
        const col = [look.green[0] * s, look.green[1] * (s + 0.05), look.green[2] * s * 0.9, look.green[3]];
        addBlob(m, [p[0], p[1], g0 + b.zAt(p)], [r, r, r * (0.5 + rnd() * 0.5)], col, rnd, { sphere: ICO0, lump: 0.25 });
        placed++;
      }
    }
  } else if (look && f.roof === "green") {
    const rnd = seeded(hashStr(`${f.id}:roof`));
    const xs = ring.map((p) => p[0]);
    const ys = ring.map((p) => p[1]);
    const x0 = Math.min(...xs);
    const y0 = Math.min(...ys);
    const W = Math.max(...xs) - x0;
    const H = Math.max(...ys) - y0;
    const want = stepped ? Math.min(260, Math.max(6, Math.round(Math.abs(ringArea(ring)) / 6))) : Math.min(180, Math.max(6, Math.round(Math.abs(ringArea(ring)) / 9)));
    let placed = 0;
    for (let k = 0; k < want * 6 && placed < want; k++) {
      const p = [x0 + rnd() * W, y0 + rnd() * H];
      if (!pointInRing(p[0], p[1], ring) || carveAt(p)) continue;
      const h = hAt(p);
      if (h < 0.3 || (stepped && !greenAt(p, h))) continue;
      const r = stepped ? 0.3 + rnd() * 0.35 : 0.45 + rnd() * 0.6;
      const s = 0.8 + rnd() * 0.35;
      const col = [look.green[0] * s, look.green[1] * (s + 0.05), look.green[2] * s * 0.9, look.green[3]];
      addBlob(m, [p[0], p[1], g0 + h], [r, r, r * (0.5 + rnd() * 0.5)], col, rnd, { sphere: ICO0, lump: 0.25 });
      placed++;
    }
  }
  // くり抜きの奥の壁：くり抜きのふちのうち建物の中のところ。床から天井（上まで抜けていれば屋根）まで、くり抜きの側を向く
  for (const cv of carves) {
    const cccw = ringArea(cv.ring) > 0;
    cv.ring.forEach((a, j) => {
      const b = cv.ring[(j + 1) % cv.ring.length];
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (len < 1e-6) return;
      const ks = [0, 1];
      ring.forEach((rp, i) => {
        const t = crossT(a, b, rp, ring[(i + 1) % ring.length]);
        if (t != null) ks.push(t);
      });
      ks.sort((x, y) => x - y);
      const ux = (b[0] - a[0]) / len;
      const uy = (b[1] - a[1]) / len;
      const nin = cccw ? [-uy, ux, 0] : [uy, -ux, 0]; // くり抜きの中へ
      const zb = (p) => g0 + Math.max(0, cv.floorAt(p));
      // 上の端：屋根の高さ hr（段々の屋根なら区間のまん中の段）と、天井の低いほう
      const zt = (p, hr = hAt(p)) => g0 + Math.max(cv.floorAt(p), cv.open ? hr : Math.min(cv.ceilAt(p), hr));
      // 段々の屋根は段の境目（蹴上げと交わるところ）でも区切る
      const rcross = stepped ? risers.map((r) => crossT(a, b, r.a, r.b)).filter((t) => t != null).map((t) => t * len) : [];
      for (let k = 0; k + 1 < ks.length; k++) {
        const s0 = ks[k] * len;
        const s1 = ks[k + 1] * len;
        if (s1 - s0 < 1e-6) continue;
        const mid = [a[0] + (ux * (s0 + s1)) / 2, a[1] + (uy * (s0 + s1)) / 2];
        if (!pointInRing(mid[0], mid[1], ring) || carves.some((o) => o !== cv && pointInRing(mid[0], mid[1], o.ring))) continue;
        // 斜めの屋根・床・天井に合わせて 0.5m ごとに
        const steps = Math.max(1, Math.ceil((s1 - s0) / 0.5));
        const S = [...Array.from({ length: steps + 1 }, (_, q) => s0 + ((s1 - s0) * q) / steps), ...rcross.filter((s) => s > s0 + 1e-6 && s < s1 - 1e-6)].sort((x, y) => x - y);
        for (let q = 0; q + 1 < S.length; q++) {
          const sa = S[q];
          const sb = S[q + 1];
          if (sb - sa < 1e-6) continue;
          const pa = [a[0] + ux * sa, a[1] + uy * sa];
          const pb = [a[0] + ux * sb, a[1] + uy * sb];
          const hr = stepped ? hAt([(pa[0] + pb[0]) / 2, (pa[1] + pb[1]) / 2]) : undefined;
          const ba = zb(pa);
          const bb = zb(pb);
          const ta = zt(pa, hr);
          const tb = zt(pb, hr);
          if (ta - ba < ROOF_MIN && tb - bb < ROOF_MIN) continue;
          m.quad([[pa, ba], [pb, bb], [pb, tb], [pa, ta]], nin, cIn);
        }
      }
    });
  }
  // 壁の文字（ステンレスの切り文字）
  if (look && f.letters) {
    const hosts = wallHosts(ring, carves);
    for (const l of f.letters) {
      // 行は与えた 2 点を結ぶ線（1 点目が左端）。少し折れた壁にまたがってもよいよう、壁（いちばん近い辺）からは外向きだけを使う
      const q = l.coords.map(toXY);
      const h = hostOf(hosts, q, false);
      if (!h) continue;
      const L = Math.hypot(q[1][0] - q[0][0], q[1][1] - q[0][1]);
      const u = [(q[1][0] - q[0][0]) / L, (q[1][1] - q[0][1]) / L];
      const n = u[1] * h.n[0] - u[0] * h.n[1] >= 0 ? [u[1], -u[0]] : [-u[1], u[0]];
      addLetters(m, l, { a: q[0], b: q[1], u, n, L }, g0, l.color === "red" ? look.redPanel : look.letter);
    }
  }
  // 格子のスクリーン：外向きは、線の向きに直角で壁（いちばん近い辺）の外向きに近いほう
  if (look && f.trellis) {
    const hosts = wallHosts(ring, carves);
    for (const tr of f.trellis) {
      const q = tr.coords.map(toXY);
      const h = hostOf(hosts, q, false);
      if (!h) continue;
      const L = Math.hypot(q[1][0] - q[0][0], q[1][1] - q[0][1]);
      const u = [(q[1][0] - q[0][0]) / L, (q[1][1] - q[0][1]) / L];
      addTrellis(m, tr, q, u[1] * h.n[0] - u[0] * h.n[1] >= 0 ? [u[1], -u[0]] : [-u[1], u[0]], g0, look);
    }
  }
  // 窓・扉と小さなひさし（壁の面に貼る）
  if (look && (f.windows || f.canopies)) {
    const hosts = wallHosts(ring, carves);
    for (const w of f.windows || []) {
      const q = w.coords.map(toXY);
      const h = hostOf(hosts, q);
      if (!h) continue;
      if (w.top2 == null) {
        addWindow(m, w, h, g0, look);
        continue;
      }
      // 斜めの上の端：1 点目で top・2 点目で top2。壁の向き（a → b）が点の順と逆なら入れかえる
      const fwd = (q[1][0] - q[0][0]) * h.u[0] + (q[1][1] - q[0][1]) * h.u[1] >= 0;
      addSlantWindow(m, fwd ? w : { ...w, top: w.top2, top2: w.top }, h, g0, look);
    }
    for (const cn of f.canopies || []) {
      const h = hostOf(hosts, cn.coords.map(toXY));
      if (!h) continue;
      const line = [h.a, h.b].map((p) => [p[0] + h.n[0] * 0.01, p[1] + h.n[1] * 0.01]);
      const z1 = g0 + cn.z;
      m.prism(line, line.map((p) => [p[0] + h.n[0] * cn.depth, p[1] + h.n[1] * cn.depth]), [z1 - cn.thickness, z1 - cn.thickness], [z1, z1], { top: look.canopyTop, side: look.canopy, bottom: look.canopy }, { bottom: true });
    }
  }
  // 筒（屋根の高さに横たわる丸い胴）。上の面は屋根と同じ色
  if (look) for (const v of f.vaults || []) addVault(m, v, g0, { ...look, vaultTop: c, vaultEnd: c });
  // 宙に浮いた建物の下の面（船底の形なら面ごと。下向き）。光が当たらないので暗く。パネルの目地（soffitJoints）は面のすぐ下の細い帯
  if (soff) {
    const sc = [c[0] * 0.68, c[1] * 0.69, c[2] * 0.71, c[3]];
    const jc = [sc[0] * 0.6, sc[1] * 0.6, sc[2] * 0.6, sc[3]];
    for (const { poly, fn, i } of soff.pieces) {
      const l = Math.hypot(fn[0], fn[1], 1);
      const nd = [fn[0] / l, fn[1] / l, -1 / l];
      m.polygon([poly], (p) => g0 + fn[0] * p[0] + fn[1] * p[1] + fn[2], nd, sc);
      if (!look || !f.soffitJoints) continue;
      const a = ring[i ?? 0];
      const b = ring[((i ?? 0) + 1) % ring.length];
      const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (L < 1e-6) continue;
      const u = [(b[0] - a[0]) / L, (b[1] - a[1]) / L];
      const nin = ccw ? [-u[1], u[0]] : [u[1], -u[0]]; // 辺から中へ
      const [along, across] = f.soffitJoints;
      const zAt = (p) => g0 + fn[0] * p[0] + fn[1] * p[1] + fn[2] - 0.012;
      const band = (p0, d) => {
        const r = clipLineConvex(poly, p0, d);
        if (!r) return;
        const [A, B] = r.map((t) => [p0[0] + d[0] * t, p0[1] + d[1] * t]);
        const w = [-d[1] * 0.025, d[0] * 0.025];
        m.quad([A, B, B, A].map((q, k) => { const s = k < 2 ? 1 : -1; const xy = [q[0] + w[0] * s, q[1] + w[1] * s]; return [xy, zAt(xy)]; }), nd, jc);
      };
      // 辺に平行（中へ across m ごと）と、辺に直角（辺に沿って along m ごと）
      for (let k = 1; k * across < 60; k++) band([a[0] + nin[0] * k * across, a[1] + nin[1] * k * across], u);
      for (let k = 1; k * along < L; k++) band([a[0] + u[0] * k * along, a[1] + u[1] * k * along], nin);
    }
  }
  // 太陽光パネルの屋根：平らな屋根の上、ふちから SOLAR_EDGE 内側にパネル（行ごとの細い目地つき）。ふちは笠木の色（roofCol）
  if (look && f.roof === "solar" && !roof.cuts.length) {
    const inner = offsetRingBy(ccw ? ring : ring.slice().reverse(), ring.map(() => -SOLAR_EDGE));
    if (inner.length >= 3 && ringArea(inner) * ringArea(ccw ? ring : ring.slice().reverse()) > 0) {
      const zt = g0 + roof.H + 0.06;
      m.polygon([inner], zt, [0, 0, 1], look.solar);
      // 目地：いちばん長い辺の向きに SOLAR_ROW m ごと
      let best = 0;
      ring.forEach((a, i) => {
        const b = ring[(i + 1) % ring.length];
        const bb = ring[(best + 1) % ring.length];
        if (Math.hypot(b[0] - a[0], b[1] - a[1]) > Math.hypot(bb[0] - ring[best][0], bb[1] - ring[best][1])) best = i;
      });
      const A = ring[best];
      const B = ring[(best + 1) % ring.length];
      const L = Math.hypot(B[0] - A[0], B[1] - A[1]);
      const u = [(B[0] - A[0]) / L, (B[1] - A[1]) / L];
      const ss = inner.map((p) => (p[0] - A[0]) * u[0] + (p[1] - A[1]) * u[1]);
      for (let sv = Math.ceil(Math.min(...ss) / SOLAR_ROW) * SOLAR_ROW; sv < Math.max(...ss); sv += SOLAR_ROW) {
        const band = clipHalf(clipHalf(inner, (p) => (p[0] - A[0]) * u[0] + (p[1] - A[1]) * u[1] - (sv - 0.04)), (p) => sv + 0.04 - ((p[0] - A[0]) * u[0] + (p[1] - A[1]) * u[1]));
        if (band.length >= 3) m.polygon([band], zt + 0.01, [0, 0, 1], look.solarLine);
      }
    }
  }
  // 縦のルーバー（fins）：壁ぞいの両端のあいだに pitch ごと、壁の下の端（浮いた建物は下の面）から屋根の高さまで。南を向く面は太陽光パネル
  if (look && f.fins) {
    const hosts = wallHosts(ring, []);
    for (const fr of f.fins) {
      const h = hostOf(hosts, fr.coords.map(toXY));
      if (!h) continue;
      const K = Math.max(1, Math.round(h.L / fr.pitch));
      for (let j = 0; j <= K; j++) {
        const sv = (h.L * j) / K;
        const c0 = [h.a[0] + h.u[0] * sv, h.a[1] + h.u[1] * sv];
        const P0 = [c0[0] - h.u[0] * fr.width / 2, c0[1] - h.u[1] * fr.width / 2];
        const P1 = [c0[0] + h.u[0] * fr.width / 2, c0[1] + h.u[1] * fr.width / 2];
        const out0 = [P0[0] + h.n[0] * fr.depth, P0[1] + h.n[1] * fr.depth];
        const out1 = [P1[0] + h.n[0] * fr.depth, P1[1] + h.n[1] * fr.depth];
        const zb = bAt(c0) + 0.02;
        const zt = g0 + hAt(c0);
        // 両わきの面：u の向き（+）と逆（−）。南（y が小さい）を向くほうがパネル
        const south = (sg) => -h.u[1] * sg > 0;
        m.quad([[P0, zb], [out0, zb], [out0, zt], [P0, zt]], [-h.u[0], -h.u[1], 0], south(-1) ? look.solar : look.fin);
        m.quad([[P1, zb], [out1, zb], [out1, zt], [P1, zt]], [h.u[0], h.u[1], 0], south(1) ? look.solar : look.fin);
        m.quad([[out0, zb], [out1, zb], [out1, zt], [out0, zt]], [h.n[0], h.n[1], 0], look.fin);
        m.quad([[P0, zt], [P1, zt], [out1, zt], [out0, zt]], [0, 0, 1], look.fin);
        m.quad([[P0, zb], [P1, zb], [out1, zb], [out0, zb]], [0, 0, -1], look.fin);
      }
    }
  }
  // 白い鋼の柱・梁（members）：点の並びに沿った角材
  if (look) for (const mb of f.members || []) {
    const P = mb.coords.map(toXY);
    for (let k = 0; k + 1 < P.length; k++) addBeam(m, [P[k], g0 + mb.zs[k]], [P[k + 1], g0 + mb.zs[k + 1]], mb.size, look.member);
  }
  if (look) for (const p of f.panels || []) addPanel(m, p, g0, look, c);
  if (look) for (const d of f.domes || []) addDome(m, d, g0 + (d.z ?? hAt(toXY(d.coords))), look);
}

// 空中の平らな板（panels）：両面と小口。色は kind（ガラスは下が暗く上が明るい）
function addPanel(m, p, g0, look, c) {
  const P = p.coords.map(toXY);
  const Z = p.zs.map((z) => g0 + z);
  const k = P.length;
  // 面の法線（Newell）
  let nx = 0, ny = 0, nz = 0;
  for (let i = 0; i < k; i++) {
    const [a, b] = [i, (i + 1) % k];
    nx += (P[a][1] - P[b][1]) * (Z[a] + Z[b]);
    ny += (Z[a] - Z[b]) * (P[a][0] + P[b][0]);
    nz += (P[a][0] - P[b][0]) * (P[a][1] + P[b][1]);
  }
  const nl = Math.hypot(nx, ny, nz);
  if (nl < 1e-9) return;
  const n = [nx / nl, ny / nl, nz / nl];
  const h = p.thickness / 2;
  const zmin = Math.min(...Z);
  const zmax = Math.max(...Z);
  const colAt = (z) => {
    if (p.kind === "glass") return mix(mix(look.glass[0], look.glass[1], 0.25), look.glass[1], zmax > zmin ? (z - zmin) / (zmax - zmin) : 0.5);
    return p.kind === "perforated" ? look.perforated : p.kind === "steel" ? look.steelHi : p.kind === "dark" ? look.canopy : p.kind === "white" ? look.member : p.kind === "red" ? look.redPanel : c;
  };
  // 三角形に分ける：面の上の 2 次元（法線にいちばん直角な軸を落とす）で earcut
  const ax = Math.abs(n[0]) >= Math.abs(n[1]) && Math.abs(n[0]) >= Math.abs(n[2]) ? 0 : Math.abs(n[1]) >= Math.abs(n[2]) ? 1 : 2;
  const pts3 = P.map((q, i) => [q[0], q[1], Z[i]]);
  const flat = pts3.flatMap((q) => (ax === 0 ? [q[1], q[2]] : ax === 1 ? [q[0], q[2]] : [q[0], q[1]]));
  const idx = earcut(flat, [], 2);
  for (const sg of [1, -1]) {
    const off = [n[0] * h * sg, n[1] * h * sg, n[2] * h * sg];
    for (const i of idx) {
      const q = pts3[i];
      m.vert([q[0] + off[0], q[1] + off[1]], q[2] + off[2], [n[0] * sg, n[1] * sg, n[2] * sg], colAt(q[2]));
    }
  }
  // 小口
  for (let i = 0; i < k; i++) {
    const [a, b] = [pts3[i], pts3[(i + 1) % k]];
    const e = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    let s = [e[1] * n[2] - e[2] * n[1], e[2] * n[0] - e[0] * n[2], e[0] * n[1] - e[1] * n[0]];
    const sl = Math.hypot(...s) || 1;
    s = s.map((v) => v / sl);
    const pa = [a[0] + n[0] * h, a[1] + n[1] * h, a[2] + n[2] * h];
    const pb = [b[0] + n[0] * h, b[1] + n[1] * h, b[2] + n[2] * h];
    const qa = [a[0] - n[0] * h, a[1] - n[1] * h, a[2] - n[2] * h];
    const qb = [b[0] - n[0] * h, b[1] - n[1] * h, b[2] - n[2] * h];
    const col = colAt((a[2] + b[2]) / 2);
    [pa, pb, qb, pa, qb, qa].forEach((q) => m.vert([q[0], q[1]], q[2], s, col));
  }
}

// 屋根の丸い天窓（domes）：低い台（0.25m。建物の色）の上に、半径 r・高さ 0.55r の球の一部（乳白色）
function addDome(m, d, zb, look) {
  const c = toXY(d.coords);
  const r = d.r;
  const SEG = 16;
  const curb = 0.25;
  const col = look.dome;
  const ring = Array.from({ length: SEG + 1 }, (_, i) => [Math.cos((2 * Math.PI * i) / SEG), Math.sin((2 * Math.PI * i) / SEG)]);
  for (let i = 0; i < SEG; i++) {
    const [a, b] = [ring[i], ring[i + 1]];
    const nn = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, 0];
    m.quad([[[c[0] + a[0] * r, c[1] + a[1] * r], zb], [[c[0] + b[0] * r, c[1] + b[1] * r], zb], [[c[0] + b[0] * r, c[1] + b[1] * r], zb + curb], [[c[0] + a[0] * r, c[1] + a[1] * r], zb + curb]], nn, look.domeCurb);
  }
  // 球の一部：球の中心は台の上から下へ、高さ hgt の帽子になるところ
  const hgt = 0.55 * r;
  const R = (r * r + hgt * hgt) / (2 * hgt);
  const zc = zb + curb + hgt - R;
  const a0 = Math.asin(Math.min(1, r / R));
  const RINGS = 5;
  for (let j = 0; j < RINGS; j++) {
    const t0 = a0 * (1 - j / RINGS);
    const t1 = a0 * (1 - (j + 1) / RINGS);
    for (let i = 0; i < SEG; i++) {
      const [a, b] = [ring[i], ring[i + 1]];
      const v = (rr, t) => [[c[0] + rr[0] * R * Math.sin(t), c[1] + rr[1] * R * Math.sin(t)], zc + R * Math.cos(t)];
      const nv = (rr, t) => [rr[0] * Math.sin(t), rr[1] * Math.sin(t), Math.cos(t)];
      const p = [v(a, t0), v(b, t0), v(b, t1), v(a, t1)];
      const ns = [nv(a, t0), nv(b, t0), nv(b, t1), nv(a, t1)];
      [0, 1, 2, 0, 2, 3].forEach((q) => m.vert(p[q][0], p[q][1], ns[q], col));
    }
  }
}

// 窓を描ける壁：建物のふちの辺（外向き）と、くり抜きのふちの辺（くり抜きの中向き）
export function wallHosts(ring, carves) {
  const out = [];
  const add = (r, sgn) => {
    const ccw = ringArea(r) > 0;
    r.forEach((a, i) => {
      const b = r[(i + 1) % r.length];
      const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (L < 0.2) return;
      const u = [(b[0] - a[0]) / L, (b[1] - a[1]) / L];
      const nOut = ccw ? [u[1], -u[0]] : [-u[1], u[0]]; // 形の外向き
      out.push({ a, b, u, L, n: [nOut[0] * sgn, nOut[1] * sgn] });
    });
  };
  add(ring, 1);
  carves.forEach((cv) => add(cv.ring, -1));
  return out;
}
// 2点 q（壁ぞいの両端）にいちばん合う壁：両端とも線から WIN_REACH 以内・ほぼ平行（どちらも満たすうち、遠いほうの点の近さで）。
// 点はその壁の線の上へ移して、辺の中に収める（clamp が false なら収めない：文字の行は、ほぼ一直線に続くとなりの辺へはみ出してよい）。
// 返す a・b は壁の上の両端（a→b は辺の向き）
const WIN_REACH = 0.8;
export function hostOf(hosts, q, clamp = true) {
  const d = [q[1][0] - q[0][0], q[1][1] - q[0][1]];
  const dl = Math.hypot(d[0], d[1]);
  if (dl < 1e-3) return null;
  let best = null;
  for (const h of hosts) {
    if (Math.abs((d[0] * h.u[0] + d[1] * h.u[1]) / dl) < 0.96) continue;
    const t = q.map((p) => (p[0] - h.a[0]) * h.u[0] + (p[1] - h.a[1]) * h.u[1]);
    const off = q.map((p) => Math.abs((p[0] - h.a[0]) * h.u[1] - (p[1] - h.a[1]) * h.u[0]));
    const far = Math.max(...off);
    if (far > WIN_REACH || Math.max(...t) < 0.05 || Math.min(...t) > h.L - 0.05) continue;
    if (!best || far < best.far) best = { h, t, far };
  }
  if (!best) return null;
  const { h } = best;
  const [t0, t1] = [Math.min(...best.t), Math.max(...best.t)].map((v) => (clamp ? Math.min(h.L, Math.max(0, v)) : v));
  if (t1 - t0 < 0.05) return null;
  return { a: [h.a[0] + h.u[0] * t0, h.a[1] + h.u[1] * t0], b: [h.a[0] + h.u[0] * t1, h.a[1] + h.u[1] * t1], u: h.u, n: h.n, L: t1 - t0 };
}
// 窓・扉 w を、壁の上の a→b（host）に。面から少し出して、ガラス（下は暗く上は明るい）・奥の暗いガラス・格子・扉の板と、まわりの枠・
// 縦に分ける桟（panes）・横の桟（rows）・扉の上のがらり（louver）
const WIN_OFF = 0.015;
// 壁のパネルの目地（joints）：面からの出（窓より奥）と幅（実物より太く：細いと遠くで点々に見える）
const JOINT_OFF = 0.008;
const JOINT_W = 0.045;
const WIN_FRAME = 0.06; // 枠の幅
const WIN_DEPTH = 0.04; // 枠の出（面から）
function addWindow(m, w, host, g0, look) {
  const { a, u, n, L } = host;
  const N = [n[0], n[1], 0];
  const at = (s, d) => [a[0] + u[0] * s + n[0] * d, a[1] + u[1] * s + n[1] * d];
  const z0 = g0 + w.bottom;
  const z1 = g0 + w.top;
  const rect = (s0, s1, b, t, d, cs) => {
    const A = at(s0, d);
    const B = at(s1, d);
    const c4 = Array.isArray(cs[0]) ? cs : [cs, cs, cs, cs];
    m.quadColors([[A, b], [B, b], [B, t], [A, t]], N, c4);
  };
  // 枠の角材：前の面・上の面・両わき
  const bar = (s0, s1, b, t, col, depth = WIN_DEPTH) => {
    rect(s0, s1, b, t, WIN_OFF + depth, col);
    const tp = [at(s0, WIN_OFF), at(s1, WIN_OFF), at(s1, WIN_OFF + depth), at(s0, WIN_OFF + depth)];
    m.quad([[tp[0], t], [tp[1], t], [tp[2], t], [tp[3], t]], [0, 0, 1], col);
    [[s0, -1], [s1, 1]].forEach(([sv, sg]) => {
      const p0 = at(sv, WIN_OFF);
      const p1 = at(sv, WIN_OFF + depth);
      m.quad([[p0, b], [p1, b], [p1, t], [p0, t]], [u[0] * sg, u[1] * sg, 0], col);
    });
  };
  const fr = WIN_FRAME;
  const kind = w.kind || "glass";
  const frameCol = kind === "door" || w.frame === "light" ? look.frame : look.mullion;
  if (kind === "glass" || kind === "glassdoor") {
    // 空を映すので、地面までのガラスの帯（wallSeg）より少し明るく
    const [lo, hi] = look.glass;
    const lo2 = mix(lo, hi, 0.3);
    rect(0, L, z0, z1, WIN_OFF, [lo2, lo2, hi, hi]);
  } else if (kind === "dark") {
    rect(0, L, z0, z1, WIN_OFF, look.dark);
    // 奥まった窓：上と片側の見込み（影）を枠の内に
    rect(fr, L - fr, z1 - fr - 0.18, z1 - fr, WIN_OFF + 0.004, look.reveal);
    rect(L - fr - 0.16, L - fr, z0 + fr, z1 - fr, WIN_OFF + 0.004, look.reveal);
  } else if (kind === "grille") {
    rect(0, L, z0, z1, WIN_OFF, look.dark);
    // 格子：0.16m の升目
    const k = Math.max(1, Math.round((L - 2 * fr) / 0.16));
    for (let i = 1; i < k; i++) {
      const sv = fr + ((L - 2 * fr) * i) / k;
      bar(sv - 0.012, sv + 0.012, z0 + fr, z1 - fr, look.grille, 0.02);
    }
    const kz = Math.max(1, Math.round((w.top - w.bottom - 2 * fr) / 0.16));
    for (let i = 1; i < kz; i++) {
      const zv = z0 + fr + ((z1 - z0 - 2 * fr) * i) / kz;
      bar(fr, L - fr, zv - 0.012, zv + 0.012, look.grille, 0.02);
    }
  } else {
    rect(0, L, z0, z1, WIN_OFF, look.door);
  }
  // がらり（扉の上）：横の羽根 0.07m おき
  if (w.louver) {
    const zl = z1 - w.louver;
    rect(fr, L - fr, zl, z1 - fr, WIN_OFF + 0.003, look.dark);
    for (let zv = zl + 0.05; zv < z1 - fr - 0.02; zv += 0.07) bar(fr, L - fr, zv - 0.015, zv + 0.015, look.door, 0.025);
    bar(0, L, zl - fr / 2, zl + fr / 2, frameCol);
  }
  // まわりの枠
  bar(0, L, z0, z0 + fr, frameCol);
  bar(0, L, z1 - fr, z1, frameCol);
  bar(0, fr, z0, z1, frameCol);
  bar(L - fr, L, z0, z1, frameCol);
  // 縦の桟・横の桟
  const panes = w.panes || (kind === "glassdoor" ? 2 : 1);
  for (let i = 1; i < panes; i++) {
    const sv = (L * i) / panes;
    bar(sv - fr / 2, sv + fr / 2, z0, kind === "door" && w.louver ? z1 - w.louver : z1, frameCol);
  }
  for (const r of w.rows || []) bar(0, L, g0 + r - fr / 2, g0 + r + fr / 2, frameCol);
  // ガラスの扉の取っ手（横の棒）
  if (kind === "glassdoor") bar(fr, L - fr, z0 + 1.0, z0 + 1.04, frameCol, 0.07);
}

// 上の端が斜めの窓（top2）：ガラス（下は暗く上は明るい）と、まわりの枠・縦の桟（panes）・横の桟（rows。上の端より下のところだけ）
function addSlantWindow(m, w, host, g0, look) {
  const { a, u, n, L } = host;
  const N = [n[0], n[1], 0];
  const at = (s, d) => [a[0] + u[0] * s + n[0] * d, a[1] + u[1] * s + n[1] * d];
  const z0 = g0 + w.bottom;
  const zt = (s) => g0 + w.top + ((w.top2 - w.top) * s) / L;
  const [lo, hi] = look.glass;
  const lo2 = mix(lo, hi, 0.3);
  const hmax = Math.max(w.top, w.top2) - w.bottom || 1;
  const gc = (z) => mix(lo2, hi, Math.min(1, Math.max(0, (z - z0) / hmax)));
  const A = at(0, WIN_OFF);
  const B = at(L, WIN_OFF);
  m.quadColors([[A, z0], [B, z0], [B, zt(L)], [A, zt(0)]], N, [lo2, lo2, gc(zt(L)), gc(zt(0))]);
  const fr = WIN_FRAME;
  const col = w.frame === "light" ? look.frame : look.mullion;
  const d1 = WIN_OFF + WIN_DEPTH;
  // 前の面だけの細い板（s0〜s1、下 b・上は bt(s)）
  const strip = (s0, s1, b0, b1, t0, t1) => {
    m.quad([[at(s0, d1), b0], [at(s1, d1), b1], [at(s1, d1), t1], [at(s0, d1), t0]], N, col);
  };
  strip(0, L, z0, z0, z0 + fr, z0 + fr);
  strip(0, L, zt(0) - fr, zt(L) - fr, zt(0), zt(L));
  strip(0, fr, z0, z0, zt(0), zt(fr));
  strip(L - fr, L, z0, z0, zt(L - fr), zt(L));
  const panes = w.panes || 1;
  for (let i = 1; i < panes; i++) {
    const sv = (L * i) / panes;
    strip(sv - fr / 2, sv + fr / 2, z0, z0, zt(sv - fr / 2), zt(sv + fr / 2));
  }
  for (const r of w.rows || []) {
    const zr = g0 + r;
    // 上の端が横の桟より高いところ（s の範囲）
    const t0 = w.top2 === w.top ? 0 : Math.min(L, Math.max(0, ((zr + fr / 2 - g0 - w.top) / (w.top2 - w.top)) * L));
    const [s0, s1] = w.top2 > w.top ? [t0, L] : [0, t0 || L];
    if (s1 - s0 > 0.05) strip(s0, s1, zr - fr / 2, zr - fr / 2, zr + fr / 2, zr + fr / 2);
  }
}

// 筒（vaults）：上が平らで下が半円。軸の折れ線に沿って、折れ目は留め継ぎ（断面は二等分の面に）。丸い面はステンレス（横を向くところは
// 空を映して明るく、下を向くところは暗く）で、パネルの目地（丸みに沿って VAULT_ARC m ごと・軸に沿って VAULT_PANEL m ごと）。
// 両端の面（D の形）と、その窓（glass：端の面の上から下へ [上の端, 下の端] m。まわりから VAULT_INSET 内側）、端の面の下の格子の台（balcony）
const VAULT_SEG = 28; // 半円の分割
const VAULT_ARC = 0.95;
const VAULT_PANEL = 1.6;
const VAULT_INSET = 0.45;
function addVault(m, v, g0, look) {
  const P = v.coords.map(toXY);
  const n = P.length;
  const R = v.width / 2;
  const zt = g0 + v.top;
  const U = [];
  for (let i = 0; i + 1 < n; i++) {
    const L = Math.hypot(P[i + 1][0] - P[i][0], P[i + 1][1] - P[i][1]);
    if (L < 1e-6) return;
    U.push([(P[i + 1][0] - P[i][0]) / L, (P[i + 1][1] - P[i][1]) / L]);
  }
  // 点ごとの横（左）の向き：折れ目は前後の左の向きの二等分を cos(半角) で割った長さ（留め継ぎ）
  const lat = P.map((_, i) => {
    const la = [-U[Math.max(0, i - 1)][1], U[Math.max(0, i - 1)][0]];
    const lb = [-U[Math.min(n - 2, i)][1], U[Math.min(n - 2, i)][0]];
    const s = [la[0] + lb[0], la[1] + lb[1]];
    const sl = Math.hypot(s[0], s[1]) || 1;
    const c = Math.max(0.3, (s[0] * la[0] + s[1] * la[1]) / sl);
    return [s[0] / sl / c, s[1] / sl / c];
  });
  const prof = Array.from({ length: VAULT_SEG + 1 }, (_, k) => (Math.PI * k) / VAULT_SEG);
  const pt = (i, x) => [P[i][0] + lat[i][0] * x, P[i][1] + lat[i][1] * x];
  const shine = (a) => mix(look.steelLo, look.steelHi, Math.pow(Math.abs(Math.cos(a)), 0.8));
  const tri4 = (p, ns, cs) => [0, 1, 2, 0, 2, 3].forEach((k) => m.vert(p[k][0], p[k][1], ns[k], cs[k]));
  // 丸い面（区間ごと。法線は区間の左の向きと断面の角から）
  for (let i = 0; i + 1 < n; i++) {
    const l = [-U[i][1], U[i][0]];
    const nrm = (a) => [l[0] * Math.cos(a), l[1] * Math.cos(a), -Math.sin(a)];
    for (let k = 0; k < VAULT_SEG; k++) {
      const [a0, a1] = [prof[k], prof[k + 1]];
      const z0 = zt - R * Math.sin(a0);
      const z1 = zt - R * Math.sin(a1);
      tri4([[pt(i, R * Math.cos(a0)), z0], [pt(i + 1, R * Math.cos(a0)), z0], [pt(i + 1, R * Math.cos(a1)), z1], [pt(i, R * Math.cos(a1)), z1]],
        [nrm(a0), nrm(a0), nrm(a1), nrm(a1)], [shine(a0), shine(a0), shine(a1), shine(a1)]);
    }
  }
  // 上の平らな面
  const top = [...P.map((_, i) => pt(i, R)), ...P.map((_, i) => pt(i, -R)).reverse()];
  m.polygon([top], zt, [0, 0, 1], look.vaultTop);
  // パネルの目地：丸みに沿う線（軸に平行）と、軸に直角の輪。面から少し外に
  // 目地は実物（数 mm）より太く：細いと遠くで画素より細くなり、交わるところだけ点々に見える
  const JW = 0.07;
  const OFF = 0.04;
  const arcN = Math.round((Math.PI * R) / VAULT_ARC);
  for (let i = 0; i + 1 < n; i++) {
    const l = [-U[i][1], U[i][0]];
    for (let j = 1; j < arcN; j++) {
      const a = (Math.PI * j) / arcN;
      const da = JW / 2 / R;
      const rr = R + OFF;
      const q = (ii, aa) => [pt(ii, rr * Math.cos(aa)), zt - rr * Math.sin(aa)];
      m.quad([q(i, a - da), q(i + 1, a - da), q(i + 1, a + da), q(i, a + da)], [l[0] * Math.cos(a), l[1] * Math.cos(a), -Math.sin(a)], look.steelLine);
    }
    // 軸に直角の輪：区間の長さを VAULT_PANEL に近い長さで等分（折れ目と両端は除く）
    const L = Math.hypot(P[i + 1][0] - P[i][0], P[i + 1][1] - P[i][1]);
    const K = Math.max(1, Math.round(L / VAULT_PANEL));
    for (let j = 1; j < K; j++) {
      const c = [P[i][0] + U[i][0] * ((L * j) / K), P[i][1] + U[i][1] * ((L * j) / K)];
      for (let k = 0; k < VAULT_SEG; k++) {
        const [a0, a1] = [prof[k], prof[k + 1]];
        const rr = R + OFF;
        const q = (a, sg) => [[c[0] + l[0] * rr * Math.cos(a) + U[i][0] * sg * JW / 2, c[1] + l[1] * rr * Math.cos(a) + U[i][1] * sg * JW / 2], zt - rr * Math.sin(a)];
        const am = (a0 + a1) / 2;
        m.quad([q(a0, -1), q(a0, 1), q(a1, 1), q(a1, -1)], [l[0] * Math.cos(am), l[1] * Math.cos(am), -Math.sin(am)], look.steelLine);
      }
    }
  }
  // 両端の面（D の形）：上の辺のまん中からの扇
  [0, n - 1].forEach((i, e) => {
    const out = e === 0 ? [-U[0][0], -U[0][1]] : U[n - 2];
    const l = [-out[1], out[0]];
    const N = [out[0], out[1], 0];
    const at = (x, d, o = 0) => [P[i][0] + lat[i][0] * x + out[0] * o, P[i][1] + lat[i][1] * x + out[1] * o];
    const c0 = [at(0, 0), zt];
    for (let k = 0; k < VAULT_SEG; k++) {
      const [a0, a1] = [prof[k], prof[k + 1]];
      [c0, [at(R * Math.cos(a0)), zt - R * Math.sin(a0)], [at(R * Math.cos(a1)), zt - R * Math.sin(a1)]].forEach((p) => m.vert(p[0], p[1], N, look.vaultEnd));
    }
    // 窓：上の端 ga・下の端 gb（深さ）。上の端は水平で、まわりから VAULT_INSET 内側の半円まで。下の端は、帯なら水平（両わきは
    // 半円に沿う）、レンズ（lens）なら上の端の両はしと、まん中の gb を通る弧（凸なので扇で）
    const g = v.glass?.[e];
    if (g) {
      const Ri = R - VAULT_INSET;
      const ga = Math.min(g.top, Ri - 0.2);
      const gb = Math.min(g.bottom, Ri);
      const X = (d) => Math.sqrt(Math.max(0, Ri * Ri - d * d));
      const w = X(ga);
      const rho = (w * w + (gb - ga) ** 2) / (2 * (gb - ga));
      const dBot = (x) => (g.lens ? gb - rho + Math.sqrt(Math.max(0, rho * rho - x * x)) : Math.min(gb, Math.sqrt(Math.max(0, Ri * Ri - x * x))));
      // 下の端を右の上の角（x = w）から左の上の角へ（x は左が +）。帯は平らになるところ（±X(gb)）も点に。最後の点から最初の点へが上の端
      const ARC = 24;
      const xsB = Array.from({ length: ARC + 1 }, (_, k) => w - (2 * w * k) / ARC);
      if (!g.lens) xsB.push(X(gb), -X(gb));
      const ring = [...new Set(xsB)].sort((p, q) => q - p).map((x) => [x, dBot(x)]);
      const OFFW = 0.03;
      const [lo, hi] = look.glass;
      const gcol = (d) => mix(mix(lo, hi, 0.3), hi, Math.min(1, Math.max(0, (gb - d) / Math.max(0.5, gb - ga))));
      const cx = ring.reduce((s, p) => s + p[0], 0) / ring.length;
      const cd = ring.reduce((s, p) => s + p[1], 0) / ring.length;
      for (let k = 0; k < ring.length; k++) {
        const p = ring[k];
        const q = ring[(k + 1) % ring.length];
        [[cx, cd], p, q].forEach(([x, d]) => m.vert(at(x, d, OFFW), zt - d, N, gcol(d)));
      }
      // 枠（まわり）と縦の桟（1.4m ほどごと）
      const FW = 0.08;
      for (let k = 0; k < ring.length; k++) {
        const p = ring[k];
        const q = ring[(k + 1) % ring.length];
        const dx = q[0] - p[0];
        const dd = q[1] - p[1];
        const ll = Math.hypot(dx, dd);
        if (ll < 1e-6) continue;
        // 窓の中へ向く横のずれ（面の上で）
        const ix = (-dd / ll) * FW;
        const id = (dx / ll) * FW;
        const s = (cx - p[0]) * ix + (cd - p[1]) * id > 0 ? 1 : -1;
        m.quad([[at(p[0], p[1], OFFW + 0.02), zt - p[1]], [at(q[0], q[1], OFFW + 0.02), zt - q[1]], [at(q[0] + ix * s, q[1] + id * s, OFFW + 0.02), zt - q[1] - id * s], [at(p[0] + ix * s, p[1] + id * s, OFFW + 0.02), zt - p[1] - id * s]], N, look.mullion);
      }
      const KM = g.panes || Math.max(1, Math.round((2 * w) / 1.4));
      for (let j = 1; j < KM; j++) {
        const x = -w + (2 * w * j) / KM;
        const db = dBot(x);
        if (db - ga < 0.1) continue;
        m.quad([[at(x - 0.03, 0, OFFW + 0.02), zt - db], [at(x + 0.03, 0, OFFW + 0.02), zt - db], [at(x + 0.03, 0, OFFW + 0.02), zt - ga], [at(x - 0.03, 0, OFFW + 0.02), zt - ga]], N, look.mullion);
      }
    }
    // 格子の床の台（端の面の下に吊る）：床・3 方の手すり（上と中の横棒・柱）・吊り棒
    const bc = v.balcony;
    if (bc && bc.end === e) {
      const zf = g0 + bc.z;
      const corner = (x, o) => at(x, 0, o);
      const T = 0.12;
      const fl = [corner(bc.from, 0.05), corner(bc.to, 0.05), corner(bc.to, bc.depth), corner(bc.from, bc.depth)];
      m.prism([fl[0], fl[3]], [fl[1], fl[2]], [zf - T, zf - T], [zf, zf], { top: look.grating, side: look.grating, bottom: look.grating }, { bottom: true });
      const rail = (p, q, z0, z1) => {
        const dx = q[0] - p[0];
        const dy = q[1] - p[1];
        const ll = Math.hypot(dx, dy) || 1;
        const w = [(-dy / ll) * 0.03, (dx / ll) * 0.03];
        m.prism([[p[0] + w[0], p[1] + w[1]], [q[0] + w[0], q[1] + w[1]]], [[p[0] - w[0], p[1] - w[1]], [q[0] - w[0], q[1] - w[1]]], [z0, z0], [z1, z1], { top: look.frameSteel, side: look.frameSteel });
      };
      const sides = [[fl[1], fl[2]], [fl[2], fl[3]], [fl[3], fl[0]]];
      for (const [p, q] of sides) {
        rail(p, q, zf + 1.05, zf + 1.1);
        rail(p, q, zf + 0.53, zf + 0.57);
        const ll = Math.hypot(q[0] - p[0], q[1] - p[1]);
        const K = Math.max(1, Math.round(ll / 1.2));
        for (let j = 0; j <= K; j++) {
          const c = [p[0] + ((q[0] - p[0]) * j) / K, p[1] + ((q[1] - p[1]) * j) / K];
          m.prism([[c[0] - 0.03, c[1]], [c[0] + 0.03, c[1]]], [[c[0] - 0.03, c[1] + 0.06], [c[0] + 0.03, c[1] + 0.06]], [zf, zf], [zf + 1.1, zf + 1.1], { top: look.frameSteel, side: look.frameSteel });
        }
      }
      // 吊り棒：外の角から、端の面の丸みの少し上へ
      for (const x of [bc.from, bc.to]) {
        const dEdge = Math.sqrt(Math.max(0, R * R - x * x));
        const hz = zt - dEdge + 0.4;
        if (hz <= zf + 1.1) continue;
        const p0 = corner(x, bc.depth);
        const p1 = corner(x, 0.02);
        const steps = 6;
        for (let j = 0; j < steps; j++) {
          const t0 = j / steps;
          const t1 = (j + 1) / steps;
          const a0 = [p0[0] + (p1[0] - p0[0]) * t0, p0[1] + (p1[1] - p0[1]) * t0];
          const a1 = [p0[0] + (p1[0] - p0[0]) * t1, p0[1] + (p1[1] - p0[1]) * t1];
          const za = zf + 1.1 + (hz - zf - 1.1) * t0;
          const zb = zf + 1.1 + (hz - zf - 1.1) * t1;
          rail(a0, a1, za - 0.03, zb + 0.03);
        }
      }
    }
  });
}

// 鉄骨の外階段（frame）：角と辺（3m ほどごと）の柱、踊り場の高さ（levels）ごとのまわりの梁と手すりと、長い向きの両端の踊り場の床、
// そのあいだを行き来する段の板（幅の半分ずつ、上りの向きを踊り場ごとに入れかえる）
function addFrame(m, f, ring, g0, bot, look) {
  const col = { top: look.frameSteel, side: look.frameSteel, bottom: look.frameSteel };
  const H = f.height;
  const post = (p, z0, z1, w = 0.14) => m.prism([[p[0] - w / 2, p[1] - w / 2], [p[0] + w / 2, p[1] - w / 2]], [[p[0] - w / 2, p[1] + w / 2], [p[0] + w / 2, p[1] + w / 2]], [z0, z0], [z1, z1], col);
  const beam = (p, q, z0, z1, w = 0.08) => {
    const dx = q[0] - p[0];
    const dy = q[1] - p[1];
    const ll = Math.hypot(dx, dy) || 1;
    const o = [(-dy / ll) * (w / 2), (dx / ll) * (w / 2)];
    m.prism([[p[0] + o[0], p[1] + o[1]], [q[0] + o[0], q[1] + o[1]]], [[p[0] - o[0], p[1] - o[1]], [q[0] - o[0], q[1] - o[1]]], [z0, z0], [z1, z1], col);
  };
  ring.forEach((a, i) => {
    const b = ring[(i + 1) % ring.length];
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const K = Math.max(1, Math.round(L / 3));
    for (let j = 0; j < K; j++) post([a[0] + ((b[0] - a[0]) * j) / K, a[1] + ((b[1] - a[1]) * j) / K], bot, g0 + H);
    for (const z of [...(f.levels || []), H]) {
      beam(a, b, g0 + z - 0.25, g0 + z, 0.12);
      if (z < H - 0.5) beam(a, b, g0 + z + 1.0, g0 + z + 1.06, 0.05);
    }
  });
  // 長い向き：いちばん長い辺。両端の踊り場は、その向きの両はしから 1.6m
  let best = 0;
  ring.forEach((a, i) => {
    const b = ring[(i + 1) % ring.length];
    if (Math.hypot(b[0] - a[0], b[1] - a[1]) > Math.hypot(ring[(best + 1) % ring.length][0] - ring[best][0], ring[(best + 1) % ring.length][1] - ring[best][1])) best = i;
  });
  const A = ring[best];
  const B = ring[(best + 1) % ring.length];
  const len = Math.hypot(B[0] - A[0], B[1] - A[1]);
  const u = [(B[0] - A[0]) / len, (B[1] - A[1]) / len];
  const ss = ring.map((p) => (p[0] - A[0]) * u[0] + (p[1] - A[1]) * u[1]);
  const ts = ring.map((p) => (p[0] - A[0]) * -u[1] + (p[1] - A[1]) * u[0]);
  const [s0, s1] = [Math.min(...ss), Math.max(...ss)];
  const [t0, t1] = [Math.min(...ts), Math.max(...ts)];
  const at = (s, t) => [A[0] + u[0] * s - u[1] * t, A[1] + u[1] * s + u[0] * t];
  const LAND = Math.min(1.6, (s1 - s0) / 4);
  const zs = [0, ...(f.levels || [])];
  const slab = (sa, sb, ta, tb, za, zb, T = 0.15) => m.prism([at(sa, ta), at(sb, ta)], [at(sa, tb), at(sb, tb)], [za - T, zb - T], [za, zb], { top: look.frameSteel, side: look.frameSteel, bottom: look.frameSteel }, { bottom: true });
  // 階ごとに 2 本の流れ：s0 の端の踊り場（その階）から s1 の端の中間の踊り場へ（幅の片側）、そこから上の階の s0 の端へ（もう片側）
  const tm = (t0 + t1) / 2;
  for (let k = 1; k < zs.length; k++) {
    const zm = (zs[k - 1] + zs[k]) / 2;
    slab(s1 - LAND, s1, t0, t1, g0 + zm, g0 + zm);
    slab(s0, s0 + LAND, t0, t1, g0 + zs[k], g0 + zs[k]);
    slab(s0 + LAND, s1 - LAND, t0, tm, g0 + zs[k - 1] + 0.02, g0 + zm, 0.2);
    slab(s0 + LAND, s1 - LAND, tm, t1, g0 + zs[k], g0 + zm, 0.2);
  }
}

// 階段：段ごとの箱（段の下の地面より下から段の上まで）を m に、手すりを rm に
export const stairsColorKey = (f) => (f.material === "wood" ? "stairsWood" : f.material === "stone" ? "stairsStone" : f.material === "brick" ? "stairsBrick" : "stairs");
function addStairs(m, rm, sl, groundAt, cols, tint) {
  const f = sl.f;
  const c = tint(rgba(cols[stairsColorKey(f)]));
  const L = offsetLine(sl.xy, sl.hwv.map((h, i) => sl.cv[i] + h));
  const R = offsetLine(sl.xy, sl.hwv.map((h, i) => sl.cv[i] - h));
  const at = (line, i, t) => [line[i][0] + (line[i + 1][0] - line[i][0]) * t, line[i][1] + (line[i + 1][1] - line[i][1]) * t];
  stairSteps(sl.prof, f.riser, sl.cum).forEach((st) => {
    const i = st.seg;
    const len = sl.cum[i + 1] - sl.cum[i];
    const t0 = (st.s0 - sl.cum[i]) / len;
    const t1 = (st.s1 - sl.cum[i]) / len;
    // 段の下の地面より下から。まわりより高い段（下は元の地面のまま）は、その下の地面まで下ろす（壁がなくても浮かない）
    const foot = [at(L, i, t0), at(L, i, t1), at(R, i, t0), at(R, i, t1)].map((q) => groundAt(toLngLat(q))).filter(Number.isFinite);
    const base = Math.min(lerpAlong(sl.under.s, sl.under.e, st.s0) - 0.5, lerpAlong(sl.under.s, sl.under.e, st.s1) - 0.5, ...foot.map((g) => g - 0.3));
    m.prism([at(L, i, t0), at(L, i, t1)], [at(R, i, t0), at(R, i, t1)], [base, base], [st.top, st.top], { top: c, side: c });
  });
  // 手すり：位置ごとに、足もとの線から 0.85〜0.95m の横の棒と、1.2m おきの支柱（板にすると段が隠れる）。
  // 位置 r は段の幅に対する割合（0 が左の端、1 が右の端）。段の上なら足もとは段の角をなぞる線、土台の上なら壁の上（斜面なら路肩）
  const rails = f.rails || [];
  if (!rails.length) return;
  const rc = tint(rgba(cols.railing));
  const { pts, s } = densify(sl.xy, 0.5);
  const { hw, hb, c: cs } = halfWidths(sl, s);
  const ramp = s.map((v) => lerpAlong(sl.prof.s, sl.prof.e, v));
  const nose = ramp.map((v) => v + sl.rise);
  const feet = {}; // 土台の上の足もと（左右それぞれ）
  const footOnBase = (sg) => {
    if (!feet[sg]) {
      const out = sl.wt > 0 ? outerGround(groundAt, pts, cs, hb, sg) : null;
      feet[sg] = ramp.map((v, i) => (!out ? v - sl.rise - 0.02 : Number.isFinite(out[i]) ? Math.max(v, out[i]) + 0.05 : v));
    }
    return feet[sg];
  };
  const len = sl.cum[sl.cum.length - 1];
  rails.forEach((r) => {
    const onSteps = (r >= 0 && r <= 1) || !(sl.wt > 0 || sl.side > 0); // 壁も路肩もなければ段のふち
    // 中心線から左へ（m）。幅が変わるところでは、同じ割合の位置
    const offAt = (h, b) => {
      const lim = (onSteps ? h : b) - 0.06;
      return Math.min(lim, Math.max(-lim, h * (1 - 2 * r)));
    };
    const o = hw.map((h, i) => cs[i] + offAt(h, hb[i]));
    const foot = onSteps ? nose : footOnBase(r < 0 ? 1 : -1);
    rm.prism(...band(pts, o.map((v) => v + 0.03), o.map((v) => v - 0.03)), foot.map((v) => v + 0.85), foot.map((v) => v + 0.95), { top: rc, side: rc });
    for (let k = 0, n = Math.max(1, Math.round(len / 1.2)); k <= n; k++) {
      const sv = (len * k) / n;
      const i = Math.min(sl.xy.length - 2, Math.max(0, sl.cum.findIndex((c) => c >= sv) - 1));
      const a = sl.xy[i];
      const b = sl.xy[i + 1];
      const dl = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
      const t = (sv - sl.cum[i]) / dl;
      const p = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
      const u = [(b[0] - a[0]) / dl, (b[1] - a[1]) / dl];
      const post = [[p[0] - u[0] * 0.03, p[1] - u[1] * 0.03], [p[0] + u[0] * 0.03, p[1] + u[1] * 0.03]];
      const z1 = lerpAlong(s, foot, sv) + 0.95;
      const z0 = foot === nose ? z1 - 0.95 - sl.rise : z1 - 0.95; // 段の上の支柱は坂の面から（段の箱に刺さる）
      const ov = lerpAlong(sl.cum, sl.cv, sv) + offAt(lerpAlong(sl.cum, sl.hwv, sv), lerpAlong(sl.cum, sl.hbv, sv));
      rm.prism(...band(post, ov + 0.03, ov - 0.03), [z0, z0], [z1, z1], { top: rc, side: rc });
    }
  });
}

/**
 * @param features   構造物（normalizeFeature 済み）
 * @param ctx        { groundAt, slopes（dem.slopes：坂道・階段）, terraces（dem.terraces：平地）, ceilings（通り抜けの天井 [{ rings: lng/lat, z }]）, pal, dark, selectedId, accent,
 *                    bldColor（建物＝地図の建物の置きかえの色：f → "#rrggbb"。なければ pal.bld）, clip（polygon-clipping。建物のくり抜きに使う）,
 *                    tone（時刻の見え方の色：(昼の色, 夜の色) → いまの色。なければ dark で昼か夜） }
 * @returns          { pos, nrm, col, count, thin（階段の手すり。同じ形の三角形の並び）, glass（ガラスの手すりの板。半透明で重ねる） }
 */
export function buildMesh(features, { groundAt, slopes = [], terraces = [], ceilings = [], pal, dark, selectedId = null, accent = "#28c868", bldColor = null, clip = null, tone = null }) {
  const m = new Mesh();
  const thin = new Mesh(); // 階段の手すり：奥行きを書かずに描く（ルートの線を支柱で途切れさせない）
  const glassy = new Mesh(); // ガラスの手すりの板：ほかを描いたあとに半透明で重ねる（向こうの段や穴が透けて見える）
  // tone（時刻の見え方：(昼の色, 夜の色) → いまの色）があれば、昼と夜の色からいまの色に
  const cols = tone ? Object.fromEntries(Object.keys(COLORS.light).map((k) => [k, tone(COLORS.light[k], COLORS.dark[k])])) : dark ? COLORS.dark : COLORS.light;
  const acc = rgba(accent);
  features.forEach((f) => {
    const tint = f.id === selectedId ? (c) => mix(c, acc, 0.45) : (c) => c;
    if (f.type === "wall" && f.kind === "hedge") addHedge(m, f, groundAt, tint(rgba(cols.hedge)));
    else if (f.type === "wall" && f.kind === "fence") addFence(m, f, groundAt, tint(rgba(cols.railing)));
    else if (f.type === "wall" && f.kind === "rail") addRail(m, f, groundAt, tint(rgba(cols.rail)));
    else if (f.type === "wall" && f.kind === "glass") addGlassRail(m, f, groundAt, tint(rgba(cols.glassRail)), tint(rgba(cols.rail)), tint(rgba(cols.stone)), glassy);
    else if (f.type === "wall" && f.kind === "slant") addSlantFence(m, f, groundAt, tint(rgba(cols.rail)), tint(rgba(cols.stone)));
    else if (f.type === "wall" && f.kind === "xbrace") addCrossRail(m, f, groundAt, tint(rgba(cols.xbrace)));
    else if (f.type === "wall" && f.kind === "bench") addBench(m, f, groundAt, tint(rgba(cols.benchWood)));
    else if (f.type === "signal") addSignal(m, f, groundAt, cols, tint);
    else if (f.type === "sign") addSign(m, f, groundAt, cols, tint);
    else if (f.type === "wall") addWall(m, f, groundAt, tint(rgba(cols.wall)));
    else if (f.type === "bridge") addBridge(m, f, groundAt, pal, cols, tint);
    else if (f.type === "tree") addTree(m, f, groundAt, cols, tint);
    // 建物を通る通り抜けも、くり抜き（地面から通り抜けの高さまで）として穴をあける
    else if (f.type === "building") {
      const c = tint(rgba(f.material ? cols[MATERIAL_COLOR[f.material]] : bldColor ? bldColor(f) : pal?.bld || "#ffffff"));
      // 白い点の模様のガラス（glassFrit）は、白を混ぜて明るく
      const frit = (k, t) => (f.glassFrit ? mix(rgba(cols[k]), rgba(cols.fritWhite), t) : rgba(cols[k]));
      const look = {
        glass: [tint(frit("glassLo", 0.45)), tint(frit("glassHi", 0.35))], mullion: tint(rgba(cols.mullion)), green: tint(rgba(cols.roofGreen)),
        eave: f.roof === "green" ? tint(rgba(cols.eaveDark)) : c, deck: tint(rgba(cols.roofDeck)), riser: tint(rgba(cols.roofRiser)),
        dark: tint(rgba(cols.winDark)), reveal: tint(rgba(cols.winReveal)), grille: tint(rgba(cols.grille)), door: tint(rgba(cols.doorPanel)),
        frame: tint(rgba(cols.frame)), canopy: tint(rgba(cols.canopy)), canopyTop: tint(rgba(cols.canopyTop)),
        glassRoof: tint(mix(rgba(cols.glassLo), rgba(cols.glassHi), 0.55)),
        steelHi: tint(rgba(cols.steelHi)), steelLo: tint(rgba(cols.steelLo)), steelLine: tint(rgba(cols.steelLine)), frameSteel: tint(rgba(cols.frameSteel)), grating: tint(rgba(cols.grating)),
        perforated: tint(rgba(cols.perforated)), dome: tint(rgba(cols.dome)), domeCurb: c, letter: tint(rgba(cols.letter)),
        solar: tint(rgba(cols.solar)), solarLine: tint(rgba(cols.solarLine)), parapet: tint(rgba(cols.parapet)), fin: tint(rgba(cols.fin)), member: tint(rgba(cols.member)),
        redPanel: tint(rgba(cols.redPanel)),
        trellis: tint(rgba(cols.trellis)), planter: tint(rgba(cols.planter)), vine: [tint(rgba(cols.vine1)), tint(rgba(cols.vine2)), tint(rgba(cols.vine3))],
      };
      addBuilding(m, { ...f, carves: buildingOpenings(f, features) }, groundAt, c, clip, look);
    }
  });
  const bldBots = !terraces.length ? [] : features.filter((f) => f.type === "building" && f.coords.length >= 3).map((f) => {
    const ring = f.coords.map(toXY);
    const mean = ring.reduce((a, p) => [a[0] + p[0] / ring.length, a[1] + p[1] / ring.length], [0, 0]);
    const gs = [groundAt(f.groundRef || toLngLat(mean)), ...ring.map((p) => groundAt(toLngLat(p)))].filter(Number.isFinite);
    return { ring, bot: gs.length ? Math.min(...gs) - 1 : Infinity };
  });
  // 天井のある平地のふた（となりの平地のまぐさも、これで決まる）と、その色（床は踊り場と同じ、ふたは地面に貼った路面の色。路面は
  // 光を当てずに描かれるので、上から光の当たるふたは少し暗く）
  const groundXY = (x, y) => groundAt(toLngLat([x, y]));
  const lids = new Map();
  terraces.forEach((tr) => {
    if (tr.f.ceiling > 0 && !(tr.side > 0)) {
      const lid = terraceLid(tr.f, tr.ring, tr.elev, groundXY);
      if (lid) lids.set(tr, lid);
    }
  });
  const paints = features.filter((f) => f.type === "surface" && SURFACE_KINDS[f.kind]).map((f) => {
    const ring = f.coords.map(toXY);
    return { f, ring, box: [Math.min(...ring.map((q) => q[0])), Math.min(...ring.map((q) => q[1])), Math.max(...ring.map((q) => q[0])), Math.max(...ring.map((q) => q[1]))] };
  });
  const paintTone = (k) => rgba(tone ? tone(k.light, k.dark) : dark ? k.dark : k.light);
  const lit = (col) => [col[0] * 0.97, col[1] * 0.97, col[2] * 0.97, col[3]];
  const paintAt = (p) => {
    let best = null;
    for (const s of paints) {
      if (p[0] < s.box[0] || p[0] > s.box[2] || p[1] < s.box[1] || p[1] > s.box[3]) continue;
      if (pointInRing(p[0], p[1], s.ring) && (!best || SURFACE_ORDER.indexOf(s.f.kind) > SURFACE_ORDER.indexOf(best.f.kind))) best = s;
    }
    return best ? lit(paintTone(SURFACE_KINDS[best.f.kind])) : null;
  };
  const covered = {
    // 床：開いた口の前（口の外 0.6m）の床の色。階段・坂の上なら段の色、路面を貼ったところならその色
    floor: (ring, lid) => {
      const i = lid.walls.findIndex((w) => !w);
      if (i < 0) return rgba(cols.stairs);
      const a = ring[i];
      const b = ring[(i + 1) % ring.length];
      const L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
      const sg = ringArea(ring) > 0 ? 1 : -1;
      const q = [(a[0] + b[0]) / 2 + ((b[1] - a[1]) / L) * sg * 0.6, (a[1] + b[1]) / 2 - ((b[0] - a[0]) / L) * sg * 0.6];
      const under = slopes.find((sl) => stripDistance(sl.xy, sl.cum, sl.hwv, q, sl.cv).D <= 0);
      if (under) return rgba(cols[under.f.type === "stairs" ? stairsColorKey(under.f) : "stairs"]);
      return paintAt(q) || rgba(cols.stairs);
    },
    ceiling: rgba(cols.ceiling),
    lid: (poly) => paintAt(poly.reduce((a, p) => [a[0] + p[0] / poly.length, a[1] + p[1] / poly.length], [0, 0])) || (pal?.campus ? lit(rgba(pal.campus)) : lit(rgba(cols.wall))),
  };
  // 平地の壁の上の面の色（wallTop）：自動は点 p（壁の帯の外）の路面の色。路面がなければキャンパスの地面の色（pal.campus）
  const campusGround = pal?.campus ? lit(rgba(pal.campus)) : null;
  const topColor = (f, p) => (f.wallTop === "wall" ? null : f.wallTop ? lit(paintTone(SURFACE_KINDS[f.wallTop])) : paintAt(p) || campusGround);
  terraces.forEach((tr) => {
    if (tr.side > 0) return;
    const tint = tr.f.id === selectedId ? (c) => mix(c, acc, 0.45) : (c) => c;
    // 面の見た目（ガラス・れんが）と梁があれば、その色
    const look = tr.f.faces || tr.f.beams ? {
      glass: [tint(rgba(cols.glassLo)), tint(rgba(cols.glassHi))], frost: [tint(rgba(cols.frostLo)), tint(rgba(cols.frostHi))],
      door: tint(rgba(cols.doorGlass)), frame: tint(rgba(cols.frame)), brick: tint(rgba(cols.brick)), brickLine: tint(rgba(cols.brickLine)),
      deckFace: tint(rgba(cols.deckFace)), deckGap: tint(rgba(cols.deckGap)), deckPost: tint(rgba(cols.deckPost)),
    } : null;
    // ウッドデッキの縁（faces の deck）がある平地は、壁の帯も木の縁の色（坂・段が横切るところの帯の端の面・角が白く見えないように。
    // 外の面は縁の板が覆う）
    const deckEdge = tr.f.faces?.some((fc) => fc?.deck);
    addTerraceWalls(m, tr, { groundAt, terraces, paths: slopes, buildings: bldBots, lids, covered, topColor: (f, p) => { const col = topColor(f, p); return col ? tint(col) : null; } }, tint(rgba(deckEdge ? cols.deckFace : cols.wall)), look);
  });
  slopes.forEach((sl) => {
    const tint = sl.f.id === selectedId ? (c) => mix(c, acc, 0.45) : (c) => c;
    if (sl.f.type === "stairs") addStairs(m, thin, sl, groundAt, cols, tint);
    // 壁の色：坂は material（木の歩道の縁など）、ほかはコンクリート
    if (sl.f.side === 0 && sl.walls) addSlopeWalls(m, sl, groundAt, tint(rgba(cols[sl.f.type === "slope" && sl.f.material ? stairsColorKey(sl.f) : "wall"])));
  });
  const cc = rgba(cols.ceiling);
  ceilings.forEach(({ rings, z }) => m.polygon(rings.map((r) => r.map(toXY)), z, [0, 0, -1], cc));
  return { ...m.result(), thin: thin.result(), glass: glassy.result() };
}

// 橋の上を通るルート（[[lng, lat, 床の標高], ...] の並び）を、画面上で決まった太さの帯にする。
// off は帯の横方向（太さはレイヤーが px で掛ける）。点ごとに小さな円を置いて、曲がり角と端を丸くする
export function buildRibbons(pieces, lift = 0.08) {
  const pos = [];
  const off = [];
  const add = (p, o) => {
    pos.push(p[0], p[1], p[2]);
    off.push(o[0], o[1]);
  };
  pieces.forEach((piece) => {
    const P = piece.map(([lng, lat, z]) => [(mercX(lng) - ORIGIN[0]) * MERC_SCALE, (mercY(lat) - ORIGIN[1]) * MERC_SCALE, z + lift]);
    for (let i = 0; i < P.length - 1; i++) {
      const a = P[i];
      const b = P[i + 1];
      const dx = b[0] - a[0];
      const dy = b[1] - a[1];
      const l = Math.hypot(dx, dy);
      if (l < 1e-9) continue;
      const n = [-dy / l, dx / l];
      const nn = [-n[0], -n[1]];
      [[a, n], [a, nn], [b, n], [b, n], [a, nn], [b, nn]].forEach(([p, o]) => add(p, o));
    }
    P.forEach((p) => {
      for (let k = 0; k < 8; k++) {
        const a0 = (k / 8) * Math.PI * 2;
        const a1 = ((k + 1) / 8) * Math.PI * 2;
        add(p, [0, 0]);
        add(p, [Math.cos(a0), Math.sin(a0)]);
        add(p, [Math.cos(a1), Math.sin(a1)]);
      }
    });
  });
  return { pos: new Float32Array(pos), off: new Float32Array(off), count: pos.length / 3 };
}
