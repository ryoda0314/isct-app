// 目の高さで歩いて見る（CampusMap3D の「歩いて見る」）。動きは Minecraft と同じ感じにする：
// 歩く 4.3m/s・ダッシュ 5.6m/s・しゃがむ 1.3m/s（しゃがむとふちから落ちない）、すばやく加速して止まる（空中はゆっくり）、
// ジャンプ（1.25m）と重力、0.6m までの段は歩いて上る・それより高い段は壁（ジャンプで乗れる）、ふちから歩き出すと落ちる。
// 足もと：地面（平地・坂道・階段を焼き込んだ標高）・橋の床・階段の段の上・建物の屋上・くり抜きの床のうち、足より上がりすぎないいちばん高いもの。
// ぶつかり：建物（高さのぶんだけ。通り抜け・くり抜きはくぐれる）・手で足した壁・木の幹・池・街灯の柱・地図の外。橋や階段の横、くり抜きの床のふち
// （手すり）、平地の段差のふち（柵）からは落ちない。どこからでも歩きはじめられるよう、画面で指したところの立てる面も出す（pick）。
// ここは位置・速さ・向きの計算と、目の位置から MapLibre のカメラ（中心・ズーム・中心の標高）を出す計算。DOM も MapLibre も使わない
import { BOARD_T, STAIRS_CLEAR, WALL_IN, WALL_T, basementRegions, buildingOpenings, buildingRoof, buildingSoffit, clearGlassFace, cumulative, densify, edgeOpen, inBasement, isOpenStairs, curbWidth, offsetLine, overLids, panelSlices, pointInRing, prepareBridge, railGround, signFrame, ringArea, stairsOpening, stripDistance, terraceLid, toLngLat, toXY, vertexShifts, vertexWidths, withAutoOpenStairs } from "./campus3dFeatures.js";
import { carveSurfaces, reachOut, trunkRadius } from "./campus3dMesh.js";
import { digWalk, floorWalk } from "./campus3dInterior.js";

const DEG = Math.PI / 180;
export const EYE = 1.62; // 目の高さ（m。Minecraft と同じ）
export const SPEED = { sneak: 1.3, walk: 4.3, sprint: 5.6 }; // m/s（Minecraft と同じ）
export const ROUTE_SPEED = { walk: 1.4, run: 4.3 }; // ルートを自動で歩くとき（ふつうに歩く速さ・走る）
export const JUMP = 8.4; // ジャンプの初速（m/s）。重力 GRAVITY で 1.25m 上がる
export const GRAVITY = 28; // m/s²（Minecraft の重力はこのくらい強い。ふわっとしない）
export const TURN = 120; // Q・E で向きを変える速さ（度/秒）
export const PITCH = { min: 5, max: 175, start: 88 }; // MapLibre の pitch（0 真下・90 水平・180 真上）
export const WALK_FOV = 70; // 縦の画角（度。Minecraft の「標準」）
export const SPRINT_FOV = 8; // ダッシュ中は画角を少し広げる（Minecraft と同じ）
// カメラから地図の中心（視線の先）まで(m)。MapLibre は近い面を「中心までの距離 ÷ 35 ほど」に置くので、近いほど
// 目の前の壁が切れない（体の半径 BODY より近い面が手前に来ないように）。中心は視線の先の宙か地面の下でよい。ズームはおよそ 22.5
export const VIEW_D = 8;
const BODY = 0.3; // 体の半径：壁にこれより近づかない（Minecraft と同じ）
const AUTO_DOOR_H = 2.3; // 平地の面の自動ドアの口の高さ（面の下の端から。campus3dMesh の addFace の板の上の端と同じ）
const STEP = 0.6; // 歩いて上れる段（Minecraft と同じ）。地面に沿って下りる段も
const AIR_STEP = 0.05; // 空中では段を上らない（ジャンプで足が上まで来たら乗れる）
const PROBE = 0.4; // 少し先の足もとも見る：なだらかに焼き込んだ平地の壁（0.3〜0.9m で 5m 上がる）を少しずつ登らないように
const GROUND_K = 14; // 速さを目標の速さへ寄せる強さ（地面。0.07 秒ほどで追いつく）
const AIR_K = 2.5; // 空中（ジャンプ中は向きを変えにくい）
const MAX_FALL = 50;
const DROP_OFF = 1.5; // 橋・階段の端の近くで横へ降りられる高さ
const APEX = (JUMP * JUMP) / (2 * GRAVITY); // ジャンプで上がる高さ

const ll2xy = ([lat, lng]) => toXY([lng, lat]);
const angle = (v) => ((v % 360) + 360) % 360;
export const angDiff = (to, from) => ((((to - from) % 360) + 540) % 360) - 180;

// 升目の索引（campus3dLamps.js と同じ作り）
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
 * 歩ける世界。data は BASEMAP、features は手で足した構造物、cut は cutPassages の結果（通り抜けで分けた建物）、
 * replaced は replacedBuildings（手で置きかえた地図の建物）、heights は地図の建物の高さ(m)、decks は橋・階段の床
 * （CampusMap3D の bridgesRef：prepareBridge・stairsPath）、posts は街灯の柱の位置 [[x, y]...]、bounds は歩ける範囲
 * [西, 南, 東, 北]（平面の m。地図の端）、groundAt([lng, lat]) は地面の標高。
 * 立体（建物・池）は足もとの形と、その点で埋まっている高さの区間 [[下, 上]...]（下が -Infinity なら地面から）を持つ：
 * 体（足 +0.1m〜足 +1.8m）が区間にかかるところへは入れず、区間の上（屋上・くり抜きの床）には立てる
 * @returns { surfacesAt, floorBelow, blocked, move, freeNear, pick }（x, y は平面の m）
 */
// surfaceAt は足もとの地面（詳細モードで地下の階の下を掘った地面。なければ groundAt）、digs はその掘ったもの（dem.digs）
export function walkWorld({ data, features = [], cut = null, replaced = null, heights = null, decks = [], posts = [], bounds = null, groundAt, surfaceAt = null, digs = [] }) {
  const solids = new Grid(40);
  const edges = new Grid(10);
  const ALL = [[-Infinity, Infinity]];
  const inRings = (x, y, rings) => rings.some((r) => pointInRing(x, y, r));
  const ground = (x, y) => groundAt(toLngLat([x, y]));
  const surface = surfaceAt ? (x, y) => surfaceAt(toLngLat([x, y])) : ground;
  // 壁：線分 a–b から half m 以内で、高さの区間 spans にかかる体は通れない（stand なら区間の上には立てる：体が少しでもかかる段には
  // 乗れる。柵の上には立たない）。owner はその壁を持つもの（立体のふちなら立体）
  const addEdge = (a, b, half, spans, owner = null, stand = true) => {
    const e = { a, b, half, spans, stand };
    e.owner = owner || e;
    edges.add(boxOf([a, b], half), e);
  };
  // 立体：外の輪と穴（中庭）。spans(x, y) はその点の埋まっている区間。ふちから BODY m も入れない（ふちの区間は少し内側で測る。
  // piece m ごと：場所で区間が変わる手で足した建物は細かく）
  const addSolid = (outer, holes, spans, piece = 2) => {
    if (outer.length < 3) return;
    const hs = holes.filter((h) => h.length > 2);
    const box = boxOf(outer);
    const solid = { outer, holes: hs, box, spans };
    solids.add(box, solid);
    const inside = (x, y) => pointInRing(x, y, outer) && !inRings(x, y, hs);
    for (const ring of [outer, ...hs]) {
      for (let i = 0; i < ring.length; i++) {
        const a = ring[i];
        const b = ring[(i + 1) % ring.length];
        const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
        if (L < 1e-6) continue;
        const n = Math.max(1, Math.ceil(L / piece));
        const nx = -(b[1] - a[1]) / L;
        const ny = (b[0] - a[0]) / L;
        for (let k = 0; k < n; k++) {
          const p = [a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n];
          const q = [a[0] + ((b[0] - a[0]) * (k + 1)) / n, a[1] + ((b[1] - a[1]) * (k + 1)) / n];
          const m = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
          // 立体の側へ少し入ったところの区間
          const s = inside(m[0] + nx * 0.05, m[1] + ny * 0.05) ? [m[0] + nx * 0.05, m[1] + ny * 0.05] : [m[0] - nx * 0.05, m[1] - ny * 0.05];
          addEdge(p, q, BODY, spans(s[0], s[1]), solid);
        }
      }
    }
    return solid;
  };
  // 地図の建物：地面から屋上まで（屋上は MapLibre と同じく、輪の点の平均の地面 + 高さ）
  const meanGround = (rings) => {
    let x = 0, y = 0, n = 0;
    rings.forEach((r) => r.forEach((p) => { x += p[0]; y += p[1]; n++; }));
    return ground(x / n, y / n);
  };
  data.buildings.forEach((b, i) => {
    if (replaced?.has(i)) return; // 手で置きかえた建物は、その形で
    const pieces = cut?.pieces?.get(i);
    if (pieces) {
      // 通り抜けで分けた建物：地面から立つ部分（b 0）と、穴の上の部分（穴の天井から屋上。下はくぐれる）
      for (const p of pieces) {
        const rings = p.rings.map((r) => r.map(toXY));
        const g = meanGround(rings);
        if (!Number.isFinite(g)) continue;
        const span = [[p.b ? g + p.b : -Infinity, g + p.h]];
        addSolid(rings[0], rings.slice(1), () => span);
      }
      return;
    }
    const rings = [b.p, ...(b.h || [])].map((r) => r.map(ll2xy));
    const g = meanGround(rings);
    const top = Number.isFinite(g) && heights ? g + heights[i] : Infinity;
    const span = [[-Infinity, top]];
    addSolid(rings[0], rings.slice(1), () => span);
  });
  (data.water || []).forEach((w) => addSolid(w.map(ll2xy), [], () => ALL));
  // 壁・柵の足もと：天井のある平地のふたの上では、ふたの上（焼き込んだ地面は下の部屋の床）
  const wallGround = overLids(groundAt, features.filter((f) => f.type === "terrace" && f.ceiling > 0 && !(f.side > 0) && f.coords?.length > 2).map((f) => terraceLid(f, f.coords.map(toXY), f.elev, ground)).filter(Boolean));
  for (const f of features) {
    if (f.type === "building") {
      // 手で足した建物：屋根の高さはその点の屋根（斜めに切った面）。くり抜き・建物を通る通り抜けのところは、床より下と天井より上だけ
      const ring = f.coords.map(toXY);
      if (ring.length < 3) continue;
      const mean = ring.reduce((a, p) => [a[0] + p[0] / ring.length, a[1] + p[1] / ring.length], [0, 0]);
      const ref = f.groundRef ? toXY(f.groundRef) : mean; // 高さを測る地面の点（描くのと同じ）
      const g0 = ground(ref[0], ref[1]);
      if (!Number.isFinite(g0)) continue;
      const roofOf = buildingRoof(f);
      const hAt = roofOf.hAt;
      const carves = buildingOpenings(f, features).map((cv) => {
        const cr = reachOut(cv.coords.map(toXY), ring);
        return { cv, ring: cr, ...carveSurfaces(cr, cv) };
      });
      // 屋根の板のうち、建物の形の外へ張り出しているもの・くり抜き（屋上テラスなど）の上にかかるもの：厚さ BOARD_T の板（上に立てて、下はくぐれる）
      const overCarve = (b) => carves.some((c) => [...b.ring, b.ring.reduce((a, p) => [a[0] + p[0] / b.ring.length, a[1] + p[1] / b.ring.length], [0, 0])].some((p) => pointInRing(p[0], p[1], c.ring)) || c.ring.some((p) => pointInRing(p[0], p[1], b.ring)));
      for (const b of roofOf.boards.list) {
        if (b.ring.every((p) => pointInRing(p[0], p[1], ring)) && !overCarve(b)) continue;
        addSolid(b.ring, [], (x, y) => {
          const z = g0 + b.zAt([x, y]);
          return [[z - BOARD_T, z]];
        });
      }
      // 宙に浮いた建物（base）は、下の面（船底）より上だけ。詳細モードで歩いて見るときの殻（detailShell）は屋根の厚さだけ
      // （中は階の床・壁で歩く。くり抜き＝テラスは床の厚さ）
      const soff = buildingSoffit(f, ring);
      const spans = (x, y) => {
        const roof = g0 + hAt([x, y]);
        const c = carves.find((cv) => pointInRing(x, y, cv.ring));
        if (f.detailShell) {
          if (!c) return [[roof - (roofOf.boards.list.length ? 1.4 : 0.6), roof]];
          const fl = g0 + Math.max(0, c.floorAt([x, y]));
          return fl > g0 + 0.3 ? [[fl - 0.35, fl]] : [];
        }
        if (!c) return [[soff ? g0 + soff.at([x, y]) : -Infinity, roof]];
        const fl = g0 + Math.max(0, c.floorAt([x, y]));
        const ce = c.ceilAt ? g0 + c.ceilAt([x, y]) : Infinity;
        // 屋根の板のある建物は、床をそのまま（板の下の暗い面の高さに下げない。描くのと同じ）
        const out = [[-Infinity, roofOf.boards.list.length ? fl : Math.min(fl, roof)]];
        if (ce < roof - 0.05) out.push([ce, roof]);
        return out;
      };
      const solid = addSolid(ring, [], spans, 0.5);
      // 立った板（V 字の柱など）：板のある高さの区間だけ（厚さの半分と体の半径まで近づけない。上には立たない）
      for (const p of f.panels || []) {
        for (const sl of panelSlices(p)) addEdge(sl.a, sl.b, p.thickness / 2 + BODY, sl.spans.map(([lo, hi]) => [g0 + lo, g0 + hi]), null, false);
      }
      // くり抜きの奥の壁（くり抜きのふちのうち建物の中）：くり抜きの外側（建物の中）の区間で、BODY m 手前で止まる
      for (const c of carves) {
        for (let i = 0; i < c.ring.length; i++) {
          const a = c.ring[i];
          const b = c.ring[(i + 1) % c.ring.length];
          const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
          if (L < 1e-6) continue;
          const nx = -(b[1] - a[1]) / L;
          const ny = (b[0] - a[0]) / L;
          const n = Math.max(1, Math.ceil(L / 0.5));
          for (let k = 0; k < n; k++) {
            const p = [a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n];
            const q = [a[0] + ((b[0] - a[0]) * (k + 1)) / n, a[1] + ((b[1] - a[1]) * (k + 1)) / n];
            const m = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
            if (!pointInRing(m[0], m[1], ring)) continue;
            const o = pointInRing(m[0] + nx * 0.05, m[1] + ny * 0.05, c.ring) ? [m[0] - nx * 0.05, m[1] - ny * 0.05] : [m[0] + nx * 0.05, m[1] + ny * 0.05];
            if (pointInRing(o[0], o[1], ring)) addEdge(p, q, BODY, spans(o[0], o[1]), solid);
          }
        }
      }
      // くり抜きの床のふちの手すり（床が地面より上のとき。描くのと同じ、外の壁の線の上）。跳んでも越えられない 1.5m
      for (const c of carves) {
        if (!c.cv.rail) continue;
        for (let i = 0; i < ring.length; i++) {
          const a = ring[i];
          const b = ring[(i + 1) % ring.length];
          const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 0.5));
          for (let k = 0; k < n; k++) {
            const p = [a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n];
            const q = [a[0] + ((b[0] - a[0]) * (k + 1)) / n, a[1] + ((b[1] - a[1]) * (k + 1)) / n];
            const m = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
            if (!pointInRing(m[0], m[1], c.ring)) continue;
            // 屋根のほうが低いところは屋根の上（描くのと同じ。屋根の板のある建物は床のまま）
            const fl = roofOf.boards.list.length ? Math.max(0, c.floorAt(m)) : Math.min(Math.max(0, c.floorAt(m)), hAt(m));
            if (fl <= 0.05) continue;
            addEdge(p, q, BODY, [[g0 + fl, g0 + fl + 1.5]], solid, false);
          }
        }
      }
    } else if (f.type === "floor") {
      // 詳細モードの建物の階：床・壁・ガラス・手すり・家具・階段（campus3dInterior.js）
      floorWalk(f, groundAt, { solid: addSolid, edge: (a, b, half, spans, stand) => addEdge(a, b, half, spans, null, stand) }, BODY);
    } else if (f.type === "tree") {
      // 木：幹だけ（葉の下はくぐれる）
      const p = toXY(f.coords[0]);
      addEdge(p, p, trunkRadius(f) + BODY, ALL, null, false);
    } else if (f.type === "signal") {
      // 信号機：柱だけ（腕と灯の下はくぐれる）
      const p = toXY(f.coords[0]);
      addEdge(p, p, 0.11 + BODY, ALL, null, false);
    } else if (f.type === "sign" && f.legs > 0) {
      // 立て看板：板の真下（倒した板の奥行きの中ほど）の線。板の上の端まで（柵などに付けた板は、付けたものがふさぐ）
      const g = ground(...toXY(f.coords[0]));
      const fr = signFrame(f);
      const reach = Math.max(f.thickness, f.height * Math.abs(fr.ey[0])) / 2;
      const [a] = fr.at(0, f.height / 2, -f.thickness / 2);
      const [b] = fr.at(f.width, f.height / 2, -f.thickness / 2);
      addEdge(a, b, reach + BODY, [[-Infinity, Number.isFinite(g) ? g + f.z + f.height * fr.ey[1] : Infinity]], null, false);
    } else if (f.type === "wall") {
      // 長い区間は 2m ごとに分ける（足もとの高さ・ふたの上かどうかは、分けた区間のまん中で測る）
      const { pts } = densify(f.coords.map(toXY), 2);
      for (let i = 1; i < pts.length; i++) {
        const mid = [(pts[i - 1][0] + pts[i][0]) / 2, (pts[i - 1][1] + pts[i][1]) / 2];
        const L = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]) || 1;
        // ガラスの手すり・rim の柵は描くのと同じ足もと（両わきの高いほうの地面。掘り下げた平地のふちの上に立つものも）。
        // 天井のある平地のふたの上では、ふたの上から（描くときと同じ）
        const nn = [-(pts[i][1] - pts[i - 1][1]) / L, (pts[i][0] - pts[i - 1][0]) / L];
        const footAt = (gnd) => (f.kind === "glass" || f.rim ? railGround(gnd, mid, nn) : gnd(toLngLat(mid)));
        const g = footAt(wallGround);
        const t = f.curb ? Math.max(f.thickness || 0.3, curbWidth(f)) : f.thickness || 0.3; // 縁石があればその幅
        // ふたの上に立つ柵（下は部屋の口：くぐれる）と、段の上に立てた柵（base）は、その足もとから上だけ。平地のふちの柵（rim）も
        // 足もとから上だけ（下の段は平地のふちの帯と柵がふさぐ。明かり取りのふちの金網の真下の地下 2 階の自動ドアをくぐれるように。2026-11-09）
        const raised = Number.isFinite(g) && (f.base > 0 || f.rim || g > footAt(groundAt) + 0.3);
        const lo = raised ? g + (f.base || 0) - 0.05 : -Infinity;
        addEdge(pts[i - 1], pts[i], t / 2 + BODY, [[lo, Number.isFinite(g) ? g + (f.base || 0) + (f.height || 1.2) : Infinity]]);
      }
    }
  }
  // 平地（掘り下げた・盛った地面）のふち：段差が STEP m より大きいところは落ちない・登れない・跳んでも越えない。
  // 垂直に切ったふち（side 0）は描くのと同じ壁（ふちから外へ WALL_T、上は高い側の地面の高さで、上に立てる）と、低い側の面の上の柵。
  // 地面（焼き込んだ標高）の段差は壁の中にあるので、壁の上も床にしないと、上からは見えているふちの手前で落ち、下からは壁にめりこむ。
  // 斜めに切ったふち（side > 0）は、段差のいちばん急なところに柵。坂道・階段・橋が横切るところは、その通り道の幅だけあける
  // 壁なしの階段（平地のふちに沿う階段。地面の標高と同じく withAutoOpenStairs で決める）は、ふちを横切るところだけあける（描くのと同じ edgeOpen）
  const paths = withAutoOpenStairs(features.filter((f) => f.type === "terrace" || ((f.type === "slope" || f.type === "stairs" || f.type === "bridge") && f.coords?.length > 1)));
  const opens = paths.filter(isOpenStairs).map(stairsOpening);
  const crossFeats = paths.filter((f) => f.type !== "terrace" && !isOpenStairs(f));
  const crossings = crossFeats.map((f) => {
    // 通り道の帯。両端は 2m 延ばす（端がふちの少し手前・先にあっても、壁の外の面まであける。横へは広げない）
    const xy = f.coords.map(toXY);
    const n = xy.length - 1;
    const ext = (p, q) => {
      const L = Math.hypot(p[0] - q[0], p[1] - q[1]) || 1;
      return [p[0] + ((p[0] - q[0]) / L) * 2, p[1] + ((p[1] - q[1]) / L) * 2];
    };
    const pts = [ext(xy[0], xy[1]), ...xy, ext(xy[n], xy[n - 1])];
    const hw = vertexWidths(f).map((w) => w / 2);
    const cv = vertexShifts(f);
    return { xy: pts, cum: cumulative(pts), hwv: [hw[0], ...hw, hw[n]], cv: [cv[0], ...cv, cv[n]], box: boxOf(pts, Math.max(...hw.map((h, i) => h + Math.abs(cv[i])))) };
  });
  const inStrip = (list, x, y) => list.some((c) => x >= c.box[0] && x <= c.box[2] && y >= c.box[1] && y <= c.box[3] && stripDistance(c.xy, c.cum, c.hwv, [x, y], c.cv).D <= 0.01);
  // 橋の帯（通り道と同じ）と、床の下の面の高さ：橋の下のふちは、あけずに柵を床の下の面までにする（橋の上は歩けて、下はふちで止まる。
  // 地下の玄関の穴を覆う通路の床など）
  const crossPaths = crossings.filter((_, i) => crossFeats[i].type !== "bridge");
  const bridgeStrips = crossFeats.map((f, i) => {
    if (f.type !== "bridge") return null;
    const pb = prepareBridge(f, groundAt);
    return pb ? { ...crossings[i], id: f.id, under: (x, y) => pb.deckAt(stripDistance(pb.xy, pb.cum, pb.hwv, [x, y], pb.cv).s) - f.thickness } : null;
  }).filter(Boolean);
  const underBridge = (x, y) => {
    for (const c of bridgeStrips) if (inStrip([c], x, y)) return { id: c.id, z: c.under(x, y) };
    return null;
  };
  // 坂道・階段の通り道の上か（ふちと階段の端が斜めに合うすき間へ落ちないように、move で使う）
  const inCrossing = (x, y) => inStrip(crossings, x, y) || inStrip(opens, x, y);
  const terraces = features.filter((f) => f.type === "terrace" && f.coords?.length > 2).map((f) => ({ f, ring: f.coords.map(toXY) }));
  // 地下の階（中の見える建物）の形
  const basements = basementRegions(features);
  // 天井のある平地（地下の玄関の穴など）：ふたはまわりの地面の続き（上を歩ける。下は天井まであく）。床の下が地下の階なら、床は厚さ 0.3m の
  // 板（描く addCovered と同じ。地下の階を見せるために掘った地面は下の階の床まで下がっているので、この板の上を歩く。2026-11-09）
  const lids = new Map();
  const mouths = []; // 開いた口（壁でない辺）：口の線のまわりのふちの柵は天井から上だけ（口をくぐれる）
  for (const t of terraces) {
    const lid = t.f.ceiling > 0 && !(t.f.side > 0) ? terraceLid(t.f, t.ring, t.f.elev, ground) : null;
    if (!lid) continue;
    lids.set(t.f, lid);
    addSolid(lid.poly, [], () => [[lid.under, lid.top + 0.02]]);
    const fc0 = lid.floor.reduce((s, p) => [s[0] + p[0] / lid.floor.length, s[1] + p[1] / lid.floor.length], [0, 0]);
    if (basements.length && inBasement(basements, fc0)) addSolid(lid.floor, [], () => [[t.f.elev - 0.3, t.f.elev + 0.005]]);
    t.ring.forEach((a, i) => { if (!lid.walls[i]) mouths.push({ a, b: t.ring[(i + 1) % t.ring.length], lid }); });
  }
  // 点が口の線から 0.6m 以内（口の両端のあいだ）なら、その口の平地のふた
  const mouthAt = (x, y) => {
    for (const mo of mouths) {
      const dx = mo.b[0] - mo.a[0];
      const dy = mo.b[1] - mo.a[1];
      const L2 = dx * dx + dy * dy;
      const t = ((x - mo.a[0]) * dx + (y - mo.a[1]) * dy) / L2;
      if (t > 0 && t < 1 && Math.abs((x - mo.a[0]) * dy - (y - mo.a[1]) * dx) / Math.sqrt(L2) < 0.6) return mo.lid;
    }
    return null;
  };
  // ふちの段差を測る地面：ふたの下（掘った帯）は、ふたの上の高さ（描くときと同じ）
  const rimGround = (x, y) => {
    let g = ground(x, y);
    for (const [, L] of lids) if (pointInRing(x, y, L.poly)) g = Math.max(g, L.top);
    return g;
  };
  // 平地のふちから壁の厚さ + 0.5m の内（move で使う）
  const rims = new Grid(10);
  for (const { ring } of terraces) ring.forEach((a, i) => rims.add(boxOf([a, ring[(i + 1) % ring.length]], WALL_T + 0.5), [a, ring[(i + 1) % ring.length]]));
  const nearRim = (x, y) => rims.some(x, y, 0, ([a, b]) => segDist(x, y, a, b) < WALL_T + 0.5);
  // 点 (x, y) に、高さ z と STEP m 以内の階段・橋の床があるか
  const deckFlush = (x, y, z) => decks.some((d) => {
    if (d.box && (x < d.box[0] || x > d.box[2] || y < d.box[1] || y > d.box[3])) return false;
    const r = stripDistance(d.xy, d.cum, d.hwv || d.hw, [x, y], d.cv || 0);
    if (r.D > 0.05) return false;
    const dz = d.deckAt(r.s) - (d.step ? STAIRS_CLEAR : 0);
    return Number.isFinite(dz) && Math.abs(dz - z) <= STEP;
  });
  // 地下の階（中の見える建物。basements）：掘り下げのふちの外がここなら、壁は薄く（WALL_IN）、透明なガラスの面ならガラスの上から上だけ（描くのと同じ）
  for (const f of features) {
    if (f.type !== "terrace" || !(f.coords?.length > 2)) continue;
    const ring = f.coords.map(toXY);
    const N = ring.length;
    const out = ringArea(ring) > 0 ? 1 : -1; // 左回りなら外は辺の右
    const cut = !(f.side > 0);
    // 壁の外の面の線（角は留め継ぎ。描くのと同じ）。outer[i] は ring[i] の外
    const outer = offsetLine([ring[N - 1], ...ring, ring[0], ring[1]], -out * WALL_T).slice(1, -1);
    for (let i = 0; i < N; i++) {
      const a = ring[i];
      const b = ring[(i + 1) % N];
      const oa = outer[i];
      const ob = outer[i + 1];
      const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (L < 1e-6) continue;
      const nx = ((b[1] - a[1]) / L) * out;
      const ny = (-(b[0] - a[0]) / L) * out;
      // 帯の上の点（w 0 ふち〜1 壁の外の面）：ふちの点から外へ直角に。出隅の角の点（t = 0・1）だけ留め継ぎの外の点（描く帯と同じ）。
      // 外の面の線を角の点のあいだで比例で割ると、角のそばでは辺の向きに最大 WALL_T ずれて、坂・階段の通り道があいた帯が外の側で斜めにふさがる。
      // 入隅の留め継ぎの点は辺の先へ出る（1 区間より遠いと四角がねじれる）ので使わない（となりの辺の帯と重なって角はふさがる）
      const ux = (b[0] - a[0]) / L, uy = (b[1] - a[1]) / L;
      const convexA = (oa[0] - a[0] - nx * WALL_T) * ux + (oa[1] - a[1] - ny * WALL_T) * uy < -1e-6;
      const convexB = (ob[0] - b[0] - nx * WALL_T) * ux + (ob[1] - b[1] - ny * WALL_T) * uy > 1e-6;
      const at = (t, w = 0) => {
        const p = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
        if (w === 0) return p;
        const q = t <= 1e-9 && convexA ? oa : t >= 1 - 1e-9 && convexB ? ob : [p[0] + nx * WALL_T, p[1] + ny * WALL_T];
        return [p[0] + (q[0] - p[0]) * w, p[1] + (q[1] - p[1]) * w];
      };
      const n = Math.max(1, Math.ceil(L));
      for (let k = 0; k < n; k++) {
        const m = at((k + 0.5) / n);
        // ふちの内 1.5m 〜 外 1.5m の地面
        const prof = [];
        for (let j = -10; j <= 10; j++) prof.push((lids.size && !lids.has(f) ? rimGround : ground)(m[0] + nx * j * 0.15, m[1] + ny * j * 0.15));
        if (!prof.every(Number.isFinite)) continue;
        const hi = Math.max(...prof);
        if (hi - Math.min(...prof) <= STEP) continue;
        const lowIn = prof.slice(0, 10).reduce((x, y) => x + y) < prof.slice(11).reduce((x, y) => x + y);
        // 平地のほうが高くても、外が階段の床（踊り場）で高さがそろっていれば、ふちはない（踊り場から入る地下の玄関の穴など）
        if (!lowIn && deckFlush(m[0] + nx * 0.6, m[1] + ny * 0.6, hi)) continue;
        // 外のとなりの平地のほうが高ければ、そちらの壁（描くときと同じ）。ふちを斜めにした平地（side > 0）は壁を立てないので、こちらで。
        // そちらが天井のある平地なら、口の上の壁（まぐさ）：天井から上だけの壁と柵（上の地面からこちらへ落ちない。口はくぐれる）
        const o = [m[0] + nx * (WALL_T + 0.4), m[1] + ny * (WALL_T + 0.4)];
        const over = cut && lowIn ? terraces.find((t) => t.f !== f && !(t.f.side > 0) && pointInRing(o[0], o[1], t.ring)) : null;
        if (over) {
          const lid = lids.get(over.f);
          if (lid) {
            addSolid([at(k / n), at((k + 1) / n), at((k + 1) / n, 1), at(k / n, 1)], [], () => [[lid.under, lid.top + 0.05]]);
            addEdge(at(k / n), at((k + 1) / n), BODY + 0.05, [[lid.under, lid.top + 3]], null, false);
          }
          continue;
        }
        let w = 0.5; // 柵の位置（0 ふち〜1 壁の外の面）
        if (!cut) {
          // 段差のいちばん急なところ
          let steep = -1;
          for (let j = 0; j + 1 < prof.length; j++) {
            const d = Math.abs(prof[j + 1] - prof[j]);
            if (d > steep) { steep = d; w = ((j + 0.5 - 10) * 0.15) / WALL_T; }
          }
        } else w = lowIn ? 0 : 1;
        const top = [[-Infinity, hi + 0.05]];
        // 外（壁の帯の側）が地下の階：帯は WALL_IN の薄い壁。透明なガラスの面なら、帯はガラスの上の端から上だけ（ガラスの線は下の柵で止まる）
        const inB = cut && lowIn && basements.length > 0 && inBasement(basements, [m[0] + nx * 0.6, m[1] + ny * 0.6]);
        const wB = inB ? WALL_IN / WALL_T : 1;
        const fcI = f.faces?.[i];
        const bandTop = inB && clearGlassFace(fcI) ? [[Math.min(...prof) + fcI.glass, hi + 0.05]] : top;
        // ふちに沿って地面が下がっていくところで、走って跳んでも越えない高さ。天井のある平地のふちは天井まで（上のふたを歩ける）
        const rail = lids.has(f) ? [[-Infinity, lids.get(f).under]] : [[-Infinity, hi + 3]];
        // 自動ドア（面の auto の扉の口）：外が地下の階なら、口のところの帯と柵は扉の上から上だけ（くぐって地下の階へ入る。2026-11-09）
        const doorTop = inB && fcI?.auto && fcI.doors?.length ? Math.min(...prof) + (fcI.base || 0) + AUTO_DOOR_H : null;
        const inDoor = (t) => doorTop != null && fcI.doors.some(([d0, d1]) => t >= d0 && t <= d1);
        // 0.1m ずつ見て、坂道・階段の通り道でないところだけ（坂道・壁のある階段は壁の厚さのまん中で、壁なしの階段はふちの上で見る）
        const t0 = k / n;
        const t1 = (k + 1) / n;
        const sub = Math.max(1, Math.round(L / n / 0.1));
        const dir = [(b[0] - a[0]) / L, (b[1] - a[1]) / L];
        // 柵の区間：{ ra, rb（始まり・終わり）, key（橋・口のどれの下か）, cap（橋の床の下の面のいちばん低いところ）, mouth（天井のある平地の口のふた）,
        //   door（自動ドアの口） }
        let run = null;
        const flush = () => {
          if (!run) return;
          const { ra, rb, cap, mouth, door } = run;
          if (door) {
            if (cut && rb - ra > 1e-6 && bandTop[0][1] > doorTop) addSolid([at(ra), at(rb), at(rb, wB), at(ra, wB)], [], () => [[Math.max(doorTop, bandTop[0][0]), bandTop[0][1]]]);
            if (rail[0][1] > doorTop) addEdge(at(ra, w), at(rb, w), BODY + 0.05, [[doorTop, rail[0][1]]], null, false);
          } else if (mouth) {
            // 天井のある平地の口：柵と壁の上の面は、天井から上だけ（下はくぐれる）
            if (cut && rb - ra > 1e-6 && hi + 0.05 > mouth.under) addSolid([at(ra), at(rb), at(rb, 1), at(ra, 1)], [], () => [[mouth.under, hi + 0.05]]);
            addEdge(at(ra, w), at(rb, w), BODY + 0.05, [[mouth.under, Math.max(rail[0][1], mouth.top + 3)]], null, false);
          } else {
            if (cut && rb - ra > 1e-6) addSolid([at(ra), at(rb), at(rb, wB), at(ra, wB)], [], () => bandTop);
            // 斜めに切ったふち（side > 0）の柵が地下の階の中に立つときは立てない（となりの掘り下げのふちの段差を拾ったもの。地下の階の中では
            // 見えない壁になり、上の広場は地下の上のふたが受ける。明かり取りのまわりの通路 taki-walk のふちが内部大階段の中にあった）
            const inner = !cut && basements.length > 0 && inBasement(basements, at((ra + rb) / 2, w));
            if (!inner) addEdge(at(ra, w), at(rb, w), BODY + 0.05, cap == null ? rail : [[-Infinity, Math.min(cap, rail[0][1])]], null, false);
          }
          run = null;
        };
        for (let j = 0; j <= sub; j++) {
          const t = t0 + ((t1 - t0) * j) / sub;
          const c = at(t, 0.5);
          const open = inStrip(crossPaths, c[0], c[1]) || (opens.length > 0 && edgeOpen(opens, at(t), dir));
          const br = open ? null : underBridge(c[0], c[1]);
          const rp = at(t, w);
          const mouth = open || !mouths.length ? null : mouthAt(rp[0], rp[1]);
          const door = !open && !mouth && inDoor(t);
          const key = mouth ? "mouth" : door ? "door" : br ? br.id : "";
          if (open || (run && run.key !== key)) flush();
          if (!open) {
            if (run) {
              run.rb = t;
              if (br) run.cap = Math.min(run.cap, br.z);
            } else run = { ra: t, rb: t, key, cap: br ? br.z : null, mouth, door };
          }
          if (j === sub) flush();
        }
      }
    }
  }
  // 街灯の柱（太さ 0.24m）：点の辺として
  for (const p of posts) addEdge(p, p, 0.12 + BODY, ALL);
  // 詳細モードで地下の階の下を掘ったふちの帯（上は掘る前の地面）
  for (const d of digs) digWalk(d, digs, groundAt, { solid: addSolid });

  // 体（足 z の 0.1m 上〜1.8m 上）が区間にかかるか
  const hits = (spans, z) => spans.some(([lo, hi]) => lo < z + 1.8 && hi > z + 0.1);
  const outOfBounds = (x, y) => !!bounds && (x < bounds[0] || y < bounds[1] || x > bounds[2] || y > bounds[3]);
  const solidAt = (x, y, fn) => solids.some(x, y, 0, (s) => x >= s.box[0] && x <= s.box[2] && y >= s.box[1] && y <= s.box[3] && pointInRing(x, y, s.outer) && !inRings(x, y, s.holes) && fn(s));
  // 動く壁（エレベーターの閉まった扉など。setDyn で渡す。点と足の高さ → ふさぐか）
  let dyn = null;
  const blocked = (x, y, z) => outOfBounds(x, y) || solidAt(x, y, (s) => hits(s.spans(x, y), z)) || edges.some(x, y, 0, (e) => segDist(x, y, e.a, e.b) < e.half && hits(e.spans, z)) || (dyn !== null && dyn(x, y, z));
  // ぶつかっているもの（立体・壁の owner。地図の外は bounds）
  const blockers = (x, y, z) => {
    const out = outOfBounds(x, y) ? [bounds] : [];
    solidAt(x, y, (s) => {
      if (hits(s.spans(x, y), z)) out.push(s);
      return false;
    });
    edges.some(x, y, 0, (e) => {
      if (segDist(x, y, e.a, e.b) < e.half && hits(e.spans, z)) out.push(e.owner);
      return false;
    });
    return out;
  };

  // 動く床（エレベーターのかごの床など。setDynFloor で渡す。点 → 足場の標高の並び）
  let dynFloor = null;
  // その点の足場：{ z, deck }（地面・橋や階段の床・建物の屋上やくり抜きの床。deck は橋・階段の床のときその床）
  const surfacesAt = (x, y) => {
    const g = surface(x, y);
    const out = Number.isFinite(g) ? [{ z: g, deck: null }] : [];
    if (dynFloor !== null) for (const z of dynFloor(x, y)) out.push({ z, deck: null });
    for (const d of decks) {
      if (d.box && (x < d.box[0] || x > d.box[2] || y < d.box[1] || y > d.box[3])) continue;
      const r = stripDistance(d.xy, d.cum, d.hwv || d.hw, [x, y], d.cv || 0);
      if (r.D > 0.05) continue;
      const z = d.deckAt(r.s) - (d.step ? STAIRS_CLEAR : 0); // 階段の線は段の角より少し上に引いてある
      if (Number.isFinite(z)) out.push({ z, deck: d });
    }
    solidAt(x, y, (s) => {
      for (const [, hi] of s.spans(x, y)) if (Number.isFinite(hi)) out.push({ z: hi, deck: null });
      return false;
    });
    // 体がかかっている段（立体のふち・平地の壁・低い壁）の上：Minecraft と同じく、体の端が乗っていれば立てる
    edges.some(x, y, 0, (e) => {
      if (e.stand && segDist(x, y, e.a, e.b) < e.half) for (const [, hi] of e.spans) if (Number.isFinite(hi)) out.push({ z: hi, deck: null });
      return false;
    });
    return out;
  };
  // 高さ ref より低い（同じ）足場のうち、いちばん高いもの（なければ null）
  const floorBelow = (x, y, ref) => {
    let best = null;
    for (const s of surfacesAt(x, y)) if (s.z <= ref && (!best || s.z > best.z)) best = s;
    return best;
  };
  // 橋・階段の床の端の近く（そこからは降りられる。ほかの横は手すり・壁）
  const nearEnds = (d, x, y) => {
    const n = d.xy.length - 1;
    const hw = (i) => (Array.isArray(d.hwv) ? d.hwv[i] : d.hw) || 1;
    return Math.hypot(x - d.xy[0][0], y - d.xy[0][1]) <= hw(0) + 1 || Math.hypot(x - d.xy[n][0], y - d.xy[n][1]) <= hw(n) + 1;
  };

  // (x0, y0)・足の高さ z0 から (x0 + dx, y0 + dy) へ。ぶつかったら壁に沿ってすべる（壁の向き → 東西だけ → 南北だけ）。
  // onGround：地面にいれば段を STEP m まで上る。sneak：ふちから落ちない。deck：いま乗っている床（その横からは落ちない）
  // @returns { x, y, floor（足場 { z, deck }）, hit（ぶつかった） }
  const move = (x0, y0, z0, dx, dy, { onGround = true, sneak = false, deck = null } = {}) => {
    const step = onGround ? STEP : AIR_STEP;
    // 建物の中から始めたとき（壁ぎわに入りこんだとき）は、そのものからは出られる（ほかのもの・柵へは入れない）
    const startBy = blocked(x0, y0, z0) ? blockers(x0, y0, z0) : null;
    const deckZ = deck?.xy && !onGround ? surfacesAt(x0, y0).find((s) => s.deck === deck)?.z : null; // 跳んでいるときの、下の床の高さ
    const test = (nx, ny) => {
      const f = floorBelow(nx, ny, z0 + step);
      if (!f) return null; // 足場が高すぎる（壁）か、地面のないところ
      // 動いたあとの足の高さ（地面にいれば段に沿う。ふちの先なら今の高さのまま落ちはじめる）
      const zn = onGround && f.z >= z0 - STEP ? f.z : z0;
      if (startBy ? blockers(nx, ny, zn).some((o) => !startBy.includes(o)) : blocked(nx, ny, zn)) return null;
      const d = Math.hypot(nx - x0, ny - y0);
      if (d > 1e-6) {
        const ux = (nx - x0) / d;
        const uy = (ny - y0) / d;
        // 少し先が壁なら進まない（なだらかに焼き込んだ平地の壁を、歩いても跳んでも少しずつ登らない）
        if (!floorBelow(x0 + ux * PROBE, y0 + uy * PROBE, z0 + step)) return null;
        // ふち（すぐ先が STEP m より低い）：しゃがんでいれば止まる
        const q = floorBelow(nx + ux * 0.15, ny + uy * 0.15, z0 + step);
        const low = Math.min(f.z, q ? q.z : f.z);
        if (onGround && sneak && z0 - low > STEP) return null;
        // 橋・階段の床の横は手すり・壁で落ちない（跳んでも越えない。空中なら床の高さから測る）。端の近くは降りられる（浅ければ）
        if (deck?.xy && (f.deck !== deck || (q && q.deck !== deck))) {
          const drop = (onGround ? z0 : (deckZ ?? z0)) - low;
          if (drop > STEP && (drop > DROP_OFF || !nearEnds(deck, nx, ny))) return null;
        }
        // 平地のふちの近く・坂道や階段の通り道：柵を通り道のためにあけたところの、ふちと階段の端のすき間へも落ちない（跳んでも）
        if (z0 - low > DROP_OFF + (onGround ? 0 : APEX) && (nearRim(nx, ny) || inCrossing(nx, ny))) return null;
      }
      return { x: nx, y: ny, floor: f };
    };
    const full = test(x0 + dx, y0 + dy);
    if (full) return { ...full, hit: false };
    // いちばん近い壁（辺・柱・角）の近い点から離れる向きに直角な向きへ（辺の途中なら辺に沿って、柱や角なら回りこむ）
    let best = null;
    edges.some(x0, y0, BODY + 0.6, (e) => {
      if (!hits(e.spans, z0)) return false;
      const ax = e.b[0] - e.a[0];
      const ay = e.b[1] - e.a[1];
      const L2 = ax * ax + ay * ay;
      const t = L2 < 1e-9 ? 0 : Math.min(1, Math.max(0, ((x0 - e.a[0]) * ax + (y0 - e.a[1]) * ay) / L2));
      const px = e.a[0] + ax * t;
      const py = e.a[1] + ay * t;
      const dist = Math.hypot(x0 - px, y0 - py);
      if (dist < e.half + 0.3 && (!best || dist - e.half < best.gap)) best = { gap: dist - e.half, px, py, dist };
      return false;
    });
    const tries = [];
    if (best && best.dist > 1e-6) {
      const nx = (x0 - best.px) / best.dist;
      const ny = (y0 - best.py) / best.dist;
      const k = dx * -ny + dy * nx;
      tries.push([-ny * k, nx * k]);
    }
    if (Math.abs(dx) > 1e-9) tries.push([dx, 0]);
    if (Math.abs(dy) > 1e-9) tries.push([0, dy]);
    // 斜めのふち（橋・階段の床の横など、辺のないところ）：45° ずつずらした向きへ
    for (const a of [45, -45, 70, -70]) {
      const c = Math.cos(a * DEG);
      const sn = Math.sin(a * DEG);
      tries.push([(dx * c - dy * sn) * c, (dx * sn + dy * c) * c]);
    }
    for (const [mx, my] of tries) {
      const r = test(x0 + mx, y0 + my);
      if (r) return { ...r, hit: true };
    }
    return { x: x0, y: y0, floor: floorBelow(x0, y0, z0 + step), hit: true };
  };

  // (x, y)・足の高さ z が建物の中・壁ぎわなら、いちばん近い外の点（1m ずつ広げて探す）と、そこの足場の高さ
  const freeNear = (x, y, z, max = 80) => {
    if (!blocked(x, y, z)) return [x, y, z];
    for (let r = 1; r <= max; r++) {
      for (let k = 0; k < 24; k++) {
        const a = (k / 24) * 2 * Math.PI;
        const px = x + Math.cos(a) * r;
        const py = y + Math.sin(a) * r;
        const f = floorBelow(px, py, z + STEP);
        const pz = f ? f.z : z;
        if (!blocked(px, py, pz)) return [px, py, pz];
      }
    }
    return [x, y, z];
  };

  // 画面で指したところ：カメラ cam（[x, y, z]）から、指した地面の点 hit（[x, y, z]）へのまっすぐな線で、最初に当たる立てるところ。
  // 建物の上の面（屋上・くり抜きの床）・橋や階段の床ならその上、建物の横の面なら手前の地面、何もなければ指した地面
  // @returns [x, y, z]（足の位置）
  const pick = (cam, hit) => {
    const d = [hit[0] - cam[0], hit[1] - cam[1], hit[2] - cam[2]];
    const L = Math.hypot(...d);
    const n = Math.max(1, Math.ceil(L / 0.25));
    let prev = cam;
    for (let i = 1; i <= n; i++) {
      const p = [cam[0] + (d[0] * i) / n, cam[1] + (d[1] * i) / n, cam[2] + (d[2] * i) / n];
      let inSolid = null;
      solidAt(p[0], p[1], (s) => {
        for (const [lo, hi] of s.spans(p[0], p[1])) if (p[2] >= lo && p[2] <= hi) { inSolid = hi; return true; }
        return false;
      });
      if (inSolid != null) {
        if (Number.isFinite(inSolid) && prev[2] >= inSolid - 0.01) return [p[0], p[1], inSolid]; // 上の面
        const f = floorBelow(prev[0], prev[1], prev[2]);
        return [prev[0], prev[1], f ? f.z : prev[2]]; // 横の面：手前の足もと
      }
      for (const s of surfacesAt(p[0], p[1])) if (s.deck && prev[2] >= s.z && p[2] <= s.z) return [p[0], p[1], s.z];
      prev = p;
    }
    const f = floorBelow(hit[0], hit[1], hit[2] + STEP);
    return [hit[0], hit[1], f ? f.z : hit[2]];
  };
  const setDyn = (fn) => {
    dyn = typeof fn === "function" ? fn : null;
  };
  const setDynFloor = (fn) => {
    dynFloor = typeof fn === "function" ? fn : null;
  };
  // その点の屋根（雨・雪をさえぎる面）のいちばん高いところ：立体（建物・ひさし・平地など）の区間の上の端と、橋・階段の床。なければ -Infinity。
  // 雨・雪の粒（campus3dPrecip）はこれより下では描かない。濡れにくい道を探すときにも使える
  const coverAt = (x, y) => {
    let top = -Infinity;
    solidAt(x, y, (s) => {
      for (const [, hi] of s.spans(x, y)) if (Number.isFinite(hi) && hi > top) top = hi;
      return false;
    });
    for (const d of decks) {
      if (d.box && (x < d.box[0] || x > d.box[2] || y < d.box[1] || y > d.box[3])) continue;
      const r = stripDistance(d.xy, d.cum, d.hwv || d.hw, [x, y], d.cv || 0);
      if (r.D > 0.05) continue;
      const z = d.deckAt(r.s);
      if (Number.isFinite(z) && z > top) top = z;
    }
    return top;
  };
  return { surfacesAt, floorBelow, blocked, move, freeNear, pick, setDyn, setDynFloor, coverAt };
}

/**
 * 体を1フレーム動かす（Minecraft と同じ感じ）。s は { x, y, z（足の標高）, vx, vy, vz, onGround, deck, yaw（方位、度）, pitch }、
 * input は { fwd, side（-1〜1。前・右が +）, turn（右が +）, jump, sprint, sneak, autoJump（低い段の前で自動でジャンプ。スマホ） }
 * @returns 新しい状態と、段を上り下りした高さ stepUp（目をなめらかに動かすため）
 */
export function stepBody(s, input, dt, world) {
  const yaw = angle(s.yaw + (input.turn || 0) * TURN * dt);
  let fwd = Math.max(-1, Math.min(1, input.fwd || 0));
  let side = Math.max(-1, Math.min(1, input.side || 0));
  const mag = Math.hypot(fwd, side);
  if (mag > 1) {
    fwd /= mag;
    side /= mag;
  }
  // ダッシュは前へ進んでいるときだけ（Minecraft と同じ）
  const speed = input.sneak ? SPEED.sneak : input.sprint && fwd > 0.3 ? SPEED.sprint : SPEED.walk;
  const b = yaw * DEG;
  const tvx = (Math.sin(b) * fwd + Math.cos(b) * side) * speed; // 東へ
  const tvy = (Math.cos(b) * fwd - Math.sin(b) * side) * speed; // 北へ
  const k = 1 - Math.exp(-(s.onGround ? GROUND_K : AIR_K) * dt);
  let vx = s.vx + (tvx - s.vx) * k;
  let vy = s.vy + (tvy - s.vy) * k;
  if (mag < 1e-3 && Math.hypot(vx, vy) < 0.02) {
    vx = 0;
    vy = 0;
  }
  // 水平：柱をすり抜けないよう 0.25m ずつ
  let { x, y, z, deck, onGround } = s;
  let stepUp = 0;
  let hit = false;
  let floor = null;
  const n = Math.max(1, Math.ceil((Math.hypot(vx, vy) * dt) / 0.25));
  for (let i = 0; i < n; i++) {
    const r = world.move(x, y, z, (vx * dt) / n, (vy * dt) / n, { onGround, sneak: input.sneak, deck });
    hit ||= r.hit;
    const moved = Math.hypot(r.x - x, r.y - y);
    x = r.x;
    y = r.y;
    floor = r.floor;
    // 地面にいれば、段（STEP m まで上り、下りは坂くらいの急さまで）に沿う。急に低くなったら（ふち・平地の壁の上）落ちはじめる
    if (onGround && floor && floor.z >= z - Math.min(STEP, moved * 2 + 0.02)) {
      stepUp += floor.z - z;
      z = floor.z;
      deck = floor.deck;
    } else if (onGround && (!floor || floor.z < z)) onGround = false;
  }
  // 壁に押しつけているあいだも速さ（進もうとする勢い）は残す：段の前でジャンプすると、足が上に出たとたんに前へ進んで乗れる
  // （Minecraft で W を押したまま跳ぶと 1 段上がれるのと同じ）
  // 上下
  let vz = onGround ? 0 : s.vz;
  const lowStep = () => {
    // 前の少し先（0.5m）に、ジャンプで乗れる高さの段（STEP〜1.2m）がある
    const d = Math.hypot(tvx, tvy);
    if (d < 0.5) return false;
    const px = x + (tvx / d) * 0.5;
    const py = y + (tvy / d) * 0.5;
    return world.surfacesAt(px, py).some((f) => f.z > z + STEP && f.z <= z + 1.2 && !world.blocked(px, py, f.z));
  };
  if (onGround && (input.jump || (input.autoJump && hit && lowStep()))) {
    vz = JUMP;
    onGround = false;
  }
  if (!onGround) {
    // 重力：1フレームの中でも放物線どおりに（ジャンプの高さがフレームの長さで変わらない）
    const z1 = z + vz * dt - 0.5 * GRAVITY * dt * dt;
    vz = Math.max(-MAX_FALL, vz - GRAVITY * dt);
    const land = vz <= 0 ? world.floorBelow(x, y, z + AIR_STEP) : null; // いまの足より下の、いちばん高い足場
    if (land && z1 <= land.z) {
      z = land.z;
      vz = 0;
      onGround = true;
      deck = land.deck;
    } else z = z1;
  }
  return { ...s, x, y, z, vx, vy, vz, onGround, deck, yaw, stepUp, hit };
}

// ── 飛ぶ（Minecraft のクリエイティブ）：重力なし。前後左右は地面と同じ入力、up / down で上下（Space・Shift）、sprint で速く。
// ぶつかる（noclip でなければ）：体（足の 0.1〜1.8m 上）が立体・壁にかかるところへは進まない（軸ごとにすべる）。地面や床が足より
// STEP m 以内で高ければその上へ上がる（低く飛んで坂・段をこえる）、それより高ければ壁。下りて足場に着いたら飛ぶのをやめる（landed）。
// noclip（スペクテイター）：何にもぶつからない（壁・床・地面を抜ける） ──
export const FLY = { speed: 8, sprint: 16, vert: 6 }; // m/s
const FLY_K = 8; // 速さを目標へ寄せる強さ（空中でもきびきび）
export function stepFly(s, input, dt, world, { noclip = false } = {}) {
  const yaw = angle(s.yaw + (input.turn || 0) * TURN * dt);
  let fwd = Math.max(-1, Math.min(1, input.fwd || 0));
  let side = Math.max(-1, Math.min(1, input.side || 0));
  const mag = Math.hypot(fwd, side);
  if (mag > 1) {
    fwd /= mag;
    side /= mag;
  }
  const speed = input.sprint ? FLY.sprint : FLY.speed;
  const b = yaw * DEG;
  const tvx = (Math.sin(b) * fwd + Math.cos(b) * side) * speed;
  const tvy = (Math.cos(b) * fwd - Math.sin(b) * side) * speed;
  const tvz = ((input.up ? 1 : 0) - (input.down ? 1 : 0)) * FLY.vert * (input.sprint ? 2 : 1);
  const k = 1 - Math.exp(-FLY_K * dt);
  let vx = s.vx + (tvx - s.vx) * k;
  let vy = s.vy + (tvy - s.vy) * k;
  let vz = (s.vz || 0) + (tvz - (s.vz || 0)) * k;
  if (mag < 1e-3 && Math.hypot(vx, vy) < 0.02) {
    vx = 0;
    vy = 0;
  }
  if (!input.up && !input.down && Math.abs(vz) < 0.02) vz = 0;
  let { x, y, z } = s;
  let hit = false;
  let landed = false;
  if (noclip) {
    x += vx * dt;
    y += vy * dt;
    z += vz * dt;
  } else {
    // 水平：0.25m ずつ。足もとの段（STEP まで）は上がる、それより高い面・立体・壁は止まって軸ごとにすべる
    const go = (nx, ny) => {
      const f = world.floorBelow(nx, ny, z + STEP);
      const zn = f && f.z > z ? f.z : z;
      if (world.blocked(nx, ny, zn)) return null;
      if (world.surfacesAt(nx, ny).some((q) => q.z > zn + 0.05 && q.z < zn + 1.8)) return null; // 体の高さの地面・床（坂・階段）
      return zn;
    };
    const n = Math.max(1, Math.ceil((Math.hypot(vx, vy) * dt) / 0.25));
    for (let i = 0; i < n; i++) {
      const dx = (vx * dt) / n;
      const dy = (vy * dt) / n;
      let zn = go(x + dx, y + dy);
      if (zn != null) { x += dx; y += dy; z = zn; continue; }
      hit = true;
      if (Math.abs(dx) > 1e-9 && (zn = go(x + dx, y)) != null) { x += dx; z = zn; vy = 0; continue; }
      if (Math.abs(dy) > 1e-9 && (zn = go(x, y + dy)) != null) { y += dy; z = zn; vx = 0; continue; }
      vx = 0;
      vy = 0;
      break;
    }
    // 上下：上は頭がぶつかれば止まる。下は足場に着いたら着地
    const nz = z + vz * dt;
    if (vz > 0) {
      if (world.blocked(x, y, nz)) vz = 0;
      else z = nz;
    } else if (vz < 0) {
      const f = world.floorBelow(x, y, z + 0.01);
      if (f && nz <= f.z) {
        z = f.z;
        vz = 0;
        landed = true;
      } else if (world.blocked(x, y, nz)) vz = 0;
      else z = nz;
    }
  }
  return { ...s, x, y, z, vx, vy, vz, yaw, onGround: landed, deck: null, stepUp: 0, hit, landed };
}

// ルート（[{ lat, lng }...]）を平面の折れ線にして、距離 s の位置と向き（方位、度）を引けるように
export function routePath(latlngs) {
  const xy = latlngs.map((p) => toXY([p.lng, p.lat]));
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
  // s から先 ahead m の点へ向く方位（曲がり角の手前から少しずつ向きを変える）
  const heading = (s, ahead = 5) => {
    const a = at(s);
    const b = at(Math.min(len, s + ahead));
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    if (Math.hypot(dx, dy) < 0.05) return null;
    return angle(Math.atan2(dx, dy) / DEG);
  };
  // 点 (x, y) にいちばん近い、線の上の距離（案内中に、今いるところからルートを歩きはじめる）
  const nearest = (x, y) => {
    let best = Infinity;
    let bs = 0;
    for (let i = 1; i < xy.length; i++) {
      const [ax, ay] = xy[i - 1];
      const dx = xy[i][0] - ax;
      const dy = xy[i][1] - ay;
      const L2 = dx * dx + dy * dy || 1e-9;
      const t = Math.min(1, Math.max(0, ((x - ax) * dx + (y - ay) * dy) / L2));
      const d = Math.hypot(x - ax - dx * t, y - ay - dy * t);
      if (d < best) { best = d; bs = cum[i - 1] + t * Math.sqrt(L2); }
    }
    return bs;
  };
  return { xy, cum, len, at, heading, nearest };
}

// ルートを自動で歩く 1 フレーム：s を進めて、向きを道の先へなめらかに寄せる（壁・段差では止めない＝案内の線のとおり）
export function stepRoute(s, path, dt, world, { run = false, steer = true } = {}) {
  const along = Math.min(path.len, s.along + (run ? ROUTE_SPEED.run : ROUTE_SPEED.walk) * dt);
  const [x, y] = path.at(along);
  const h = path.heading(along);
  const yaw = steer && h != null ? angle(s.yaw + angDiff(h, s.yaw) * Math.min(1, dt * 2.5)) : s.yaw;
  const f = world.floorBelow(x, y, s.z + STEP) || world.floorBelow(x, y, Infinity);
  return { ...s, x, y, along, yaw, z: f ? f.z : s.z, deck: f ? f.deck : null, vx: 0, vy: 0, vz: 0, onGround: true, stepUp: f ? f.z - s.z : 0, done: along >= path.len - 0.01 };
}

/**
 * 目（平面の x, y と標高 z）・方位 yaw・pitch から MapLibre の jumpTo に渡すカメラ。中心は視線の先 D m（宙か地面の下でもよい）。
 * view は { height（地図の高さ px）, fov（縦の画角、ラジアン） }
 */
export function eyeCamera({ x, y, z }, yaw, pitch, view, D = VIEW_D) {
  const p = pitch * DEG;
  const b = yaw * DEG;
  const h = D * Math.sin(p);
  const [lng, lat] = toLngLat([x + h * Math.sin(b), y + h * Math.cos(b)]);
  const zoom = Math.log2((((0.5 * view.height) / Math.tan(view.fov / 2)) * 40075016.686 * Math.cos(lat * DEG)) / (D * 512));
  return { center: [lng, lat], elevation: z - D * Math.cos(p), zoom, bearing: yaw, pitch };
}
