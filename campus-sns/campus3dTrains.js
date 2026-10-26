// キャンパスの3D地図を走る電車（東急目黒線・大井町線・池上線・東横線）。データは public/map-3d/trains.json（scripts/gen-campus-trains.mjs）。
// 線路は OpenStreetMap の路線、ダイヤは駅探の時刻表から作った「基準の駅（大岡山・石川台・自由が丘）の前後の駅の時刻（分）」。位置は時刻表どおり
// （遅れは反映しない）。駅と駅のあいだは「加速 → 一定 → 減速」で走り、駅には少し止まる。区間の端の外から入ってくる電車・
// 外へ出ていく電車は、一定の速さで出入りする。描くのは campus3dLayer.js の createTrainsLayer（トンネルの中は透かして薄く）
import { jstNow, todayDayType } from "../lib/api/jp-calendar.js";
import { cumulative, toLngLat, toXY } from "./campus3dFeatures.js";
import { Mesh } from "./campus3dMesh.js";

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
// 試すとき：window.__trainClock = { at: "08:15", day: "weekday", speed: 1 } で、その時刻から進める
export function serviceClock(nowMs = Date.now()) {
  const o = typeof window !== "undefined" ? window.__trainClock : null;
  if (o?.at) {
    const [h, m] = String(o.at).split(":").map(Number);
    if (o.since == null) o.since = nowMs;
    return { day: o.day || "weekday", sec: ((h < 4 ? h + 24 : h) * 60 + m) * 60 + ((nowMs - o.since) / 1000) * (o.speed || 1) };
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
    for (let i = 0; i < n; i++) {
      let sum = 0, cnt = 0;
      for (let k = Math.max(0, i - W); k <= Math.min(n - 1, i + W); k++) { sum += raw[k]; cnt++; }
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
const heightAt = (r, s) => {
  if (!r.hz) return 30;
  const f = Math.min(r.hz.length - 1, Math.max(0, s / STEP));
  const i = Math.floor(f);
  const j = Math.min(r.hz.length - 1, i + 1);
  return r.hz[i] + (r.hz[j] - r.hz[i]) * (f - i);
};

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

// 車両の箱。トンネルの中（車両のまん中がトンネルの中）は別にして、透かして描けるようにする
// glow（0〜1）：夜の窓あかり。車体の両わきに、床から 1.1〜2.1m の帯を光らせる
const WIN_LO = 1.1;
const WIN_HI = 2.1;
export function trainMesh(prep, trains, glow = 0) {
  const surface = new Mesh(), tunnel = new Mesh();
  const win = [1, 0.86, 0.55, 0.5]; // アルファ 0.5 の面はシェーダーで光を受けない（そのままの明るさ）
  for (const t of trains) {
    const r = prep.routes[t.route];
    const total = t.cars * t.carLen + (t.cars - 1) * GAP;
    const head = t.s + total / 2;
    for (let i = 0; i < t.cars; i++) {
      const sf = head - i * (t.carLen + GAP);
      const sb = sf - t.carLen;
      if (sb < 0 || sf > r.len) continue;
      const pf = pointAt(r, sf), pb = pointAt(r, sb);
      const ux = pf[0] - pb[0], uy = pf[1] - pb[1];
      const l = Math.hypot(ux, uy) || 1;
      const nx = (-uy / l) * HALF_W, ny = (ux / l) * HALF_W; // 進む向きの左
      const L = [[pb[0] + nx, pb[1] + ny], [pf[0] + nx, pf[1] + ny]];
      const R = [[pb[0] - nx, pb[1] - ny], [pf[0] - nx, pf[1] - ny]];
      const zb = heightAt(r, sb), zf = heightAt(r, sf);
      const m = tunnelAt(r, (sf + sb) / 2) ? tunnel : surface;
      m.prism(L, R, [zb + FLOOR, zf + FLOOR], [zb + ROOF, zf + ROOF], r.cols);
      if (glow > 0.05) {
        // 窓の帯：車体の面から 3cm 外に、両わきへ（車体の色から窓あかりの色へ、glow の分だけ）
        const c = [0, 1, 2].map((k) => r.cols.side[k] + (win[k] - r.cols.side[k]) * glow).concat(0.5);
        const ox = (nx / HALF_W) * 0.03, oy = (ny / HALF_W) * 0.03;
        const zl = [zb + FLOOR + WIN_LO, zf + FLOOR + WIN_LO], zh = [zb + FLOOR + WIN_HI, zf + FLOOR + WIN_HI];
        for (const sg of [1, -1]) {
          const S = sg > 0 ? L : R;
          const A = S.map((p) => [p[0] + ox * sg, p[1] + oy * sg]);
          m.quad([[A[0], zl[0]], [A[1], zl[1]], [A[1], zh[1]], [A[0], zh[0]]], [sg * nx / HALF_W, sg * ny / HALF_W, 0], c);
        }
      }
    }
  }
  return { surface: surface.result(), tunnel: tunnel.result() };
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
