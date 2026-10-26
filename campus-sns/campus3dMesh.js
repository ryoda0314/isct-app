// 手で足した構造物（campus3dFeatures.js）を、3Dレイヤー（campus3dLayer.js）で描く三角形にする。
// 位置はメルカトル座標の「キャンパスの中心からの差 × MERC_SCALE」と標高(m)。float32 でも桁が落ちないように中心からの差で持つ
import earcut from "earcut";
import { CAMPUS_CENTER } from "./hooks/useLocationSharing.js";
import { WALL_T, buildingRoof, densify, edgeOpen, isOpenStairs, lerpAlong, offsetLine, pointInRing, ringArea, roofPieces, stairSteps, stairsOpening, stripDistance, toLngLat, toXY, vertexElevations } from "./campus3dFeatures.js";

export const MERC_SCALE = 2 ** 20;
const DEG = Math.PI / 180;
const mercX = (lng) => (lng + 180) / 360;
const mercY = (lat) => {
  const s = Math.sin(lat * DEG);
  return 0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI);
};
export const ORIGIN = [mercX(CAMPUS_CENTER.lng), mercY(CAMPUS_CENTER.lat)];

const rgba = (hex, a = 1) => {
  const n = parseInt(hex.slice(1, 7), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255, a];
};
const mix = (a, b, t) => [0, 1, 2, 3].map((k) => a[k] + (b[k] - a[k]) * t);

// 3Dで足す構造物の色（建物と同じ光の当て方で、側面は暗くなる）
const COLORS = {
  light: { wall: "#dfe4e9", deckSide: "#d3dbe3", railing: "#c3ccd5", pier: "#c9d2db", ceiling: "#d5dce3", stairs: "#eceff2" },
  dark: { wall: "#353d47", deckSide: "#2c333c", railing: "#4a5460", pier: "#2a3139", ceiling: "#20252c", stairs: "#3b424c" },
};

// 三角形の並び（位置・法線・色）。電車（campus3dTrains.js）も使う
export class Mesh {
  constructor() {
    this.pos = [];
    this.nrm = [];
    this.col = [];
  }

  // xy は平面の m 座標、z は標高(m)、n は法線（東・北・上）
  vert(xy, z, n, c) {
    const [lng, lat] = toLngLat(xy);
    this.pos.push((mercX(lng) - ORIGIN[0]) * MERC_SCALE, (mercY(lat) - ORIGIN[1]) * MERC_SCALE, z);
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

function addBridge(m, f, groundAt, pal, cols, tint) {
  const { cum, elev } = vertexElevations(f.coords, f.z, groundAt);
  if (!finite(elev)) return;
  const xy = f.coords.map(toXY);
  const { pts, s } = densify(xy, 2);
  const deck = s.map((v) => lerpAlong(cum, elev, v));
  const hw = f.width / 2;
  const surface = tint(rgba(f.surface === "rail" ? pal.rail : f.surface === "street" ? pal.street : pal.walk));
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

// 平地のふちを垂直に切ったとき：ふちに沿って、平地とまわりの地面の段差に壁を立てる。
// 坂道・階段がふちを横切るところと、となりの平地のほうが高いところ（そちらが壁を立てる）はあける。
// 壁を立てない階段（walls: false）は、横切るところだけあけ、両わきのふちに沿うところは残す（平地の壁がその両わきの壁になる。
// 判定は campus3dFeatures.js の edgeOpen：焼き込みでも同じところのふちの外を掘らない）
function addTerraceWalls(m, tr, { groundAt, terraces, paths }, c) {
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
  const ground = pts.map((p, i) => {
    const qs = outers[i];
    if (gaps.some(({ sl, hv }) => stripDistance(sl.xy, sl.cum, hv, p, sl.cv).D <= 0)) return null;
    if (opens.length) {
      // 角の点は、どちらかの辺が階段のふちに沿っていれば残す（壁が角まで届く）
      const dirs = [dirOf(i > 0 ? pts[i - 1] : pts[last - 1], p), dirOf(p, i < last ? pts[i + 1] : pts[1])];
      if (dirs.every((dir) => edgeOpen(opens, p, dir))) return null;
    }
    if (terraces.some((t) => t !== tr && t.elev > tr.elev + 0.05 && qs.some((q) => pointInRing(q[0], q[1], t.ring)))) return null;
    const g = Math.max(...qs.map((q) => groundAt(toLngLat(q))));
    return Number.isFinite(g) && Math.abs(tr.elev - g) >= 0.15 ? g : null;
  });
  // 壁を立てる点が続くところごとに1枚
  for (let k = 0; k < pts.length; ) {
    if (ground[k] == null) { k++; continue; }
    let j = k;
    while (j + 1 < pts.length && ground[j + 1] != null) j++;
    if (j > k) {
      const gs = ground.slice(k, j + 1);
      // 壁はふちから外へ WALL_T（地面の段差のつなぎ目をこの中に隠す）
      m.prism(...band(pts.slice(k, j + 1), 0, out * WALL_T), gs.map((g) => Math.min(tr.elev, g) - 0.3), gs.map((g) => Math.max(tr.elev, g) + 0.05), { top: c, side: c });
    }
    k = j + 1;
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
function carveSurfaces(cr, cv) {
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
function reachOut(cr, ring) {
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
function addBuilding(m, f, groundAt, c, clip = null) {
  const ring = f.coords.map(toXY);
  if (ring.length < 3) return;
  const mean = ring.reduce((a, p) => [a[0] + p[0] / ring.length, a[1] + p[1] / ring.length], [0, 0]);
  const g0 = groundAt(toLngLat(mean));
  const gs = ring.map((p) => groundAt(toLngLat(p))).filter(Number.isFinite);
  if (!Number.isFinite(g0) || !gs.length) return;
  const bot = Math.min(g0, ...gs) - 1;
  const cIn = [c[0] * 0.86, c[1] * 0.86, c[2] * 0.86, c[3]]; // くり抜きの奥（奥の壁・天井）は少し暗く：外の壁と同じ向きでも、へこみが見えるように
  const hAt = buildingRoof(f).hAt;
  const pieces = roofPieces(f, ring);
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
  // 屋根（上まで抜けたくり抜きのところは除く）
  const openRings = carves.filter((cv) => cv.open).map((cv) => [closeRing(cv.ring)]);
  for (const { poly, fn } of pieces) {
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
    for (const pg of parts) m.polygon(pg, zf, [-fn[0] / l, -fn[1] / l, 1 / l], c);
  }
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
      if (pg[0].some((p) => planeVal(fl, p) > ROOF_MIN)) m.polygon(pg, (p) => g0 + Math.max(0, planeVal(fl, p)), nUp(fl), c);
      if (!cv.open && ce) {
        const up = nUp(ce);
        m.polygon(pg, (p) => g0 + Math.max(planeVal(fl, p), Math.min(planeVal(ce, p), hAt(p))), [-up[0], -up[1], -up[2]], cIn);
      }
    }
  }
  // 外の壁：ふちの辺を、屋根の分かれ目（分けた多角形の点が辺の上にあるところ）とくり抜きのふちで区切って
  const ccw = ringArea(ring) > 0;
  const onEdge = pieces.flatMap(({ poly }) => poly);
  ring.forEach((a, i) => {
    const b = ring[(i + 1) % ring.length];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const l2 = dx * dx + dy * dy;
    if (l2 < 1e-9) return;
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
    ks.sort((x, y) => x - y);
    const l = Math.sqrt(l2);
    const n = ccw ? [dy / l, -dx / l, 0] : [-dy / l, dx / l, 0]; // 外向き
    for (let k = 0; k + 1 < ks.length; k++) {
      if (ks[k + 1] - ks[k] < 1e-6) continue;
      const p = [a[0] + dx * ks[k], a[1] + dy * ks[k]];
      const q = [a[0] + dx * ks[k + 1], a[1] + dy * ks[k + 1]];
      const hp = hAt(p);
      const hq = hAt(q);
      if (hp <= ROOF_MIN && hq <= ROOF_MIN) continue;
      const cv = carveAt([(p[0] + q[0]) / 2, (p[1] + q[1]) / 2]);
      if (!cv) {
        m.quad([[p, bot], [q, bot], [q, g0 + hq], [p, g0 + hp]], n, c);
        continue;
      }
      // くり抜きのところ：床より下と、天井より上だけ（床・天井が斜めでも続くよう 0.5m ごとに）
      const P = stepsAlong(p, q);
      const H = P.map(hAt);
      const FL = P.map((x) => Math.max(0, cv.floorAt(x)));
      const CE = cv.open ? null : P.map((x) => cv.ceilAt(x));
      for (let s = 0; s + 1 < P.length; s++) {
        if (FL[s] > ROOF_MIN || FL[s + 1] > ROOF_MIN) m.quad([[P[s], bot], [P[s + 1], bot], [P[s + 1], g0 + Math.min(FL[s + 1], H[s + 1])], [P[s], g0 + Math.min(FL[s], H[s])]], n, c);
        if (CE) m.quad([[P[s], g0 + Math.max(FL[s], Math.min(CE[s], H[s]))], [P[s + 1], g0 + Math.max(FL[s + 1], Math.min(CE[s + 1], H[s + 1]))], [P[s + 1], g0 + H[s + 1]], [P[s], g0 + H[s]]], n, c);
      }
      // 床のふちの手すり壁（外の壁の面から内へ。床に沿って）
      if (cv.rail && FL.some((v) => v > ROOF_MIN)) {
        const inn = [-n[0] * RAIL_T, -n[1] * RAIL_T];
        const top = FL.map((v, s) => g0 + v + Math.min(RAIL_H, CE ? Math.max(0, CE[s] - v) : RAIL_H));
        m.prism(P, P.map((x) => [x[0] + inn[0], x[1] + inn[1]]), FL.map((v) => g0 + v), top, { top: c, side: c });
      }
    }
  });
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
      const zt = (p) => g0 + Math.max(cv.floorAt(p), cv.open ? hAt(p) : Math.min(cv.ceilAt(p), hAt(p)));
      for (let k = 0; k + 1 < ks.length; k++) {
        const s0 = ks[k] * len;
        const s1 = ks[k + 1] * len;
        if (s1 - s0 < 1e-6) continue;
        const mid = [a[0] + (ux * (s0 + s1)) / 2, a[1] + (uy * (s0 + s1)) / 2];
        if (!pointInRing(mid[0], mid[1], ring) || carves.some((o) => o !== cv && pointInRing(mid[0], mid[1], o.ring))) continue;
        // 斜めの屋根・床・天井に合わせて 0.5m ごとに
        const steps = Math.max(1, Math.ceil((s1 - s0) / 0.5));
        for (let q = 0; q < steps; q++) {
          const sa = s0 + ((s1 - s0) * q) / steps;
          const sb = s0 + ((s1 - s0) * (q + 1)) / steps;
          const pa = [a[0] + ux * sa, a[1] + uy * sa];
          const pb = [a[0] + ux * sb, a[1] + uy * sb];
          const ba = zb(pa);
          const bb = zb(pb);
          const ta = zt(pa);
          const tb = zt(pb);
          if (ta - ba < ROOF_MIN && tb - bb < ROOF_MIN) continue;
          m.quad([[pa, ba], [pb, bb], [pb, tb], [pa, ta]], nin, cIn);
        }
      }
    });
  }
}

// 階段：段ごとの箱（段の下の地面より下から段の上まで）を m に、手すりを rm に
function addStairs(m, rm, sl, groundAt, cols, tint) {
  const f = sl.f;
  const c = tint(rgba(cols.stairs));
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
 * @returns          { pos, nrm, col, count, thin（階段の手すり。同じ形の三角形の並び） }
 */
export function buildMesh(features, { groundAt, slopes = [], terraces = [], ceilings = [], pal, dark, selectedId = null, accent = "#28c868", bldColor = null, clip = null, tone = null }) {
  const m = new Mesh();
  const thin = new Mesh(); // 階段の手すり：奥行きを書かずに描く（ルートの線を支柱で途切れさせない）
  // tone（時刻の見え方：(昼の色, 夜の色) → いまの色）があれば、昼と夜の色からいまの色に
  const cols = tone ? Object.fromEntries(Object.keys(COLORS.light).map((k) => [k, tone(COLORS.light[k], COLORS.dark[k])])) : dark ? COLORS.dark : COLORS.light;
  const acc = rgba(accent);
  features.forEach((f) => {
    const tint = f.id === selectedId ? (c) => mix(c, acc, 0.45) : (c) => c;
    if (f.type === "wall") addWall(m, f, groundAt, tint(rgba(cols.wall)));
    else if (f.type === "bridge") addBridge(m, f, groundAt, pal, cols, tint);
    else if (f.type === "building") addBuilding(m, f, groundAt, tint(rgba(bldColor ? bldColor(f) : pal?.bld || "#ffffff")), clip);
  });
  terraces.forEach((tr) => {
    if (tr.side > 0) return;
    const tint = tr.f.id === selectedId ? (c) => mix(c, acc, 0.45) : (c) => c;
    addTerraceWalls(m, tr, { groundAt, terraces, paths: slopes }, tint(rgba(cols.wall)));
  });
  slopes.forEach((sl) => {
    const tint = sl.f.id === selectedId ? (c) => mix(c, acc, 0.45) : (c) => c;
    if (sl.f.type === "stairs") addStairs(m, thin, sl, groundAt, cols, tint);
    if (sl.f.side === 0 && sl.walls) addSlopeWalls(m, sl, groundAt, tint(rgba(cols.wall)));
  });
  const cc = rgba(cols.ceiling);
  ceilings.forEach(({ rings, z }) => m.polygon(rings.map((r) => r.map(toXY)), z, [0, 0, -1], cc));
  return { ...m.result(), thin: thin.result() };
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
