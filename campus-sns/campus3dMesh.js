// 手で足した構造物（campus3dFeatures.js）を、3Dレイヤー（campus3dLayer.js）で描く三角形にする。
// 位置はメルカトル座標の「キャンパスの中心からの差 × MERC_SCALE」と標高(m)。float32 でも桁が落ちないように中心からの差で持つ
import earcut from "earcut";
import { CAMPUS_CENTER } from "./hooks/useLocationSharing.js";
import { WALL_T, densify, lerpAlong, offsetLine, pointInRing, ringArea, stairSteps, stripDistance, toLngLat, toXY, vertexElevations } from "./campus3dFeatures.js";

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

class Mesh {
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

  // 平面の多角形（[[xy...], 穴...]）を高さ z に張る
  polygon(rings, z, n, c) {
    const flat = [];
    const holes = [];
    rings.forEach((ring, k) => {
      const pts = ring.length > 1 && ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1] ? ring.slice(0, -1) : ring;
      if (k) holes.push(flat.length / 2);
      pts.forEach((p) => flat.push(p[0], p[1]));
    });
    const idx = earcut(flat, holes, 2);
    for (const i of idx) this.vert([flat[i * 2], flat[i * 2 + 1]], z, n, c);
  }

  result() {
    return { pos: new Float32Array(this.pos), nrm: new Float32Array(this.nrm), col: new Float32Array(this.col), count: this.pos.length / 3 };
  }
}

const finite = (a) => a.every(Number.isFinite);
// 中心線から a m と b m ずらした2本の線を、左（進む向きの左）・右の順にして返す（側面の向きをそろえるため）
const band = (pts, a, b) => [offsetLine(pts, Math.max(a, b)), offsetLine(pts, Math.min(a, b))];

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

// 帯の片側（sg = 1 左、-1 右）の外の地面：壁の外の面から 0.4m 先（pts は中心線を細かくした点）
const outerGround = (sl, groundAt, pts, sg) => offsetLine(pts, sg * (sl.hb + 0.4)).map((p) => groundAt(toLngLat(p)));

// 坂・階段の両わきの斜面が 0（垂直）のとき：坂の面とまわりの地面の段差に壁を立てる（両わきと両端）。
// 壁は帯のふちから外へ sl.wt（土台の横幅から決まる厚さ）。上は高いほう（坂の面か外の地面）より少し上
function addSlopeWalls(m, sl, groundAt, c) {
  const { pts, s } = densify(sl.xy, 1);
  const inner = s.map((v) => lerpAlong(sl.prof.s, sl.prof.e, v));
  const low = s.map((v, i) => Math.min(inner[i], lerpAlong(sl.under.s, sl.under.e, v))); // 階段は段の下の地面が一段ぶん低いところがある
  [1, -1].forEach((sg) => {
    const out = outerGround(sl, groundAt, pts, sg);
    if (!finite(out)) return;
    // 壁の下の地面（帯のふちと壁のまん中）まで下ろす：まわりより高い階段の下は元の地面のままで、平地のふちをまたぐとそこが低い
    const foot = [sl.hw, (sl.hw + sl.hb) / 2].map((d) => offsetLine(pts, sg * d).map((p) => groundAt(toLngLat(p))));
    const bot = low.map((v, i) => Math.min(v, out[i], ...foot.map((g) => (Number.isFinite(g[i]) ? g[i] : Infinity))) - 0.3);
    const top = inner.map((v, i) => Math.max(v, out[i]) + 0.05);
    m.prism(...band(pts, sg * sl.hw, sg * sl.hb), bot, top, { top: c, side: c });
  });
  // 両端：土台の端の線（左の壁の外〜右の壁の外）から外へ壁の厚さぶん。段差がほとんどなければ立てない
  const Ls = offsetLine(pts, sl.hb);
  const Rs = offsetLine(pts, -sl.hb);
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
// 坂道・階段がふちを横切るところと、となりの平地のほうが高いところ（そちらが壁を立てる）はあける
function addTerraceWalls(m, tr, { groundAt, terraces, paths }, c) {
  const { pts } = densify([...tr.ring, tr.ring[0]], 1);
  const out = ringArea(tr.ring) > 0 ? -1 : 1; // 左回りなら中は進む向きの左なので、外は右
  const outer = offsetLine(pts, out * (WALL_T + 0.4));
  const ground = pts.map((p, i) => {
    const q = outer[i];
    if (paths.some((sl) => stripDistance(sl.xy, sl.cum, sl.hb + (sl.side > 0 ? WALL_T : 0), p).D <= 0)) return null;
    if (terraces.some((t) => t !== tr && t.elev > tr.elev + 0.05 && pointInRing(q[0], q[1], t.ring))) return null;
    const g = groundAt(toLngLat(q));
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

// 階段：段ごとの箱（段の下の地面より下から段の上まで）を m に、手すりを rm に
function addStairs(m, rm, sl, groundAt, cols, tint) {
  const f = sl.f;
  const c = tint(rgba(cols.stairs));
  const L = offsetLine(sl.xy, sl.hw);
  const R = offsetLine(sl.xy, -sl.hw);
  const at = (line, i, t) => [line[i][0] + (line[i + 1][0] - line[i][0]) * t, line[i][1] + (line[i + 1][1] - line[i][1]) * t];
  stairSteps(sl.prof, f.riser, sl.cum).forEach((st) => {
    const i = st.seg;
    const len = sl.cum[i + 1] - sl.cum[i];
    const t0 = (st.s0 - sl.cum[i]) / len;
    const t1 = (st.s1 - sl.cum[i]) / len;
    const base = Math.min(lerpAlong(sl.under.s, sl.under.e, st.s0), lerpAlong(sl.under.s, sl.under.e, st.s1)) - 0.5; // 段の下の地面より下から
    m.prism([at(L, i, t0), at(L, i, t1)], [at(R, i, t0), at(R, i, t1)], [base, base], [st.top, st.top], { top: c, side: c });
  });
  // 手すり：位置ごとに、足もとの線から 0.85〜0.95m の横の棒と、1.2m おきの支柱（板にすると段が隠れる）。
  // 位置 r は段の幅に対する割合（0 が左の端、1 が右の端）。段の上なら足もとは段の角をなぞる線、土台の上なら壁の上（斜面なら路肩）
  const rails = f.rails || [];
  if (!rails.length) return;
  const rc = tint(rgba(cols.railing));
  const { pts, s } = densify(sl.xy, 0.5);
  const ramp = s.map((v) => lerpAlong(sl.prof.s, sl.prof.e, v));
  const nose = ramp.map((v) => v + sl.rise);
  const feet = {}; // 土台の上の足もと（左右それぞれ）
  const footOnBase = (sg) => {
    if (!feet[sg]) {
      const out = sl.wt > 0 ? outerGround(sl, groundAt, pts, sg) : null;
      feet[sg] = ramp.map((v, i) => (!out ? v - sl.rise - 0.02 : Number.isFinite(out[i]) ? Math.max(v, out[i]) + 0.05 : v));
    }
    return feet[sg];
  };
  const len = sl.cum[sl.cum.length - 1];
  rails.forEach((r) => {
    const onSteps = r >= 0 && r <= 1;
    const lim = (onSteps ? sl.hw : sl.hb) - 0.06;
    const o = Math.min(lim, Math.max(-lim, sl.hw - r * f.width)); // 中心線から左へ（m）
    const foot = onSteps || Math.abs(o) <= sl.hw ? nose : footOnBase(o > 0 ? 1 : -1);
    rm.prism(...band(pts, o + 0.03, o - 0.03), foot.map((v) => v + 0.85), foot.map((v) => v + 0.95), { top: rc, side: rc });
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
      rm.prism(...band(post, o + 0.03, o - 0.03), [z0, z0], [z1, z1], { top: rc, side: rc });
    }
  });
}

/**
 * @param features   構造物（normalizeFeature 済み）
 * @param ctx        { groundAt, slopes（dem.slopes：坂道・階段）, terraces（dem.terraces：平地）, ceilings（通り抜けの天井 [{ rings: lng/lat, z }]）, pal, dark, selectedId, accent }
 * @returns          { pos, nrm, col, count, thin（階段の手すり。同じ形の三角形の並び） }
 */
export function buildMesh(features, { groundAt, slopes = [], terraces = [], ceilings = [], pal, dark, selectedId = null, accent = "#28c868" }) {
  const m = new Mesh();
  const thin = new Mesh(); // 階段の手すり：奥行きを書かずに描く（ルートの線を支柱で途切れさせない）
  const cols = dark ? COLORS.dark : COLORS.light;
  const acc = rgba(accent);
  features.forEach((f) => {
    const tint = f.id === selectedId ? (c) => mix(c, acc, 0.45) : (c) => c;
    if (f.type === "wall") addWall(m, f, groundAt, tint(rgba(cols.wall)));
    else if (f.type === "bridge") addBridge(m, f, groundAt, pal, cols, tint);
  });
  terraces.forEach((tr) => {
    if (tr.side > 0) return;
    const tint = tr.f.id === selectedId ? (c) => mix(c, acc, 0.45) : (c) => c;
    addTerraceWalls(m, tr, { groundAt, terraces, paths: slopes }, tint(rgba(cols.wall)));
  });
  slopes.forEach((sl) => {
    const tint = sl.f.id === selectedId ? (c) => mix(c, acc, 0.45) : (c) => c;
    if (sl.f.type === "stairs") addStairs(m, thin, sl, groundAt, cols, tint);
    if (sl.f.side === 0) addSlopeWalls(m, sl, groundAt, tint(rgba(cols.wall)));
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
