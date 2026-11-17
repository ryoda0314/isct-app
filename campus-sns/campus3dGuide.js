// 歩いて見るときのスマホのナビ（2026-11-17、ユーザー「メタ的にこの世界の中でスマホを見て、ナビ機能を使うとこの世界の道に道案内表示が
// 出るようにしてほしい」）。経路はアプリのキャンパスナビと同じ（hooks/useNavigation の computeRoute。出発は "__gps__"＝この世界で
// 歩く人のいる所）。ここでは、その経路を世界の道に描く形と、スマホに出す曲がり角を作る：
// ・帯：角を丸めて GUIDE.step m ごとに区切り、歩く人と同じ足場（walkWorld の floorBelow）を出発の足もとからたどって高さを決める
//   （段は GUIDE.climb m まで上る。橋の下は地面、階段・橋の上はその床）。足場の上 GUIDE.lift m に幅 GUIDE.width m の帯を置き、
//   進む向きへ流れる矢じるし（シェーダーで時刻から）。歩く人より後ろは描かない
// ・目的地：光の柱と、地面で広がる輪
// ・曲がり角：経路の向きが 35° 以上変わる所（前後 6m の向きで見る。8m 以内の折れはまとめる）と、道の網の階段の辺の入口
// 描く座標は campus3dLayer と同じ（worldOf。標高はそのまま m）。帯は奥行きを見るだけで書かない（建物の陰には隠れる）
import { toXY } from "./campus3dFeatures.js";
import { worldOf } from "./campus3dMesh.js";
import { compile, matrixFor } from "./campus3dLayer.js";

export const GUIDE_LAYER_ID = "cb-guide";
export const GUIDE = {
  step: 0.5, // 帯を区切る間隔（m）
  width: 1.3, // 帯の幅（m）
  lift: 0.1, // 足場からの高さ（m。地形の網の粗さで地面に沈まないように）
  climb: 1.2, // 高さをたどるとき、1 区切りで上ってよい高さ（m。平地のふち・段。上の階の床までは上らない）
  radius: 2.5, // 角を丸める半径（m）
  spacing: 3.2, // 矢じるしの間隔（m）
  speed: 1.4, // 矢じるしの流れる速さ（m/秒）
  beam: 26, // 目的地の光の柱の高さ（m）
};
const TURN_MIN = 35; // これより小さい向きの変わりは、まっすぐ
const LOOK = 6; // 曲がり角の向きを見る前後の長さ（m）
const MERGE = 8; // これより近い折れは 1 つの曲がり角

const DEG = Math.PI / 180;
const angle = (a) => ((a % 360) + 360) % 360;
const angDiff = (to, from) => ((((to - from) % 360) + 540) % 360) - 180;
const headingOf = (a, b) => angle(Math.atan2(b[0] - a[0], b[1] - a[1]) / DEG);

// 経路 [{lat, lng}] を平面 m の点に（続けて同じ所の点は 1 つに。辺の印 marks[i]（点 i → i+1）は、まとめた辺のどれかにあれば残す）
function routeXY(latlngs, marks = []) {
  const xy = [];
  const mk = [];
  latlngs.forEach((p, i) => {
    const q = toXY([p.lng, p.lat]);
    const last = xy[xy.length - 1];
    if (last && Math.hypot(q[0] - last[0], q[1] - last[1]) < 0.05) {
      if (marks[i] && mk.length) mk[mk.length - 1] = true;
      return;
    }
    if (xy.length) mk.push(!!marks[i - 1]);
    xy.push(q);
  });
  return { xy, mk };
}

// 折れ線の長さの累積と、距離 s の点
function polyline(xy) {
  const cum = [0];
  for (let i = 1; i < xy.length; i++) cum.push(cum[i - 1] + Math.hypot(xy[i][0] - xy[i - 1][0], xy[i][1] - xy[i - 1][1]));
  const len = cum[cum.length - 1];
  const at = (s) => {
    const v = Math.min(len, Math.max(0, s));
    let i = 1;
    while (i < xy.length - 1 && cum[i] < v) i++;
    const L = cum[i] - cum[i - 1] || 1;
    const t = (v - cum[i - 1]) / L;
    return [xy[i - 1][0] + (xy[i][0] - xy[i - 1][0]) * t, xy[i - 1][1] + (xy[i][1] - xy[i - 1][1]) * t];
  };
  return { cum, len, at };
}

// 角を半径 R で丸める（2 次ベジェで近く。となりの辺の 45% までしか使わない＝となりの角の丸めと重ならない）
function fillet(xy, R) {
  if (xy.length < 3) return xy.slice();
  const out = [xy[0]];
  for (let i = 1; i < xy.length - 1; i++) {
    const a = xy[i - 1];
    const b = xy[i];
    const c = xy[i + 1];
    const l1 = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const l2 = Math.hypot(c[0] - b[0], c[1] - b[1]);
    const u1 = [(b[0] - a[0]) / l1, (b[1] - a[1]) / l1];
    const u2 = [(c[0] - b[0]) / l2, (c[1] - b[1]) / l2];
    const th = Math.acos(Math.max(-1, Math.min(1, u1[0] * u2[0] + u1[1] * u2[1])));
    if (th < 0.05) {
      out.push(b);
      continue;
    }
    const d = Math.min(R * Math.tan(Math.min(th, 3.0) / 2), l1 * 0.45, l2 * 0.45);
    const p = [b[0] - u1[0] * d, b[1] - u1[1] * d];
    const q = [b[0] + u2[0] * d, b[1] + u2[1] * d];
    const n = Math.max(2, Math.ceil(th / DEG / 10));
    for (let k = 0; k <= n; k++) {
      const t = k / n;
      const m = 1 - t;
      out.push([m * m * p[0] + 2 * m * t * b[0] + t * t * q[0], m * m * p[1] + 2 * m * t * b[1] + t * t * q[1]]);
    }
  }
  out.push(xy[xy.length - 1]);
  return out;
}

// step m ごとの点 [x, y, s]（終わりの点も）
function resample(xy, step) {
  const pts = [[xy[0][0], xy[0][1], 0]];
  let s0 = 0;
  let next = step;
  for (let i = 1; i < xy.length; i++) {
    const a = xy[i - 1];
    const b = xy[i];
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (L < 1e-9) continue;
    while (next < s0 + L) {
      const t = (next - s0) / L;
      pts.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, next]);
      next += step;
    }
    s0 += L;
  }
  const end = xy[xy.length - 1];
  if (s0 - pts[pts.length - 1][2] > 0.05) pts.push([end[0], end[1], s0]);
  else pts[pts.length - 1] = [end[0], end[1], s0];
  return { pts, len: s0 };
}

/**
 * 経路から、世界の道に描く案内を作る。
 * @param latlngs  経路 [{lat, lng}]（computeRoute の coords。はじめの点は出発＝歩く人の所）
 * @param world    walkWorld（floorBelow で足場の高さ。なければ z0 のまま）
 * @param z0       出発の足の高さ（標高 m）
 * @param stairs   辺ごとの階段の印（stairs[i]：点 i → i+1 が道の網の階段）
 * @returns { pts [[x, y, s, z]...], len, at(s) → [x, y, z], nearest(x, y, hint) → { s, d }, man [曲がり角], end [x, y, z] } か null
 */
export function buildGuide(latlngs, world, { z0 = 0, stairs = [] } = {}) {
  if (!latlngs || latlngs.length < 2) return null;
  const { xy, mk } = routeXY(latlngs, stairs);
  if (xy.length < 2) return null;
  const { pts, len } = resample(fillet(xy, GUIDE.radius), GUIDE.step);
  // 高さ：出発の足もとから、歩く人と同じ足場（surfacesAt：地面・平地・階の床・橋・階段・立体の上）のうち、前の点の高さにいちばん
  // 近いものをたどる（橋の下は地面、橋の上は床、建物の中は同じ階。経路が擁壁・平地のふちを横切るところは、上の面へ移る。
  // 上れる高さで切ると、網の階段の辺が実物の階段とずれたところで下に残って、その先がずっと地面の下になった）
  let z = z0;
  const raw = pts.map(([x, y]) => {
    const list = world?.surfacesAt?.(x, y);
    if (list?.length) {
      let best = null;
      for (const c of list) {
        if (!Number.isFinite(c.z)) continue;
        const d = Math.abs(c.z - z);
        if (!best || d < best.d - 1e-6 || (Math.abs(d - best.d) <= 1e-6 && c.z < best.z)) best = { z: c.z, d };
      }
      if (best) z = best.z;
    } else {
      const f = world?.floorBelow?.(x, y, z + GUIDE.climb);
      if (f && Number.isFinite(f.z)) z = f.z;
    }
    return z;
  });
  // 段のぎざぎざをならす（前後 1m。0.7m より大きい段＝平地のふち・階段の口の段差はならさない）
  const n = pts.length;
  pts.forEach((p, i) => {
    let sum = 0;
    let k = 0;
    for (let j = Math.max(0, i - 2); j <= Math.min(n - 1, i + 2); j++) {
      if (Math.abs(raw[j] - raw[i]) > 0.7) continue;
      sum += raw[j];
      k++;
    }
    p.push(sum / k);
  });
  const step = GUIDE.step;
  const at = (s) => {
    const v = Math.min(len, Math.max(0, s));
    let i = Math.min(n - 2, Math.floor(v / step));
    while (i < n - 2 && pts[i + 1][2] < v) i++;
    while (i > 0 && pts[i][2] > v) i--;
    const a = pts[i];
    const b = pts[i + 1];
    const t = b[2] > a[2] ? Math.min(1, Math.max(0, (v - a[2]) / (b[2] - a[2]))) : 0;
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[3] + (b[3] - a[3]) * t];
  };
  // 点 (x, y) にいちばん近い帯の上の距離 s と、そこまでの距離 d。hint（前の s）があれば、まずその前後（-30〜+80m）から
  // （行って戻る経路で、反対向きの所へ飛ばない）
  const scan = (x, y, i0, i1) => {
    let best = { s: 0, d: Infinity };
    for (let i = Math.max(1, i0); i <= Math.min(n - 1, i1); i++) {
      const a = pts[i - 1];
      const b = pts[i];
      const dx = b[0] - a[0];
      const dy = b[1] - a[1];
      const L2 = dx * dx + dy * dy || 1e-12;
      const t = Math.min(1, Math.max(0, ((x - a[0]) * dx + (y - a[1]) * dy) / L2));
      const d = Math.hypot(x - a[0] - dx * t, y - a[1] - dy * t);
      if (d < best.d) best = { s: a[2] + (b[2] - a[2]) * t, d };
    }
    return best;
  };
  const nearest = (x, y, hint = null) => {
    if (hint != null && Number.isFinite(hint)) {
      const r = scan(x, y, Math.floor((hint - 30) / step), Math.ceil((hint + 80) / step));
      if (r.d < 12) return r;
    }
    return scan(x, y, 1, n - 1);
  };
  // 曲がり角（もとの経路の点で見る。8m 以内の折れはまとめて、前後 6m の向きの差）と階段の入口。帯の上の距離 s で並べる
  const P = polyline(xy);
  const man = [];
  let hint = 0;
  const onGuide = (sr) => {
    const [x, y] = P.at(sr);
    const r = nearest(x, y, hint);
    hint = r.s;
    return r.s;
  };
  let i = 1;
  while (i < xy.length - 1) {
    let j = i;
    while (j + 1 < xy.length - 1 && P.cum[j + 1] - P.cum[j] < MERGE) j++;
    const s0 = P.cum[i];
    const s1 = P.cum[j];
    const tin = headingOf(P.at(s0 - LOOK), P.at(s0));
    const tout = headingOf(P.at(s1), P.at(s1 + LOOK));
    const turn = angDiff(tout, tin);
    const a = Math.abs(turn);
    if (a >= TURN_MIN && s0 > 1.5) {
      const dir = a >= 145 ? "uturn" : turn > 0 ? (a < 60 ? "slightRight" : "right") : a < 60 ? "slightLeft" : "left";
      man.push({ kind: "turn", dir, s: onGuide((s0 + s1) / 2) });
    }
    i = j + 1;
  }
  // 階段：印のついた辺が続くところの入口。上るか下りるかは帯の高さで
  for (let k = 0; k < mk.length; k++) {
    if (!mk[k] || (k > 0 && mk[k - 1])) continue;
    let e = k;
    while (e + 1 < mk.length && mk[e + 1]) e++;
    hint = 0;
    const sa = onGuide(P.cum[k]);
    const sb = onGuide(P.cum[e + 1]);
    const dz = at(sb)[2] - at(sa)[2];
    man.push({ kind: "stairs", up: dz > 0.3 ? true : dz < -0.3 ? false : null, s: sa });
  }
  man.sort((p, q) => p.s - q.s);
  return { pts, len, at, nearest, man, end: at(len) };
}

// 歩く人のいる所 s から見た、次の案内（曲がり角・階段。なければ目的地）と、そこまでの距離（m）。すぐあと（15m 以内）に
// 続く案内があれば then に（「左へ → その先 階段を上る」）
export function nextManeuver(G, s) {
  const i = G.man.findIndex((q) => q.s > s + 1.5);
  if (i < 0) return { kind: "arrive", dist: Math.max(0, G.len - s) };
  const m = G.man[i];
  const n = G.man[i + 1];
  const then = n && n.s - m.s < 15 ? n : !n && G.len - m.s < 15 ? { kind: "arrive" } : null;
  return { ...m, dist: Math.max(0, m.s - s), then };
}

// 帯の三角形（描く座標の位置 pos と、[横（-1 左〜1 右）, 帯の上の距離 s] の sv）
export function guideMesh(G) {
  const P = G.pts;
  const n = P.length;
  if (n < 2) return null;
  const hw = GUIDE.width / 2;
  const L = [];
  const R = [];
  for (let i = 0; i < n; i++) {
    const a = P[Math.max(0, i - 1)];
    const b = P[Math.min(n - 1, i + 1)];
    let tx = b[0] - a[0];
    let ty = b[1] - a[1];
    const l = Math.hypot(tx, ty) || 1;
    tx /= l;
    ty /= l;
    const z = P[i][3] + GUIDE.lift;
    L.push([...worldOf([P[i][0] - ty * hw, P[i][1] + tx * hw]), z]);
    R.push([...worldOf([P[i][0] + ty * hw, P[i][1] - tx * hw]), z]);
  }
  const pos = new Float32Array((n - 1) * 18);
  const sv = new Float32Array((n - 1) * 12);
  let k = 0;
  let m = 0;
  const put = (p, side, s) => {
    pos[k++] = p[0];
    pos[k++] = p[1];
    pos[k++] = p[2];
    sv[m++] = side;
    sv[m++] = s;
  };
  for (let i = 0; i < n - 1; i++) {
    const s0 = P[i][2];
    const s1 = P[i + 1][2];
    put(L[i], -1, s0);
    put(R[i], 1, s0);
    put(L[i + 1], -1, s1);
    put(L[i + 1], -1, s1);
    put(R[i], 1, s0);
    put(R[i + 1], 1, s1);
  }
  return { pos, sv, count: (n - 1) * 6 };
}

// 目的地の光の柱（円筒の側面。sv.y は下 0〜上 1）と地面の輪（円板。sv.x は中心 0〜ふち 1）
function beamMesh([x, y, z]) {
  const SEG = 18;
  const r = 0.55;
  const pos = [];
  const sv = [];
  for (let k = 0; k < SEG; k++) {
    const a0 = (k / SEG) * Math.PI * 2;
    const a1 = ((k + 1) / SEG) * Math.PI * 2;
    const p0 = worldOf([x + Math.cos(a0) * r, y + Math.sin(a0) * r]);
    const p1 = worldOf([x + Math.cos(a1) * r, y + Math.sin(a1) * r]);
    const z0 = z + 0.05;
    const z1 = z + GUIDE.beam;
    [[p0, z0, 0], [p1, z0, 0], [p1, z1, 1], [p0, z0, 0], [p1, z1, 1], [p0, z1, 1]].forEach(([p, zz, h]) => {
      pos.push(p[0], p[1], zz);
      sv.push(0, h);
    });
  }
  return { pos: new Float32Array(pos), sv: new Float32Array(sv), count: pos.length / 3 };
}
function ringMesh([x, y, z]) {
  const SEG = 40;
  const r = 2.2;
  const c = worldOf([x, y]);
  const pos = [];
  const sv = [];
  for (let k = 0; k < SEG; k++) {
    const a0 = (k / SEG) * Math.PI * 2;
    const a1 = ((k + 1) / SEG) * Math.PI * 2;
    const p0 = worldOf([x + Math.cos(a0) * r, y + Math.sin(a0) * r]);
    const p1 = worldOf([x + Math.cos(a1) * r, y + Math.sin(a1) * r]);
    const zz = z + GUIDE.lift + 0.01;
    pos.push(c[0], c[1], zz, p0[0], p0[1], zz, p1[0], p1[1], zz);
    sv.push(0, 0, 1, 0, 1, 0);
  }
  return { pos: new Float32Array(pos), sv: new Float32Array(sv), count: pos.length / 3 };
}

const VS_GUIDE = `
attribute vec3 a_pos;
attribute vec2 a_sv;
uniform mat4 u_matrix;
uniform float u_ref;
varying vec2 v_sv;
void main() {
  v_sv = vec2(a_sv.x, a_sv.y - u_ref);
  gl_Position = u_matrix * vec4(a_pos, 1.0);
}`;
// u_mode 0：帯（流れる矢じるし。先が細い「く」の字を進む向きへ）、1：光の柱（上ほど薄く）、2：地面の輪（広がる輪とふち）
const FS_GUIDE = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform float u_mode;
uniform float u_from;
uniform float u_shift;
uniform float u_pulse;
uniform vec3 u_col;
varying vec2 v_sv;
void main() {
  if (u_mode < 0.5) {
    // 帯：うすい青の地に、こい青の矢じるし（白い路面でもアスファルトでも見えるように）と、両のふちの白い細い線
    float s = v_sv.y;
    if (s < u_from) discard;
    float side = abs(v_sv.x);
    float edge = 1.0 - smoothstep(0.9, 1.0, side);
    float ph = fract((s + side * 0.85 - u_shift) / ${GUIDE.spacing.toFixed(2)});
    float chev = smoothstep(0.0, 0.04, ph) * (1.0 - smoothstep(0.24, 0.3, ph)) * (1.0 - smoothstep(0.78, 0.86, side));
    float rim = smoothstep(0.8, 0.86, side) * (1.0 - smoothstep(0.92, 0.98, side));
    vec3 c = mix(mix(u_col, vec3(1.0), 0.15), u_col * 0.82, chev);
    c = mix(c, vec3(1.0), rim * 0.85);
    float a = max(max(0.3, 0.92 * chev), 0.8 * rim) * edge * smoothstep(u_from, u_from + 2.0, s);
    gl_FragColor = vec4(c * a, a);
  } else if (u_mode < 1.5) {
    // 光の柱：下ほどこく、ゆっくり明るさがゆれる
    float h = v_sv.y;
    float a = (0.62 + 0.12 * sin(u_pulse * 6.2832)) * pow(1.0 - h, 1.2);
    gl_FragColor = vec4(mix(u_col, vec3(1.0), 0.25) * a, a);
  } else {
    float r = v_sv.x;
    float ring = smoothstep(u_pulse - 0.18, u_pulse, r) * (1.0 - smoothstep(u_pulse, u_pulse + 0.05, r)) * (1.0 - u_pulse);
    float disk = 0.2 * (1.0 - smoothstep(0.9, 1.0, r));
    float rim = smoothstep(0.86, 0.92, r) * (1.0 - smoothstep(0.96, 1.0, r)) * 0.7;
    float a = clamp(ring * 0.9 + disk + rim, 0.0, 1.0);
    gl_FragColor = vec4(mix(u_col, vec3(1.0), 0.25) * a, a);
  }
}`;

const rgb = (hex) => {
  const n = parseInt(String(hex || "#1a8ef0").slice(1, 7), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
};

/**
 * 案内のレイヤー（MapLibre の独自レイヤー）。setGuide(G)（buildGuide の結果か null）で形を、setProgress(s)（歩く人のいる所）で
 * 描きはじめを変える。onProject({ x, y, front }) は目的地の柱の上（足場 +3m）の画面の位置（canvas の CSS px）を毎フレーム知らせる
 */
export function createGuideLayer({ exaggeration = 1, color = "#1a8ef0", onProject = null } = {}) {
  let map = null;
  let gl = null;
  let prog = null;
  const bufs = {};
  const parts = { ribbon: null, ring: null, beam: null };
  const dirty = new Set();
  let along = 0;
  let end = null;
  const col = rgb(color);
  const upload = (key) => {
    const d = parts[key];
    if (!d) return;
    for (const k of ["pos", "sv"]) {
      const id = key + k;
      bufs[id] ||= gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, bufs[id]);
      gl.bufferData(gl.ARRAY_BUFFER, d[k], gl.STATIC_DRAW);
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
  };
  const draw = (key) => {
    const d = parts[key];
    if (!d?.count) return;
    const on = [];
    for (const [k, name, size] of [["pos", "a_pos", 3], ["sv", "a_sv", 2]]) {
      const a = prog.att(name);
      if (a < 0) continue;
      gl.bindBuffer(gl.ARRAY_BUFFER, bufs[key + k]);
      gl.enableVertexAttribArray(a);
      gl.vertexAttribPointer(a, size, gl.FLOAT, false, 0, 0);
      on.push(a);
    }
    gl.drawArrays(gl.TRIANGLES, 0, d.count);
    on.forEach((a) => gl.disableVertexAttribArray(a));
  };
  return {
    id: GUIDE_LAYER_ID,
    type: "custom",
    renderingMode: "3d",
    setGuide(G) {
      parts.ribbon = G ? guideMesh(G) : null;
      parts.ring = G ? ringMesh(G.end) : null;
      parts.beam = G ? beamMesh(G.end) : null;
      end = G ? G.end : null;
      along = 0;
      ["ribbon", "ring", "beam"].forEach((k) => dirty.add(k));
      map?.triggerRepaint();
    },
    setProgress(s) {
      along = Number.isFinite(s) ? s : 0;
    },
    // 着いたあと：帯は消して、柱と輪だけ（hideRibbon）
    hideRibbon() {
      parts.ribbon = null;
      map?.triggerRepaint();
    },
    onAdd(m, g) {
      map = m;
      gl = g;
      prog = compile(gl, VS_GUIDE, FS_GUIDE);
    },
    onRemove() {
      if (gl) {
        Object.values(bufs).forEach((b) => gl.deleteBuffer(b));
        if (prog) gl.deleteProgram(prog.p);
      }
      map = null;
    },
    render(g, args) {
      if (!parts.ribbon && !parts.beam) return;
      for (const k of dirty) upload(k);
      dirty.clear();
      const M = matrixFor(args.modelViewProjectionMatrix, map.transform.worldSize, exaggeration);
      const now = performance.now() / 1000;
      const ref = Math.floor(Math.max(0, along) / GUIDE.spacing) * GUIDE.spacing; // 矢じるしの模様の周期の倍数（float の桁を守る）
      gl.useProgram(prog.p);
      gl.uniformMatrix4fv(prog.loc("u_matrix"), false, M);
      gl.uniform3fv(prog.loc("u_col"), col);
      gl.uniform1f(prog.loc("u_shift"), (now * GUIDE.speed) % GUIDE.spacing);
      gl.uniform1f(prog.loc("u_pulse"), (now % 1.8) / 1.8);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.enable(gl.DEPTH_TEST);
      gl.depthFunc(gl.LEQUAL);
      gl.depthMask(false);
      if (parts.ribbon) {
        gl.uniform1f(prog.loc("u_ref"), ref);
        gl.uniform1f(prog.loc("u_from"), along - 0.5 - ref);
        gl.uniform1f(prog.loc("u_mode"), 0);
        draw("ribbon");
      }
      gl.uniform1f(prog.loc("u_ref"), 0);
      gl.uniform1f(prog.loc("u_mode"), 2);
      draw("ring");
      gl.uniform1f(prog.loc("u_mode"), 1);
      draw("beam");
      gl.depthMask(true);
      gl.bindBuffer(gl.ARRAY_BUFFER, null);
      // 目的地の名前の札：柱の上（足場 +3m）の画面の位置
      if (onProject && end) {
        const [wx, wy] = worldOf([end[0], end[1]]);
        const v = [wx, wy, end[2] + 3, 1];
        const c = [0, 1, 2, 3].map((r) => M[r] * v[0] + M[4 + r] * v[1] + M[8 + r] * v[2] + M[12 + r] * v[3]);
        const cv = map.getCanvas();
        const front = c[3] > 0.05;
        onProject({ x: front ? ((c[0] / c[3] + 1) / 2) * cv.clientWidth : 0, y: front ? ((1 - c[1] / c[3]) / 2) * cv.clientHeight : 0, front });
      }
    },
  };
}
