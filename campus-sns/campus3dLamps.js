// 夜の街灯。道路・通路の脇に柱を立て、灯具と光のにじみ（campus3dLayer.js の createLightsLayer）と、道に落ちる光の輪
// （地形に貼る画像。lampLightCanvas を CampusMap3D が canvas のソースにして重ねる）を描く。
// 置き場所：車道の外（路肩・歩道）に、道の種類ごとの間隔で。広い道は左右に互い違い、細い道は片側。手で描いた道路は歩道の縁石ぎわ。
// キャンパスの通路は、建物の外のところだけ通路の脇に。建物・線路・ホーム・水・運動場・ほかの道の上、手で足した建物・橋・坂道・
// 階段・壁・通り抜け・平地のふち・看板には立てない。地図の端（背景へ溶かす帯）では端に近いほど薄く、ほとんど見えないところには立てない
import { WIDTH_M, walkSegments } from "./campusBasemap.js";
import { pointInRing, toLngLat, toXY } from "./campus3dFeatures.js";
import { GlowMesh, Mesh, worldOf } from "./campus3dMesh.js";

// 道の種類ごと：間隔 gap、灯具の高さ h、腕の長さ arm（道の上へ張り出す）、光の輪の半径 r、左右に互い違い both、
// 光の輪の濃さ alpha と色 rgb、灯具のにじみの半径 glow（m）
export const LAMP_KINDS = {
  major: { gap: 26, h: 9, arm: 1.8, r: 14, both: true, alpha: 0.6, rgb: [255, 212, 156], glow: 2.2 },
  mid: { gap: 28, h: 8, arm: 1.4, r: 12, both: true, alpha: 0.58, rgb: [255, 216, 164], glow: 2 },
  minor: { gap: 32, h: 6.5, arm: 0.9, r: 10, both: false, alpha: 0.52, rgb: [255, 228, 192], glow: 1.8 },
  ped: { gap: 22, h: 4.5, arm: 0, r: 7.5, both: false, alpha: 0.46, rgb: [255, 226, 186], glow: 1.4 },
  walk: { gap: 20, h: 4, arm: 0, r: 7, both: false, alpha: 0.44, rgb: [255, 226, 186], glow: 1.3 },
};
const STEP = 2; // 置ける場所を探す間隔（m）
const SET_BACK = 0.45; // 柱は道のふちから外へ
const EDGE_FADE = 160; // 地図の端の帯の幅（campusMap3d.js の edgeFC と同じ）
const POLE = 0.24; // 柱の太さ
const POLE_COL = { top: [0.44, 0.46, 0.49, 1], side: [0.38, 0.4, 0.43, 1] };
const LAMP_GLOW = [1, 0.93, 0.8]; // 灯具の光の色（夜）
const LAMP_COL = { top: [...LAMP_GLOW, 0.5], side: [...LAMP_GLOW, 0.5] }; // アルファ 0.5 は「灯具」の印（昼は灰色、夜はこの色）

const ll2xy = ([lat, lng]) => toXY([lng, lat]); // 地図データの点は [緯度, 経度]

// 手で描いた道路の種類（車道の幅から）
const roadKind = (w) => (w >= 10 ? "major" : w >= 6.5 ? "mid" : "minor");

// 升目の索引。箱 [x0, y0, x1, y1] ごとに入れて、点のまわり r m の升目の中身を調べる
class Grid {
  constructor(cell) {
    this.cell = cell;
    this.m = new Map();
  }

  add(box, item) {
    const c = this.cell;
    for (let i = Math.floor(box[0] / c); i <= Math.floor(box[2] / c); i++) {
      for (let j = Math.floor(box[1] / c); j <= Math.floor(box[3] / c); j++) {
        const k = `${i},${j}`;
        const a = this.m.get(k);
        if (a) a.push(item);
        else this.m.set(k, [item]);
      }
    }
  }

  // (x, y) の r m 以内の升目に、fn が true を返すものがあるか
  some(x, y, r, fn) {
    const c = this.cell;
    for (let i = Math.floor((x - r) / c); i <= Math.floor((x + r) / c); i++) {
      for (let j = Math.floor((y - r) / c); j <= Math.floor((y + r) / c); j++) {
        const a = this.m.get(`${i},${j}`);
        if (a && a.some(fn)) return true;
      }
    }
    return false;
  }
}

const boxOf = (pts, pad = 0) => {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of pts) {
    x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
  }
  return [x0 - pad, y0 - pad, x1 + pad, y1 + pad];
};
const segDist = (x, y, a, b) => {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const L2 = dx * dx + dy * dy || 1e-9;
  const t = Math.min(1, Math.max(0, ((x - a[0]) * dx + (y - a[1]) * dy) / L2));
  return Math.hypot(x - a[0] - dx * t, y - a[1] - dy * t);
};

/**
 * 街灯を置く。data は BASEMAP、features は手で足した構造物、R は regionOf(data)、walk は通路の線（既定は経路の網）
 * @returns [{ x, y（柱）, hx, hy（灯具）, cx, cy（その道の中心線の上の点）, dir（道の向き）, k, h, r, alpha, rgb, glow, arm,
 *   fade（地図の端で薄くする割合） }]
 */
export function streetLamps(data, features = [], R, { walk = walkSegments() } = {}) {
  // 柱を立てない場所：広さのあるもの（建物・ホーム・水・運動場）と、帯（道・線路・手で足した構造物）
  const areas = new Grid(60);
  const addArea = (ring, indoor) => {
    if (ring.length < 3) return;
    const box = boxOf(ring);
    areas.add(box, { ring, box, indoor });
  };
  data.buildings.forEach((b) => addArea(b.p.map(ll2xy), true));
  (data.platforms || []).forEach((p) => addArea(p.map(ll2xy), false));
  (data.water || []).forEach((w) => addArea(w.map(ll2xy), false));
  (data.green || []).filter((g) => g.k === "pitch" || g.k === "track").forEach((g) => addArea(g.p.map(ll2xy), false));
  // 手で描いた道路の歩道まで（ここは道路の街灯を縁石ぎわに置くので、地図の道の街灯は置かない）
  const userRoads = new Grid(40);
  for (const f of features) {
    if (f.type !== "road" || !(f.coords?.length > 1)) continue;
    const pts = f.coords.map(toXY);
    const reach = f.width / 2 + Math.max(...(f.walk || [0, 0])) + 2;
    for (let i = 1; i < pts.length; i++) userRoads.add(boxOf([pts[i - 1], pts[i]], reach), { a: pts[i - 1], b: pts[i], half: reach });
  }
  const nearUserRoad = (x, y) => userRoads.some(x, y, 0, (o) => segDist(x, y, o.a, o.b) < o.half);
  const bands = new Grid(40);
  const addBand = (pts, half) => {
    for (let i = 1; i < pts.length; i++) bands.add(boxOf([pts[i - 1], pts[i]], half), { a: pts[i - 1], b: pts[i], half });
  };
  // 地図の道・通路の帯。手で描いた道路の下になるところは外す（地図の道の幅は手で描いた道路とちがうので、縁石ぎわの柱をふさがないように）
  const addMapBand = (pts, half) => {
    for (let i = 1; i < pts.length; i++) {
      const [a, b] = [pts[i - 1], pts[i]];
      const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 8));
      for (let k = 0; k < n; k++) {
        const p = [a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n];
        const q = [a[0] + ((b[0] - a[0]) * (k + 1)) / n, a[1] + ((b[1] - a[1]) * (k + 1)) / n];
        if (!nearUserRoad((p[0] + q[0]) / 2, (p[1] + q[1]) / 2)) addBand([p, q], half);
      }
    }
  };
  for (const f of features) {
    const pts = (f.coords || []).map(toXY);
    if (f.type === "building") addArea(pts, true);
    else if (f.type === "road" && pts.length > 1) addBand(pts, f.width / 2 + 0.2);
    else if (f.type === "bridge" || f.type === "passage") addBand(pts, f.width / 2 + 0.8);
    else if (f.type === "slope" || f.type === "stairs") addBand(pts, (f.base || f.width) / 2 + 0.8);
    else if (f.type === "wall") addBand(pts, (f.thickness || 0.3) / 2 + 0.5);
    else if (f.type === "terrace" && pts.length > 2) addBand([...pts, pts[0]], 1);
    else if (f.type === "tree" && pts.length) addBand([pts[0], pts[0]], 1.5); // 幹のそばには立てない
    else if (f.type === "signal" && pts.length) addBand([pts[0], pts[0]], 1.5); // 信号機の柱のそばにも
    else if (f.type === "sign" && pts.length) addBand([pts[0], pts[0]], f.width / 2 + 1); // 看板のそばにも
  }
  ["major", "mid", "minor", "ped"].forEach((k) => (data.streets[k] || []).forEach((l) => addMapBand(l.map(ll2xy), WIDTH_M[k] / 2 + 0.3)));
  walk.forEach((l) => addMapBand(l.map(ll2xy), WIDTH_M.walk / 2));
  (data.rail?.surface || []).forEach((l) => addBand(l.map(ll2xy), 3));

  const inArea = (x, y, indoorOnly) =>
    areas.some(x, y, 0, (o) => (!indoorOnly || o.indoor) && x >= o.box[0] && x <= o.box[2] && y >= o.box[1] && y <= o.box[3] && pointInRing(x, y, o.ring));
  const onBand = (x, y) => bands.some(x, y, 0, (o) => segDist(x, y, o.a, o.b) < o.half);

  // 地図の端の帯で薄くする（端からの距離 → campusMap3d.js の edgeFC と同じ濃さの、残る割合）
  const [xw, ys] = toXY([R.w, R.s]);
  const [xe, yn] = toXY([R.e, R.n]);
  const fadeAt = (x, y) => {
    const d = Math.min(x - xw, xe - x, y - ys, yn - y);
    return 1 - Math.max(0, 1 - d / EDGE_FADE) ** 1.6;
  };

  // 道の種類の順（手で描いた道路 → 広い道 → 細い道 → 通路）に、間隔をあけて置いていく
  const lines = [];
  for (const f of features) if (f.type === "road" && f.coords?.length > 1) lines.push({ kind: roadKind(f.width), pts: f.coords.map(toXY), road: f });
  ["major", "mid", "minor", "ped"].forEach((k) => (data.streets[k] || []).forEach((l) => lines.push({ kind: k, pts: l.map(ll2xy) })));
  walk.forEach((l) => lines.push({ kind: "walk", pts: l.map(ll2xy) }));

  const placed = new Grid(40);
  const lamps = [];
  for (const { kind, pts, road } of lines) {
    const K = LAMP_KINDS[kind];
    // 柱を道の中心線から左（sg 1）・右（-1）へどれだけ離すか
    const offset = (sg) => {
      if (!road) return WIDTH_M[kind] / 2 + SET_BACK;
      const w = (road.walk || [0, 0])[sg > 0 ? 0 : 1] || 0;
      return road.width / 2 + (w >= 1.2 ? 0.5 : Math.max(0.25, w / 2));
    };
    // 片側だけのときは、手で描いた道路なら歩道の広い側、ほかは左
    const pref = road && (road.walk || [0, 0])[1] > (road.walk || [0, 0])[0] ? -1 : 1;
    let alt = 1;
    let carry = 0; // 前の辺から持ち越した、次に調べるまでの距離
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1];
      const b = pts[i];
      const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (L < 1e-6) continue;
      const ux = (b[0] - a[0]) / L;
      const uy = (b[1] - a[1]) / L;
      let t = carry;
      for (; t <= L; t += STEP) {
        const cx = a[0] + ux * t;
        const cy = a[1] + uy * t;
        if (inArea(cx, cy, true)) continue; // 建物の中を通る通路
        if (!road && nearUserRoad(cx, cy)) continue; // 手で描いた道路が置く
        if (placed.some(cx, cy, K.gap, (o) => Math.hypot(o.cx - cx, o.cy - cy) < K.gap)) continue;
        const fade = fadeAt(cx, cy);
        if (fade < 0.2) continue;
        const sides = K.both ? [alt, -alt] : [pref, -pref];
        for (const sg of sides) {
          const off = offset(sg);
          const x = cx - uy * sg * off;
          const y = cy + ux * sg * off;
          if (inArea(x, y, false) || onBand(x, y)) continue;
          const arm = Math.min(K.arm, Math.max(0, off - 0.6));
          lamps.push({
            x, y, hx: x + uy * sg * arm, hy: y - ux * sg * arm, cx, cy, dir: [ux, uy], k: kind,
            h: K.h, r: K.r, alpha: K.alpha, rgb: K.rgb, glow: K.glow, arm, fade,
          });
          placed.add([cx, cy, cx, cy], { cx, cy });
          alt = -sg;
          break;
        }
      }
      carry = t - L;
    }
  }
  return lamps;
}

// 街灯の柱の範囲 [西, 南, 東, 北]（標高を読んでおく）
export function lampBounds(lamps) {
  if (!lamps.length) return null;
  const [x0, y0, x1, y1] = boxOf(lamps.map((l) => [l.x, l.y]), 2);
  const [w, s] = toLngLat([x0, y0]);
  const [e, n] = toLngLat([x1, y1]);
  return [w, s, e, n];
}

// 向き dir（平面の単位ベクトル）にそろえた箱：中心 c、長さ方向の半分 hl・幅の半分 hw、標高 z0〜z1
function box(m, c, dir, hl, hw, z0, z1, col) {
  const [ux, uy] = dir;
  const nx = -uy;
  const ny = ux;
  const L = [[c[0] - ux * hl + nx * hw, c[1] - uy * hl + ny * hw], [c[0] + ux * hl + nx * hw, c[1] + uy * hl + ny * hw]];
  const R = [[c[0] - ux * hl - nx * hw, c[1] - uy * hl - ny * hw], [c[0] + ux * hl - nx * hw, c[1] + uy * hl - ny * hw]];
  m.prism(L, R, [z0, z0], [z1, z1], col);
}

/**
 * 柱・腕・灯具の形（solid）と、灯具の光のにじみ（glow）。groundAt([lng, lat]) は地面の標高
 * @returns { solid: Mesh の結果, glow: GlowMesh の結果 }
 */
export function lampMesh(lamps, groundAt) {
  const solid = new Mesh();
  const glow = new GlowMesh();
  for (const l of lamps) {
    const z0 = groundAt(toLngLat([l.x, l.y]));
    if (!Number.isFinite(z0)) continue;
    const top = z0 + l.h;
    box(solid, [l.x, l.y], l.dir, POLE / 2, POLE / 2, z0 - 0.3, top, POLE_COL);
    let lampZ;
    if (l.arm > 0.2) {
      // 腕：柱の上から道の上へ。灯具はその先で下を向く
      const ax = l.hx - l.x;
      const ay = l.hy - l.y;
      const al = Math.hypot(ax, ay) || 1;
      const d = [ax / al, ay / al];
      box(solid, [(l.x + l.hx) / 2, (l.y + l.hy) / 2], d, al / 2 + 0.05, 0.06, top - 0.12, top, POLE_COL);
      box(solid, [l.hx - d[0] * 0.15, l.hy - d[1] * 0.15], d, 0.32, 0.15, top - 0.22, top - 0.06, LAMP_COL);
      lampZ = top - 0.28;
    } else {
      // 通路の街灯：柱の上に灯具
      box(solid, [l.x, l.y], l.dir, 0.17, 0.17, top - 0.45, top, LAMP_COL);
      box(solid, [l.x, l.y], l.dir, 0.22, 0.22, top, top + 0.06, POLE_COL);
      lampZ = top - 0.22;
    }
    const k = 0.95 * l.fade;
    glow.sprite([...worldOf([l.hx, l.hy]), lampZ], l.glow, LAMP_GLOW.map((v) => v * k), 2, 0.5);
  }
  return { solid: solid.result(), glow: glow.result() };
}

// 地上のホーム（いちばん近い線路が地上の線路。大岡山・洗足のような地下のホームは地面を照らさない）
export function surfacePlatforms(data) {
  const near = (c, lines) => {
    let best = Infinity;
    for (const l of lines) {
      const q = l.map(ll2xy);
      for (let i = 1; i < q.length; i++) best = Math.min(best, segDist(c[0], c[1], q[i - 1], q[i]));
    }
    return best;
  };
  return (data.platforms || []).filter((p) => {
    const q = p.map(ll2xy);
    const c = [q.reduce((s, v) => s + v[0], 0) / q.length, q.reduce((s, v) => s + v[1], 0) / q.length];
    return near(c, data.rail?.surface || []) < near(c, data.rail?.tunnel || []);
  });
}

/**
 * 道に落ちる光の輪の画像（地図のデータの範囲 R ぜんぶ、1px = mpp m）と、四隅の [経度, 緯度]。canvas を渡せばそこへ描き直す。
 * 光の輪は道に沿って少し長い楕円（灯具は道に沿って光を広げる）。重なるところは足して明るく。地上の駅のホームは白く明るい
 */
export function lampLightCanvas(lamps, data, R, canvas = null, mpp = 1.5) {
  const W = Math.ceil(R.wm / mpp);
  const H = Math.ceil(R.hm / mpp);
  const cv = canvas || document.createElement("canvas");
  if (cv.width !== W) cv.width = W;
  if (cv.height !== H) cv.height = H;
  const ctx = cv.getContext("2d");
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = "source-over";
  ctx.clearRect(0, 0, W, H);
  const px = (lng, lat) => [((lng - R.w) * R.kx) / mpp, ((R.n - lat) * R.ky) / mpp];
  ctx.lineJoin = "round";
  for (const ring of surfacePlatforms(data)) {
    ctx.beginPath();
    ring.forEach(([lat, lng], i) => {
      const [x, y] = px(lng, lat);
      if (i) ctx.lineTo(x, y);
      else ctx.moveTo(x, y);
    });
    ctx.closePath();
    ctx.strokeStyle = "rgba(226,234,255,0.16)";
    ctx.lineWidth = 5 / mpp;
    ctx.stroke();
    ctx.fillStyle = "rgba(232,238,255,0.5)";
    ctx.fill();
  }
  ctx.globalCompositeOperation = "lighter";
  for (const l of lamps) {
    const [lng, lat] = toLngLat([l.hx, l.hy]);
    const [cx, cy] = px(lng, lat);
    const A = l.alpha * l.fade;
    const [r, g, b] = l.rgb;
    const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
    for (const [t, k] of [[0, 1], [0.3, 0.62], [0.6, 0.24], [0.85, 0.06], [1, 0]]) grad.addColorStop(t, `rgba(${r},${g},${b},${(A * k).toFixed(3)})`);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.translate(cx, cy);
    ctx.rotate(Math.atan2(-l.dir[1], l.dir[0])); // 平面は北が +y、画像は下が +y
    ctx.scale((l.r * 1.2) / mpp, (l.r * 0.85) / mpp);
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(0, 0, 1, 0, 2 * Math.PI);
    ctx.fill();
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = "source-over";
  return { canvas: cv, coordinates: [[R.w, R.n], [R.e, R.n], [R.e, R.s], [R.w, R.s]] };
}
