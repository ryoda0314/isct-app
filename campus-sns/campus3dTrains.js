// キャンパスの3D地図を走る電車（東急目黒線・大井町線・池上線・東横線）。データは public/map-3d/trains.json（scripts/gen-campus-trains.mjs）。
// 線路は OpenStreetMap の路線、ダイヤは駅探の時刻表から作った「基準の駅（大岡山・石川台・自由が丘）の前後の駅の時刻（分）」。位置は時刻表どおり
// （遅れは反映しない）。駅と駅のあいだは「加速 → 一定 → 減速」で走り、駅には少し止まる。区間の端の外から入ってくる電車・
// 外へ出ていく電車は、一定の速さで出入りする。描くのは campus3dLayer.js の createTrainsLayer（トンネルの中は透かして薄く）
import { jstNow, todayDayType } from "../lib/api/jp-calendar.js";
import { cumulative, toLngLat, toXY } from "./campus3dFeatures.js";
import { GlowMesh, worldOf } from "./campus3dMesh.js";

export const TRAINS_URL = "/map-3d/trains.json";
const ACC = 0.8; // 加速・減速の強さ（m/s²）
const VMAX = 20; // 区間の外から入ってくる・外へ出ていくときの速さ（m/s、約70km/h）
const VRUN = 22; // 駅のあいだのいちばん速い速さ（m/s、約80km/h）。時刻表（分単位）がこれより速いときは、少し遅れて着く
const GAP = 0.8; // 車両のあいだ（m）
const HALF_W = 1.45; // 車両の幅の半分（m）
const FLOOR = 0.5; // 線路から車体の下まで（m）
const ROOF = 3.9; // 線路から屋根まで（m）
const DEPTH = 9; // トンネルの線路の深さ（m）。入口から RAMP m かけて下りる（大岡山の地下駅は 300m ほどなので短めに）
const RAMP = 70;
const HOLD = 60; // 終点に着いてから消えるまで（秒）
const STEP = 4; // 線路の高さを測る間隔（m）
const VIADUCT = 120; // これより長い橋は高架：地面から LIFT m 上げる（入口から 60m かけて）。標高データが築堤をもう含んでいれば上げない
const LIFT = 6;

const hex = (h) => { const n = parseInt(h.slice(1, 7), 16); return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255, 1]; };
const mixW = (c, k) => [c[0] + (1 - c[0]) * k, c[1] + (1 - c[1]) * k, c[2] + (1 - c[2]) * k, 1];

// いまの時刻：JST の「運行日」（4時で切り替え、0〜3時は前の日のダイヤの続き）の何秒目か。
// 試すとき：window.__trainClock = { at: "08:15", day: "weekday", speed: 1 } で、その時刻から進める（speed: 0 なら止めておく）
export function serviceClock(nowMs = Date.now()) {
  const o = typeof window !== "undefined" ? window.__trainClock : null;
  if (o?.at) {
    const [h, m] = String(o.at).split(":").map(Number);
    if (o.since == null) o.since = nowMs;
    return { day: o.day || "weekday", sec: ((h < 4 ? h + 24 : h) * 60 + m) * 60 + ((nowMs - o.since) / 1000) * (o.speed ?? 1) };
  }
  const d = new Date(nowMs);
  const j = jstNow(d);
  const day = todayDayType(jstNow(new Date(nowMs - 4 * 3600e3)));
  const min = j.minutes < 240 ? j.minutes + 1440 : j.minutes;
  return { day, sec: min * 60 + d.getUTCSeconds() + d.getUTCMilliseconds() / 1000 };
}

// 線路を平面（m）に。停車位置・トンネルは、データの距離をこちらの長さに合わせ直す
export function prepareTrains(data) {
  const routes = data.routes.map((r) => {
    const xy = r.pts.map((p) => toXY(p));
    const cum = cumulative(xy);
    const len = cum[cum.length - 1];
    const k = len / (r.len || len);
    const c = hex(r.colour || "#888888");
    return {
      key: r.key, line: r.line, dir: r.dir, xy, cum, len,
      stops: r.stops.map((s) => ({ name: s.name, s: s.s * k })),
      tunnels: (r.tunnels || []).map(([a, b]) => [a * k, b * k]),
      bridges: (r.bridges || []).map(([a, b, lv]) => [a * k, b * k, lv]),
      cols: { side: c, top: mixW(c, 0.45) },
      hz: null,
    };
  });
  return { routes, patterns: data.patterns, days: data.days, dwell: data.dwell || 25 };
}

// 線路の上の距離 s の点（平面 m）
function pointAt(r, s) {
  const { xy, cum } = r;
  let i = 1;
  while (i < xy.length - 1 && cum[i] < s) i++;
  const k = Math.min(1, Math.max(0, (s - cum[i - 1]) / (cum[i] - cum[i - 1] || 1)));
  return [xy[i - 1][0] + (xy[i][0] - xy[i - 1][0]) * k, xy[i - 1][1] + (xy[i][1] - xy[i - 1][1]) * k];
}
const tunnelAt = (r, s) => r.tunnels.some(([a, b]) => s >= a && s <= b);
// トンネルの中の深さ：入口・出口から RAMP m かけて DEPTH まで
const depthAt = (r, s) => {
  let d = 0;
  for (const [a, b] of r.tunnels) if (s > a && s < b) d = Math.max(d, DEPTH * Math.min(1, (s - a) / RAMP, (b - s) / RAMP));
  return d;
};

// 平面の点 p にいちばん近い、線路の上の距離
function projectOn(r, p) {
  let best = Infinity, bs = 0;
  for (let i = 0; i + 1 < r.xy.length; i++) {
    const [ax, ay] = r.xy[i], [bx, by] = r.xy[i + 1];
    const L2 = (bx - ax) ** 2 + (by - ay) ** 2 || 1e-9;
    const t = Math.min(1, Math.max(0, ((p[0] - ax) * (bx - ax) + (p[1] - ay) * (by - ay)) / L2));
    const d = Math.hypot(p[0] - ax - (bx - ax) * t, p[1] - ay - (by - ay) * t);
    if (d < best) { best = d; bs = r.cum[i] + t * (r.cum[i + 1] - r.cum[i]); }
  }
  return { s: bs, d: best };
}
// 長い橋：自分の向きの橋と、同じ路線の反対向きの橋（上下線で OSM の区切りがちがうことがある）を合わせる
function longBridges(prep, r) {
  const out = r.bridges.filter(([a, b]) => b - a >= VIADUCT).map(([a, b]) => [a, b]);
  for (const o of prep.routes) {
    if (o === r || o.line !== r.line) continue;
    for (const [a, b] of o.bridges) {
      if (b - a < VIADUCT) continue;
      const pa = projectOn(r, pointAt(o, a)), pb = projectOn(r, pointAt(o, b));
      if (pa.d < 30 && pb.d < 30) out.push([Math.min(pa.s, pb.s), Math.max(pa.s, pb.s)]);
    }
  }
  out.sort((x, y) => x[0] - y[0]);
  const merged = [];
  for (const [a, b] of out) { const l = merged[merged.length - 1]; if (l && a <= l[1] + 20) l[1] = Math.max(l[1], b); else merged.push([a, b]); }
  return merged;
}

// 線路の高さ：地面（groundAt）を STEP m おきに測ってなめらかにし（±20m の平均）、トンネルの中は下げる。
// 橋の上は両端の高さを結んだ線（下の道路へ沈まない）、地面よりは下げない。長い橋（高架）は、線路の真下の地面が左右 25m と
// 変わらなければ（標高データに築堤がない）地面から LIFT m 上げる。地形のない所（範囲の外）は、いちばん近い測れた高さ
export function setTrackHeights(prep, groundAt) {
  for (const r of prep.routes) {
    const n = Math.ceil(r.len / STEP) + 1;
    const raw = Array.from({ length: n }, (_, i) => groundAt(toLngLat(pointAt(r, Math.min(r.len, i * STEP)))));
    const firstOk = raw.findIndex(Number.isFinite);
    if (firstOk < 0) { r.hz = new Float32Array(n).fill(30); continue; }
    for (let i = 0; i < firstOk; i++) raw[i] = raw[firstOk];
    for (let i = 1; i < n; i++) if (!Number.isFinite(raw[i])) raw[i] = raw[i - 1];
    const W = 5;
    r.hz = new Float32Array(n);
    r.gz = new Float32Array(n); // 線路のところの地面（トンネル・高架で線路と離れるところでは、窓あかり・前照灯の光を地面に落とさない）
    for (let i = 0; i < n; i++) {
      let sum = 0, cnt = 0;
      for (let k = Math.max(0, i - W); k <= Math.min(n - 1, i + W); k++) { sum += raw[k]; cnt++; }
      r.gz[i] = sum / cnt;
      r.hz[i] = sum / cnt - depthAt(r, i * STEP);
    }
    const span = (a, b, lift) => {
      const ia = Math.max(0, Math.floor(a / STEP)), ib = Math.min(n - 1, Math.ceil(b / STEP));
      const ha = r.hz[ia], hb = r.hz[ib];
      for (let i = ia + 1; i < ib; i++) {
        const s = i * STEP;
        const line = ha + ((hb - ha) * (i - ia)) / (ib - ia || 1);
        r.hz[i] = Math.max(line, r.hz[i] + lift * Math.min(1, (s - a) / 60, (b - s) / 60));
      }
    };
    for (const [a, b] of r.bridges) if (b - a < VIADUCT) span(a, b, 0);
    for (const [a, b] of longBridges(prep, r)) {
      // 築堤があるか：まん中 6 割の 5 か所で、線路の真下と左右 25m の地面の差
      let diff = 0, cnt = 0;
      for (let k = 0; k < 5; k++) {
        const s = a + (b - a) * (0.2 + 0.15 * k);
        const p = pointAt(r, s), q = pointAt(r, Math.min(r.len, s + 2));
        const ux = q[0] - p[0], uy = q[1] - p[1], l = Math.hypot(ux, uy) || 1;
        const c = groundAt(toLngLat(p)), L = groundAt(toLngLat([p[0] - (uy / l) * 25, p[1] + (ux / l) * 25])), R = groundAt(toLngLat([p[0] + (uy / l) * 25, p[1] - (ux / l) * 25]));
        if ([c, L, R].every(Number.isFinite)) { diff += c - (L + R) / 2; cnt++; }
      }
      span(a, b, cnt && diff / cnt > 2 ? 0 : LIFT);
    }
  }
}
const sampleAt = (arr, s) => {
  const f = Math.min(arr.length - 1, Math.max(0, s / STEP));
  const i = Math.floor(f);
  const j = Math.min(arr.length - 1, i + 1);
  return arr[i] + (arr[j] - arr[i]) * (f - i);
};
const heightAt = (r, s) => (r.hz ? sampleAt(r.hz, s) : 30);
// 線路が地面の上にあるか（トンネル・高架・高い築堤でない）
const nearGround = (r, s) => !r.gz || Math.abs(sampleAt(r.hz, s) - sampleAt(r.gz, s)) < 1.2;

// 距離 D を τ 秒で、止まった状態から止まった状態まで走るときの、u 秒目の進んだ距離（加速 → 一定 → 減速）
function runAt(D, tau, u) {
  if (u <= 0) return 0;
  if (u >= tau) return D;
  const disc = tau * tau - (4 * D) / ACC;
  let v, a;
  if (disc >= 0) { v = ((tau - Math.sqrt(disc)) * ACC) / 2; a = ACC; }
  else { v = (2 * D) / tau; a = v / (tau / 2); } // 時間が足りないときは、加速と減速だけ
  const t1 = v / a;
  if (u < t1) return 0.5 * a * u * u;
  if (u < tau - t1) return 0.5 * v * t1 + v * (u - t1);
  const w = tau - u;
  return D - 0.5 * a * w * w;
}
// 距離 D を止まった状態から止まった状態まで走るのに、少なくともかかる時間（加速・減速 ACC、いちばん速くて VRUN）
const runTime = (D) => (D >= (VRUN * VRUN) / ACC ? D / VRUN + VRUN / ACC : 2 * Math.sqrt(D / ACC));
// 止まった状態から加速して VMAX で走り続けたときの、u 秒目の距離 / VMAX で来て減速して止まるまで u 秒前の距離
const leaveAt = (u) => { const t1 = VMAX / ACC; return u < t1 ? 0.5 * ACC * u * u : 0.5 * VMAX * t1 + VMAX * (u - t1); };
const leaveTime = (D) => { const t1 = VMAX / ACC, d1 = 0.5 * VMAX * t1; return D < d1 ? Math.sqrt((2 * D) / ACC) : t1 + (D - d1) / VMAX; };

// 列車ひとつの、時刻 sec（運行日の秒）での位置（列車のまん中の、線路の上の距離）。走っていなければ null
function positionOf(prep, pat, depMin, sec) {
  const r = prep.routes[pat.route];
  // 駅ごとの着・発（秒）。着の時刻があって発より前なら（待ち合わせ）その分だけ長く止まる。ほかは発の dwell 秒前に着く
  const ev = pat.ev.map(([si, rel, arrRel]) => {
    const st = r.stops[si];
    const dep = (depMin + rel) * 60;
    const dwell = st.name === "大岡山" ? prep.dwell + 10 : prep.dwell;
    const arr = arrRel != null && arrRel < rel ? Math.min((depMin + arrRel) * 60 + 30, dep - dwell) : dep - dwell;
    return { s: st.s, dep, arr };
  });
  if (!ev.length) return null;
  // 時刻表は分単位なので、駅のあいだが短すぎることがある：走れる時間まで着くのを遅らせ、次の発車も（10秒は止まるよう）ずらす
  for (let k = 1; k < ev.length; k++) {
    const e = ev[k - 1], n = ev[k];
    const need = runTime(Math.max(0, n.s - e.s));
    if (n.arr - e.dep < need) {
      n.arr = e.dep + need;
      if (n.dep < n.arr + 10) n.dep = n.arr + 10;
    }
  }
  const first = ev[0], last = ev[ev.length - 1];
  // 区間の始まりから最初の駅まで、VMAX で入ってきて止まる。始発の駅が区間の中なら（start）、発車の HOLD 秒前にそこに現れる
  const tIn = pat.start ? first.dep - HOLD : first.arr - leaveTime(first.s);
  if (sec < tIn) return null;
  if (!pat.start && sec < first.arr) return first.s - leaveAt(first.arr - sec);
  for (let k = 0; k < ev.length; k++) {
    const e = ev[k];
    if (sec <= e.dep || (k === ev.length - 1 && pat.end && sec <= e.arr + HOLD)) return sec >= e.arr || k === 0 ? e.s : null;
    const n = ev[k + 1];
    if (!n) break;
    if (sec < n.arr) {
      return e.s + runAt(Math.max(0, n.s - e.s), Math.max(1, n.arr - e.dep), sec - e.dep);
    }
  }
  if (pat.end) return null;
  // 最後の駅を出て、区間の終わりまで
  const s = last.s + leaveAt(sec - last.dep);
  return s <= r.len + 400 ? s : null;
}

// いま走っている列車：{ route, s（まん中）, cars, carLen, type }
export function trainsAt(prep, { day, sec }) {
  const list = prep.days[day] || prep.days.weekday || [];
  const min = sec / 60;
  // 基準の駅を出る時刻の前後 20 分の列車だけ調べる（どの列車もその間に区間を通り抜ける）
  let lo = 0, hi = list.length;
  while (lo < hi) { const m = (lo + hi) >> 1; if (list[m][1] < min - 20) lo = m + 1; else hi = m; }
  const out = [];
  for (let i = lo; i < list.length && list[i][1] <= min + 20; i++) {
    const [pi, depMin] = list[i];
    const pat = prep.patterns[pi];
    const s = positionOf(prep, pat, depMin, sec);
    if (s != null) out.push({ route: pat.route, s, cars: pat.cars, carLen: pat.carLen, type: pat.type });
  }
  return out;
}

// ── 車両の形。高さは線路の上から(m)。窓・扉は 20m 級が片側 4 扉、18m 級が 3 扉。先頭は前照灯（白）、最後尾は尾灯（赤）──
const WIN = [2, 2.95]; // 客室の窓
const DOOR = [1.15, 3.05]; // 扉
const DOOR_W = 1.3;
const DOOR_WIN = 0.42; // 扉の窓（片側の戸ごと）の幅
const CAB_WIN = [2.05, 3.2]; // 運転台の前の窓
const SIGN = [3.32, 3.62]; // 行き先の表示
const LAMP = [1.5, 1.78]; // 前照灯・尾灯
const DETAIL_ZOOM = 16.5; // これより引いたら窓は車両ごとに1本の帯（細かく分けると線がちらつく）
const BEAM = 40; // 前照灯が線路を照らす長さ(m)
const GLASS = [0.12, 0.15, 0.2, 1]; // 昼の窓ガラス（光を受ける）
const GLASS_DIM = [0.1, 0.12, 0.15];
const ROOM_HI = [1, 0.97, 0.9]; // 夜の客室のあかり：窓の上（天井の灯り）
const ROOM_LO = [0.88, 0.82, 0.7]; // 窓の下（座席・人で少し暗く、あたたかい）
const HEAD = [1, 0.97, 0.88];
const TAIL = [1, 0.13, 0.08];
const SIGN_DAY = [0.62, 0.45, 0.24];
const SIGN_NIGHT = [1, 0.8, 0.45];
const UP = [0, 0, 1];
// アルファ 0.5 の色は光を受けない（自分で光る。campus3dLayer.js の VS_TRAIN）
const lit3 = (c) => [c[0], c[1], c[2], 0.5];
const mix3 = (a, b, t) => [0, 1, 2].map((k) => a[k] + (b[k] - a[k]) * t);

// 列車の三角形は毎フレーム作り直すので、大きな Float32Array に直接書く（配列を足していく・作り直すのは遅い）。
// 結果は Mesh.result() と同じ形（使える長さに切った subarray）
const QUAD = [0, 1, 2, 0, 2, 3];
class FastMesh {
  constructor() {
    this.n = 0;
    this.cap = 0;
    this.grow(4096);
  }

  grow(need) {
    const cap = Math.max(need, this.cap * 2);
    const pos = new Float32Array(cap * 3);
    const nrm = new Float32Array(cap * 3);
    const col = new Float32Array(cap * 4);
    if (this.pos) {
      pos.set(this.pos);
      nrm.set(this.nrm);
      col.set(this.col);
    }
    Object.assign(this, { cap, pos, nrm, col });
  }

  // 四角形：q は角 4 つの [x, y, z] を並べた 12 個、n は面の向き、c は下の 2 角・c2 は上の 2 角の色
  quad(q, n, c, c2 = c) {
    if (this.n + 6 > this.cap) this.grow(this.n + 6);
    for (const k of QUAD) {
      const i = this.n++;
      const cc = k < 2 ? c : c2;
      this.pos[i * 3] = q[k * 3];
      this.pos[i * 3 + 1] = q[k * 3 + 1];
      this.pos[i * 3 + 2] = q[k * 3 + 2];
      this.nrm[i * 3] = n[0];
      this.nrm[i * 3 + 1] = n[1];
      this.nrm[i * 3 + 2] = n[2];
      this.col[i * 4] = cc[0];
      this.col[i * 4 + 1] = cc[1];
      this.col[i * 4 + 2] = cc[2];
      this.col[i * 4 + 3] = cc[3];
    }
  }

  result() {
    return { pos: this.pos.subarray(0, this.n * 3), nrm: this.nrm.subarray(0, this.n * 3), col: this.col.subarray(0, this.n * 4), count: this.n };
  }
}
// 毎フレーム使い回す入れ物（reuse のとき。結果は次に作るまでのあいだだけ使える）
const POOL = { surface: new FastMesh(), tunnel: new FastMesh() };

// 車両の座標：後ろの端 pb から前の端 pf へ a m、左へ l m、線路から h m → 描く座標。標高は zb〜zf を a で補間。
// 20m ほどなので、描く座標への変換は端の 3 点だけ測って、あいだはまっすぐに伸ばす。
// put(i, a, l, h) は四角形の i 番目の角を Q へ書く（四角形を作るたびに配列を作らない）
const Q = new Float64Array(12);
function carFrame(pb, pf, zb, zf) {
  const L = Math.hypot(pf[0] - pb[0], pf[1] - pb[1]) || 1;
  const ex = (pf[0] - pb[0]) / L;
  const ey = (pf[1] - pb[1]) / L;
  const W0 = worldOf(pb);
  const W1 = worldOf(pf);
  const WN = worldOf([pb[0] - ey, pb[1] + ex]); // 左へ 1m
  const ax = (W1[0] - W0[0]) / L;
  const ay = (W1[1] - W0[1]) / L;
  const lx = WN[0] - W0[0];
  const ly = WN[1] - W0[1];
  const dz = (zf - zb) / L;
  return {
    L,
    at: (a, l, h) => [W0[0] + ax * a + lx * l, W0[1] + ay * a + ly * l, zb + dz * a + h],
    put: (i, a, l, h) => {
      Q[i * 3] = W0[0] + ax * a + lx * l;
      Q[i * 3 + 1] = W0[1] + ay * a + ly * l;
      Q[i * 3 + 2] = zb + dz * a + h;
    },
    // 面の向き（描く座標は y が南向き）
    left: [-ey, -ex, 0],
    right: [ey, ex, 0],
    fwd: [ex, -ey, 0],
    back: [-ex, ey, 0],
  };
}

// 片側の窓・扉・乗務員扉の窓の位置（車両の後ろの端からの [始め, 終わり] m）。cabFront・cabBack はその端が運転台
const layouts = new Map();
function sideLayout(L, cabFront, cabBack, detail) {
  const key = `${L.toFixed(1)}|${cabFront}|${cabBack}|${detail}`;
  if (layouts.has(key)) return layouts.get(key);
  let out;
  if (!detail) out = { doors: [], wins: [[0.6, L - 0.6]], cabs: [] };
  else {
    const four = L >= 19;
    const n = four ? 4 : 3;
    const pitch = four ? 4.9 : 5.6;
    const doors = Array.from({ length: n }, (_, i) => L / 2 + (i - (n - 1) / 2) * pitch);
    const wins = [];
    const panes = (a0, a1) => {
      const w = a1 - a0;
      if (w < 0.5) return;
      const k = Math.max(1, Math.round(w / 1.3));
      const pw = (w - 0.12 * (k - 1)) / k;
      for (let i = 0; i < k; i++) wins.push([a0 + i * (pw + 0.12), a0 + i * (pw + 0.12) + pw]);
    };
    for (let i = 0; i + 1 < n; i++) panes(doors[i] + DOOR_W / 2 + 0.35, doors[i + 1] - DOOR_W / 2 - 0.35);
    const cabs = [];
    if (cabBack) cabs.push([0.45, 1.05]);
    else panes(0.5, doors[0] - DOOR_W / 2 - 0.35);
    if (cabFront) cabs.push([L - 1.05, L - 0.45]);
    else panes(doors[n - 1] + DOOR_W / 2 + 0.35, L - 0.5);
    out = { doors: doors.map((c) => [c - DOOR_W / 2, c + DOOR_W / 2]), wins, cabs };
  }
  layouts.set(key, out);
  return out;
}

// 車体の面に貼る四角（横 l の面の a0〜a1・高さ h0〜h1。下の色 lo・上の色 hi）
function sidePanel(m, F, l, n, a0, a1, h0, h1, lo, hi = lo) {
  F.put(0, a0, l, h0);
  F.put(1, a1, l, h0);
  F.put(2, a1, l, h1);
  F.put(3, a0, l, h1);
  m.quad(Q, n, lo, hi);
}
// 前・後ろの面に貼る四角（a はその面の位置、横 l0〜l1・高さ h0〜h1）
function endPanel(m, F, a, n, l0, l1, h0, h1, c) {
  F.put(0, a, l0, h0);
  F.put(1, a, l1, h0);
  F.put(2, a, l1, h1);
  F.put(3, a, l0, h1);
  m.quad(Q, n, c);
}

function carBody(m, F, cols) {
  const { L } = F;
  const H = HALF_W;
  F.put(0, 0, H, ROOF);
  F.put(1, L, H, ROOF);
  F.put(2, L, -H, ROOF);
  F.put(3, 0, -H, ROOF);
  m.quad(Q, UP, cols.top);
  sidePanel(m, F, H, F.left, 0, L, FLOOR, ROOF, cols.side);
  sidePanel(m, F, -H, F.right, 0, L, FLOOR, ROOF, cols.side);
  endPanel(m, F, L, F.fwd, -H, H, FLOOR, ROOF, cols.side);
  endPanel(m, F, 0, F.back, -H, H, FLOOR, ROOF, cols.side);
}

// 両わきの扉（車体より少し暗い色）・扉の窓・客室の窓・乗務員扉の窓。窓と扉は車体の面から少し浮かせる（同じ面だとちらつく）
function carSides(m, F, lay, c) {
  for (const sg of [1, -1]) {
    const n = sg > 0 ? F.left : F.right;
    const l1 = sg * (HALF_W + 0.012);
    const l2 = sg * (HALF_W + 0.024);
    for (const [a0, a1] of lay.doors) {
      sidePanel(m, F, l1, n, a0, a1, DOOR[0], DOOR[1], c.door);
      const mid = (a0 + a1) / 2;
      for (const k of [-1, 1]) {
        const cx = mid + (k * DOOR_W) / 4;
        sidePanel(m, F, l2, n, cx - DOOR_WIN / 2, cx + DOOR_WIN / 2, WIN[0], WIN[1] - 0.05, c.winLo, c.winHi);
      }
    }
    for (const [a0, a1] of lay.wins) sidePanel(m, F, l2, n, a0, a1, WIN[0], WIN[1], c.winLo, c.winHi);
    for (const [a0, a1] of lay.cabs) sidePanel(m, F, l2, n, a0, a1, WIN[0], WIN[1], GLASS);
  }
}

// 運転台の面：前の窓・行き先の表示・前照灯（先頭）か尾灯（最後尾）
function cabFace(m, F, front, sign) {
  const a = front ? F.L + 0.02 : -0.02;
  const n = front ? F.fwd : F.back;
  endPanel(m, F, a, n, -1.2, 1.2, CAB_WIN[0], CAB_WIN[1], GLASS);
  endPanel(m, F, a, n, -0.62, 0.62, SIGN[0], SIGN[1], sign);
  const lamp = lit3(front ? HEAD : TAIL);
  endPanel(m, F, a, n, 0.72, 1.18, LAMP[0], LAMP[1], lamp);
  endPanel(m, F, a, n, -1.18, -0.72, LAMP[0], LAMP[1], lamp);
}

// 先頭：前照灯のにじみ（昼もついている）と、夜は線路を照らす光
function headLights(glow, F, r, sf, g) {
  const k = 0.35 + 0.65 * g;
  for (const l of [0.95, -0.95]) glow.sprite(F.at(F.L + 0.12, l, (LAMP[0] + LAMP[1]) / 2), 0.8, HEAD.map((v) => v * k), 1.6, 0.5);
  if (g <= 0.05) return;
  glow.sprite(F.at(F.L + 0.3, 0, 1.75), 4.5, HEAD.map((v) => v * 0.25 * g), 0, 1.2);
  const c = HEAD.map((v) => v * 0.5 * g);
  let prev = null;
  for (let k2 = 0; k2 <= 8; k2++) {
    const s = sf + (BEAM * k2) / 8;
    if (s > r.len || tunnelAt(r, s) || !nearGround(r, s)) break;
    const p = pointAt(r, s);
    const q0 = pointAt(r, Math.max(0, s - 1));
    const q1 = pointAt(r, Math.min(r.len, s + 1));
    const ul = Math.hypot(q1[0] - q0[0], q1[1] - q0[1]) || 1;
    const ux = (q1[0] - q0[0]) / ul;
    const uy = (q1[1] - q0[1]) / ul;
    const w = 1.3 + (2.8 * k2) / 8; // 先へ行くほど広がる
    const z = heightAt(r, s) + 0.25;
    const A = worldOf([p[0] - uy * w, p[1] + ux * w]);
    const B = worldOf([p[0] + uy * w, p[1] - ux * w]);
    const cur = { A: [A[0], A[1], z], B: [B[0], B[1], z], v: k2 / 8 };
    if (prev) glow.quad([prev.A, prev.B, cur.B, cur.A], [[-1, prev.v], [1, prev.v], [1, cur.v], [-1, cur.v]], 1, c);
    prev = cur;
  }
}

// 最後尾：尾灯のにじみ
function tailLights(glow, F, g) {
  const k = 0.3 + 0.55 * g;
  for (const l of [0.95, -0.95]) glow.sprite(F.at(-0.12, l, (LAMP[0] + LAMP[1]) / 2), 0.6, TAIL.map((v) => v * k), 1.3, 0.5);
  if (g > 0.05) glow.sprite(F.at(-0.3, 0, 1.7), 2.6, TAIL.map((v) => v * 0.2 * g), 0, 1);
}

// 夜、窓あかりが車両の両わきの地面に落ちる光
function windowSpill(glow, F, g) {
  const c = ROOM_HI.map((v) => v * 0.3 * g);
  for (const sg of [1, -1]) {
    const l0 = sg * (HALF_W + 0.05);
    const l1 = sg * (HALF_W + 2.8);
    glow.quad([F.at(0.3, l0, 0.2), F.at(F.L - 0.3, l0, 0.2), F.at(F.L - 0.3, l1, 0.2), F.at(0.3, l1, 0.2)], [[0, 0], [0, 1], [1, 1], [1, 0]], 2, c);
  }
}

/**
 * いまの列車の形。トンネルの中（車両のまん中がトンネルの中）は別にして、透かして描けるようにする。
 * glow（0〜1。夜の明るさ＝campus3dSky.js の lamp）：窓は昼はガラス、夜は客室のあかり。zoom は窓をどこまで細かく作るか。
 * reuse なら入れ物を使い回す（毎フレーム描くとき。結果は次に作るまでのあいだだけ使える）。bounds（[西, 南, 東, 北]）が
 * あれば、その外の列車は作らない（画面に見えている範囲。列車の長さより広く余白をとる）
 * @returns { surface, tunnel（Mesh の結果と同じ形）, glow（GlowMesh の結果：前照灯・尾灯のにじみ、線路と地面に落ちる光） }
 */
export function trainMesh(prep, trains, glow = 0, { zoom = 18, reuse = false, bounds = null } = {}) {
  const surface = reuse ? POOL.surface : new FastMesh();
  const tunnel = reuse ? POOL.tunnel : new FastMesh();
  surface.n = 0;
  tunnel.n = 0;
  const light = new GlowMesh();
  const g = Math.min(1, Math.max(0, glow));
  const night = g > 0.05;
  const detail = zoom >= DETAIL_ZOOM;
  const winLo = night ? lit3(mix3(GLASS_DIM, ROOM_LO, g)) : GLASS;
  const winHi = night ? lit3(mix3(GLASS_DIM, ROOM_HI, g)) : GLASS;
  const sign = lit3(mix3(SIGN_DAY, SIGN_NIGHT, g));
  const [x0, y0] = bounds ? toXY([bounds[0], bounds[1]]) : [-Infinity, -Infinity];
  const [x1, y1] = bounds ? toXY([bounds[2], bounds[3]]) : [Infinity, Infinity];
  for (const t of trains) {
    const r = prep.routes[t.route];
    if (bounds) {
      const [cx, cy] = pointAt(r, Math.min(r.len, Math.max(0, t.s)));
      if (cx < x0 - 300 || cx > x1 + 300 || cy < y0 - 300 || cy > y1 + 300) continue;
    }
    const total = t.cars * t.carLen + (t.cars - 1) * GAP;
    const head = t.s + total / 2;
    const door = [...r.cols.side.slice(0, 3).map((v) => v * 0.8), 1];
    for (let i = 0; i < t.cars; i++) {
      const sf = head - i * (t.carLen + GAP);
      const sb = sf - t.carLen;
      if (sb < 0 || sf > r.len) continue;
      const F = carFrame(pointAt(r, sb), pointAt(r, sf), heightAt(r, sb), heightAt(r, sf));
      const inTunnel = tunnelAt(r, (sf + sb) / 2);
      const m = inTunnel ? tunnel : surface;
      const lead = i === 0;
      const last = i === t.cars - 1;
      carBody(m, F, r.cols);
      carSides(m, F, sideLayout(F.L, lead, last, detail), { winLo, winHi, door });
      if (lead) cabFace(m, F, true, sign);
      if (last) cabFace(m, F, false, sign);
      if (inTunnel) continue;
      if (lead) headLights(light, F, r, sf, g);
      if (last) tailLights(light, F, g);
      if (night && nearGround(r, sb) && nearGround(r, sf)) windowSpill(light, F, g);
    }
  }
  return { surface: surface.result(), tunnel: tunnel.result(), glow: light.result() };
}

// 線路の範囲（[西, 南, 東, 北]）。標高を読んでおくのに使う
export function trackBounds(prep) {
  let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
  for (const r of prep.routes) for (const p of r.xy) {
    const [lng, lat] = toLngLat(p);
    w = Math.min(w, lng); e = Math.max(e, lng); s = Math.min(s, lat); n = Math.max(n, lat);
  }
  return [w, s, e, n];
}
