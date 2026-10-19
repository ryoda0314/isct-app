// キャンパスナビの3D表示に手で足す構造物（平地・坂道・階段・壁・橋・建物の通り抜け）のデータと、形の計算。
// データ: public/map-3d/features.json（/editor/3d で編集する）。座標は [経度, 緯度]、長さ・高さは m。
//   { id, type, name, coords: [[lng, lat], ...], osm?（取り込んだ OSM の way） } に、種類ごとに
//   terrace : coords は囲む範囲（3点以上、閉じない）。elev（平らにする標高。null は中の元の地面の平均）, side（ふちの斜面の幅。0 は垂直に切って壁）
//   slope   : 坂道。width, z（各点の高さ。平地を入れた地面から ±m、null は自動）, side（両わきの斜面の幅。0 は垂直な壁）,
//             flat（区間ごとの踊り場＝平らにするか）, corner（曲がり角を幅のぶん平らにして踊り場にするか）,
//             base（土台の横幅＝両わきの壁・路肩を含む。なければ自動：壁なら 幅＋WALL_T×2、斜面なら幅）,
//             widths（各点の横幅。null は、両端なら width、途中は前後の決まった点のあいだを距離で直線に結ぶ＝だんだん広がる）,
//             shifts（各点の帯の中心のずれ。中心線から左へ m、右はマイナス。null は widths と同じ決まりで、両端は 0。
//             上底を横にずらした台形など、中心線に対して左右が同じでない形）,
//             walls（false なら両わき・両端に壁を立てない。平地の中に置いて、平地の壁を両わきの壁にするときなど）
//   stairs  : slope と同じ（width, z, side, flat, corner, base）に riser（一段の高さ）, rails（手すりの位置。段の幅に対する割合で、
//             0 が左の端・1 が右の端（点1から点2を見て）。0 未満・1 より大は土台の上）。坂の面にそって riser ごとに段を刻む。
//             steps（区間ごとの段数）があれば、段数は手で決めたもの。蹴上げはどの段も同じ（高さの差 ÷ 段数の合計）。
//             段数は蹴上げの数。踊り場につながる流れは両端が蹴上げで、踏面は 段数−1 枚（stairFlights）
//   wall    : height（高いほうの地面から）, thickness
//   bridge  : width, z（各点の床の高さ。真下の地面から、null は自動）, thickness, railing, piers, surface（walk / street / rail）
//   passage : width, height（天井の高さ）。建物の外から外へ引いた中心線に沿って、建物に穴をあける
// z が null の点は、両端なら地面の高さ、途中なら前後の決まった点のあいだを距離で直線に結ぶ。
// 地面は「元の地面 → 平地 → 坂道・階段」の順に重ねて作る（坂道・階段の高さは平地を入れたあとの地面から）
// DOM も MapLibre も使わない（3D表示・エディタ・テストから共通で使う）
import { CAMPUS_CENTER } from "./hooks/useLocationSharing.js";

export const FEATURES_URL = "/map-3d/features.json";
export const CANDIDATES_URL = "/map-3d/osm-candidates.json";
export const FEATURE_TYPES = ["terrace", "slope", "stairs", "wall", "bridge", "passage"];
export const TYPE_LABEL = { terrace: "平地", slope: "坂道", stairs: "階段", wall: "壁", bridge: "橋", passage: "通り抜け" };
export const SURFACE_LABEL = { walk: "歩道", street: "車道", rail: "線路" };
// 地面の形を変える（標高タイルに焼き込む）種類
export const burnsGround = (f) => f.type === "terrace" || f.type === "slope" || f.type === "stairs";
// 帯（中心線と幅）でなく、囲む範囲（多角形）の種類
export const isArea = (type) => type === "terrace";

// 種類ごとの既定値（m）
export const DEFAULTS = {
  terrace: { elev: null, side: 0 },
  slope: { width: 4, side: 0, corner: false },
  stairs: { width: 2, side: 0, riser: 0.16, rails: [0, 1], corner: true },
  wall: { height: 1.2, thickness: 0.3 },
  bridge: { width: 4, thickness: 0.8, railing: true, piers: false, surface: "walk" },
  passage: { width: 4, height: 3 },
};
// 入力できる範囲（m）
export const RANGE = {
  height: [0.1, 40], thickness: [0.05, 5], width: [0.5, 60], side: [0, 30], riser: [0.08, 0.4], z: [-30, 60], elev: [-50, 200], base: [0.5, 80], shift: [-30, 30],
};
const clampTo = (v, [lo, hi], dflt) => (Number.isFinite(+v) ? Math.min(hi, Math.max(lo, +v)) : dflt);

// ── 平面の座標（キャンパスの中心からの東・北 m）──
const DEG = Math.PI / 180;
const LNG0 = CAMPUS_CENTER.lng;
const LAT0 = CAMPUS_CENTER.lat;
const KX = 111320 * Math.cos(LAT0 * DEG);
const KY = 110950;
export const toXY = ([lng, lat]) => [(lng - LNG0) * KX, (lat - LAT0) * KY];
export const toLngLat = ([x, y]) => [LNG0 + x / KX, LAT0 + y / KY];

// ── データの読み込み・書き出し ──
const round7 = (v) => Math.round(v * 1e7) / 1e7;
const round2 = (v) => Math.round(v * 100) / 100;
export const newId = (type) => `${type[0]}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

// 1つの構造物を整える（足りない値は既定値、範囲外は範囲内に）。使えないものは null
export function normalizeFeature(f) {
  if (!f || !FEATURE_TYPES.includes(f.type) || !Array.isArray(f.coords)) return null;
  const coords = f.coords
    .filter((c) => Array.isArray(c) && Number.isFinite(+c[0]) && Number.isFinite(+c[1]))
    .map((c) => [round7(+c[0]), round7(+c[1])]);
  // 範囲は閉じずに持つ（最後の点が最初と同じなら外す）
  if (isArea(f.type) && coords.length > 1 && coords[0][0] === coords[coords.length - 1][0] && coords[0][1] === coords[coords.length - 1][1]) coords.pop();
  if (coords.length < (isArea(f.type) ? 3 : 2)) return null;
  const d = DEFAULTS[f.type];
  const out = { id: typeof f.id === "string" && f.id ? f.id : newId(f.type), type: f.type, name: typeof f.name === "string" ? f.name.slice(0, 80) : "", coords };
  if (f.osm) out.osm = String(f.osm);
  if (f.type === "terrace") {
    out.elev = f.elev != null && Number.isFinite(+f.elev) ? round2(clampTo(f.elev, RANGE.elev, 0)) : null;
    out.side = round2(clampTo(f.side, RANGE.side, d.side));
  } else if (f.type === "wall") {
    out.height = round2(clampTo(f.height, RANGE.height, d.height));
    out.thickness = round2(clampTo(f.thickness, RANGE.thickness, d.thickness));
  } else if (f.type === "passage") {
    out.width = round2(clampTo(f.width, RANGE.width, d.width));
    out.height = round2(clampTo(f.height, RANGE.height, d.height));
  } else {
    out.width = round2(clampTo(f.width, RANGE.width, d.width));
    out.z = coords.map((_, i) => (f.z && f.z[i] != null && Number.isFinite(+f.z[i]) ? round2(clampTo(f.z[i], RANGE.z, 0)) : null));
    if (burnsGround(f)) {
      // 以前の形（edge: "wall" / "blend" と blend）も読む
      const side = f.side != null ? f.side : f.edge === "wall" ? 0 : f.blend;
      out.side = round2(clampTo(side, RANGE.side, d.side));
      out.flat = coords.slice(1).map((_, i) => !!(f.flat && f.flat[i]));
      out.corner = f.corner == null ? d.corner : !!f.corner;
      // 土台の横幅（帯の幅より狭くはしない）。空なら自動
      if (f.base != null && f.base !== "" && Number.isFinite(+f.base)) out.base = round2(clampTo(f.base, [out.width, RANGE.base[1]], out.width));
      // 各点の横幅（どれかに数があるときだけ持つ）
      const wOk = (v) => v != null && v !== "" && Number.isFinite(+v);
      if (Array.isArray(f.widths) && f.widths.some(wOk)) out.widths = coords.map((_, i) => (wOk(f.widths[i]) ? round2(clampTo(f.widths[i], RANGE.width, out.width)) : null));
      // 壁を立てないとき（既定は立てる）
      if (f.walls === false) out.walls = false;
      // 各点の中心のずれ（どれかに数があるときだけ持つ）
      if (Array.isArray(f.shifts) && f.shifts.some(wOk)) out.shifts = coords.map((_, i) => (wOk(f.shifts[i]) ? round2(clampTo(f.shifts[i], RANGE.shift, 0)) : null));
      if (f.type === "stairs") {
        out.riser = round2(clampTo(f.riser, RANGE.riser, d.riser));
        // 手すり（以前の railing: true/false も読む）。12本まで。並べ替えない（エディタで入力中の行がずれないように）
        const rails = Array.isArray(f.rails) ? f.rails : f.railing === false ? [] : d.rails;
        out.rails = rails.map((r) => +r).filter(Number.isFinite).map((r) => Math.round(Math.min(3, Math.max(-2, r)) * 1000) / 1000).slice(0, 12);
        // 段数を手で決めたとき：段の区間は 1〜200 段、踊り場は null
        if (Array.isArray(f.steps) && f.steps.some((v) => +v >= 1)) {
          out.steps = coords.slice(1).map((_, i) => (out.flat[i] || !(+f.steps[i] >= 1) ? null : Math.min(200, Math.round(+f.steps[i]))));
        }
      }
    } else {
      out.thickness = round2(clampTo(f.thickness, RANGE.thickness, d.thickness));
      out.railing = f.railing == null ? d.railing : !!f.railing;
      out.piers = f.piers == null ? d.piers : !!f.piers;
      out.surface = SURFACE_LABEL[f.surface] ? f.surface : d.surface;
    }
  }
  return out;
}

export function parseFeatures(json) {
  const list = Array.isArray(json) ? json : json && Array.isArray(json.features) ? json.features : [];
  const seen = new Set();
  return list.map(normalizeFeature).filter((f) => f && !seen.has(f.id) && seen.add(f.id));
}
export const serializeFeatures = (features) => `${JSON.stringify({ version: 1, features: features.map(normalizeFeature).filter(Boolean) }, null, 1)}\n`;

// 新しく描いた構造物（座標だけ）を既定値で作る
export const createFeature = (type, coords, extra = {}) => normalizeFeature({ type, coords, ...DEFAULTS[type], ...extra, id: newId(type) });

// ── 折れ線の計算（平面の m 座標）──
export function cumulative(xy) {
  const c = [0];
  for (let i = 1; i < xy.length; i++) c.push(c[i - 1] + Math.hypot(xy[i][0] - xy[i - 1][0], xy[i][1] - xy[i - 1][1]));
  return c;
}

// 距離 s の位置の値（vals は頂点ごとの値）
export function lerpAlong(cum, vals, s) {
  const n = cum.length;
  if (s <= 0) return vals[0];
  if (s >= cum[n - 1]) return vals[n - 1];
  let i = 1;
  while (cum[i] < s) i++;
  const k = (s - cum[i - 1]) / (cum[i] - cum[i - 1] || 1);
  return vals[i - 1] + (vals[i] - vals[i - 1]) * k;
}

// 頂点ごとの高さ（標高 m）。z[i] が数なら「その点の地面 + z[i]」、空なら
// 両端は地面、途中は前後の決まった点のあいだを距離で直線に結ぶ
export function vertexElevations(coords, z, groundAt) {
  const n = coords.length;
  const cum = cumulative(coords.map(toXY));
  const E = new Array(n).fill(null);
  for (let i = 0; i < n; i++) {
    if (z && typeof z[i] === "number") E[i] = groundAt(coords[i]) + z[i];
    else if (i === 0 || i === n - 1) E[i] = groundAt(coords[i]);
  }
  for (let i = 1; i < n - 1; i++) {
    if (E[i] != null) continue;
    let b = i + 1;
    while (E[b] == null) b++;
    E[i] = E[i - 1] + ((E[b] - E[i - 1]) * (cum[i] - cum[i - 1])) / (cum[b] - cum[i - 1] || 1);
  }
  return { cum, elev: E };
}

/**
 * 坂道・階段（と橋）の高さの折れ線。頂点に加えて、曲がり角の踊り場のふち（角から ±半幅）にも点を置く。
 * 踊り場（flat の区間と、corner なら曲がり角）は平らにし、決まった点どうしの高さの差は、残りの区間に長さの割合で割り振る
 * （どの段の区間も同じ勾配になる）。決まった点は、z のある頂点（地面 + z）と両端（地面）
 * @returns { xy, cum（頂点の中心線に沿った距離）, s・e（折れ線の点の距離と標高）, flat（折れ線の区間ごとに平らか）, elev（頂点の標高） }
 */
export function pathProfile(f, groundAt) {
  const xy = f.coords.map(toXY);
  const cum = cumulative(xy);
  const n = xy.length;
  const fixed = f.coords.map((c, i) => (f.z && typeof f.z[i] === "number" ? groundAt(c) + f.z[i] : i === 0 || i === n - 1 ? groundAt(c) : null));
  const knots = cum.map((s, v) => ({ s, v }));
  const zones = []; // 曲がり角の踊り場 [s0, s1]
  if (f.corner && f.width) {
    const wv = vertexWidths(f);
    const cv = vertexShifts(f);
    for (let i = 1; i < n - 1; i++) {
      const ax = xy[i][0] - xy[i - 1][0];
      const ay = xy[i][1] - xy[i - 1][1];
      const bx = xy[i + 1][0] - xy[i][0];
      const by = xy[i + 1][1] - xy[i][1];
      const la = Math.hypot(ax, ay);
      const lb = Math.hypot(bx, by);
      if (!la || !lb || (ax * bx + ay * by) / (la * lb) > Math.cos(25 * DEG)) continue; // ほぼまっすぐなら角ではない
      const d0 = Math.min(wv[i] / 2 + Math.abs(cv[i]), la * 0.4);
      const d1 = Math.min(wv[i] / 2 + Math.abs(cv[i]), lb * 0.4);
      knots.push({ s: cum[i] - d0 }, { s: cum[i] + d1 });
      zones.push([cum[i] - d0, cum[i] + d1]);
    }
  }
  knots.sort((p, q) => p.s - q.s);
  const S = knots.map((k) => k.s);
  const segOf = (s) => {
    let i = 0;
    while (i < n - 2 && cum[i + 1] <= s) i++;
    return i;
  };
  const seg = S.slice(0, -1).map((s0, k) => segOf((s0 + S[k + 1]) / 2)); // 折れ線の区間が中心線のどの辺か
  const flat = seg.map((g, k) => {
    const m = (S[k] + S[k + 1]) / 2;
    return !!(f.flat && f.flat[g]) || zones.some(([a, b]) => m > a && m < b);
  });
  // 辺ごとの、平らでない長さ
  const segRun = new Array(Math.max(1, n - 1)).fill(0);
  seg.forEach((g, k) => { if (!flat[k]) segRun[g] += S[k + 1] - S[k]; });
  // 高さの差の割り振り方：ふつうは長さの割合（どこも同じ勾配）。階段で段数を手で決めたときは段数の割合（どの段も同じ蹴上げ）
  const steps = f.type === "stairs" && Array.isArray(f.steps) && f.steps.some((v) => v >= 1) ? f.steps : null;
  const weight = (k) => {
    if (flat[k]) return 0;
    const len = S[k + 1] - S[k];
    return steps ? (len / (segRun[seg[k]] || 1)) * (steps[seg[k]] || segRun[seg[k]] / 0.3) : len;
  };
  const E = knots.map((k) => (k.v != null ? fixed[k.v] : null));
  for (let a = 0, j = 1; j < S.length; j++) {
    if (E[j] == null) continue;
    let run = 0;
    for (let k = a; k < j; k++) run += weight(k);
    const total = S[j] - S[a] || 1;
    let acc = 0;
    for (let k = a; k < j - 1; k++) {
      acc += run > 1e-9 ? weight(k) / run : (S[k + 1] - S[k]) / total; // ぜんぶ平らなのに高さが違うときは、まっすぐ結ぶ
      E[k + 1] = E[a] + (E[j] - E[a]) * acc;
    }
    a = j;
  }
  const elev = cum.map((_, v) => E[knots.findIndex((k) => k.v === v)]);
  return { xy, cum, s: S, e: E, flat, seg, segRun, steps, elev };
}

// 辺 i の長さを L m にする：その辺の向きのまま、うしろの点をまとめてずらす
export function withSegmentLength(coords, i, L) {
  const xy = coords.map(toXY);
  const dx = xy[i + 1][0] - xy[i][0];
  const dy = xy[i + 1][1] - xy[i][1];
  const cur = Math.hypot(dx, dy);
  if (!(cur > 1e-6) || !(L > 0)) return coords;
  const mx = (dx / cur) * (L - cur);
  const my = (dy / cur) * (L - cur);
  return coords.map((c, k) => (k <= i ? c : toLngLat([xy[k][0] + mx, xy[k][1] + my])));
}

/**
 * 段（坂）の区間のうち、高さの差が everyRise m を超えるものを同じ高さずつに分け、あいだに長さ len m の踊り場を入れた形を返す
 * （踊り場は区間の長さの半分まで）。頂点の z・横幅は残し、足した点は自動（高さも横幅も前後のあいだを結ぶ）
 */
export function withLandings(f, groundAt, everyRise, len) {
  const P = pathProfile({ ...f, corner: false }, groundAt);
  const coords = [f.coords[0]];
  const z = [f.z?.[0] ?? null];
  const flat = [];
  const widths = f.widths ? [f.widths[0] ?? null] : null; // 足した点の横幅・ずれは空き（前後のあいだを結ぶ）
  const shifts = f.shifts ? [f.shifts[0] ?? null] : null;
  let added = 0;
  for (let i = 0; i < f.coords.length - 1; i++) {
    const L = P.cum[i + 1] - P.cum[i];
    const k = f.flat?.[i] ? 1 : Math.ceil(Math.abs(P.elev[i + 1] - P.elev[i]) / everyRise - 0.01); // ちょうど割り切れるときに1つ多くならないよう少し余裕
    if (k > 1 && L > 0) {
      const d = Math.min(len, (L * 0.5) / (k - 1));
      const fl = (L - d * (k - 1)) / k;
      const [ax, ay] = P.xy[i];
      const [bx, by] = P.xy[i + 1];
      const at = (s) => toLngLat([ax + ((bx - ax) * s) / L, ay + ((by - ay) * s) / L]);
      for (let j = 1, pos = 0; j < k; j++) {
        pos += fl;
        coords.push(at(pos)); z.push(null); flat.push(false); widths?.push(null); shifts?.push(null); // ここまで段
        pos += d;
        coords.push(at(pos)); z.push(null); flat.push(true); widths?.push(null); shifts?.push(null); // ここまで踊り場
        added++;
      }
    }
    coords.push(f.coords[i + 1]);
    z.push(f.z?.[i + 1] ?? null);
    flat.push(!!f.flat?.[i]);
    widths?.push(f.widths[i + 1] ?? null);
    shifts?.push(f.shifts[i + 1] ?? null);
  }
  return { coords, z, flat, added, widths, shifts };
}

// 点を細かく足す（各辺を maxStep m 以下に）。元の頂点は残し、各点の距離 s も返す
export function densify(xy, maxStep) {
  const pts = [xy[0]];
  const s = [0];
  for (let i = 1; i < xy.length; i++) {
    const [ax, ay] = xy[i - 1];
    const [bx, by] = xy[i];
    const L = Math.hypot(bx - ax, by - ay);
    const n = Math.max(1, Math.ceil(L / maxStep));
    for (let k = 1; k <= n; k++) {
      pts.push([ax + ((bx - ax) * k) / n, ay + ((by - ay) * k) / n]);
      s.push(s[s.length - 1] + L / n);
    }
  }
  return { pts, s };
}

// 点ごとの値：arr の数か、両端は endValue、途中の空きは前後の決まった点のあいだを距離で直線に結ぶ
function perVertex(f, arr, endValue) {
  const n = f.coords.length;
  const V = f.coords.map((_, i) => (arr && typeof arr[i] === "number" ? arr[i] : i === 0 || i === n - 1 ? endValue : null));
  if (!V.some((v) => v == null)) return V;
  const cum = cumulative(f.coords.map(toXY));
  for (let i = 1; i < n - 1; i++) {
    if (V[i] != null) continue;
    let b = i + 1;
    while (V[b] == null) b++;
    V[i] = V[i - 1] + ((V[b] - V[i - 1]) * (cum[i] - cum[i - 1])) / (cum[b] - cum[i - 1] || 1);
  }
  return V;
}
// 坂道・階段の各点の横幅（空きは両端なら width）と、帯の中心のずれ（中心線から左へ m。空きは両端なら 0）
export const vertexWidths = (f) => perVertex(f, f.widths, f.width);
export const vertexShifts = (f) => perVertex(f, f.shifts, 0);

// 折れ線を左（進む向きの左）へ d m ずらした線（d は数か、点ごとの数の並び）。角は留め継ぎ（とがりすぎたら抑える）
export function offsetLine(xy, d) {
  const dd = Array.isArray(d) ? (i) => d[i] : () => d;
  const n = xy.length;
  const nrm = [];
  for (let i = 0; i < n - 1; i++) {
    const dx = xy[i + 1][0] - xy[i][0];
    const dy = xy[i + 1][1] - xy[i][1];
    const L = Math.hypot(dx, dy) || 1;
    nrm.push([-dy / L, dx / L]);
  }
  return xy.map((p, i) => {
    const a = nrm[Math.max(0, i - 1)];
    const b = nrm[Math.min(n - 2, i)];
    let mx = a[0] + b[0];
    let my = a[1] + b[1];
    const ml = Math.hypot(mx, my);
    if (ml < 1e-6) return [p[0] + a[0] * dd(i), p[1] + a[1] * dd(i)];
    mx /= ml;
    my /= ml;
    const k = Math.min(3, 1 / Math.max(1e-3, mx * a[0] + my * a[1])); // 留め継ぎの長さ（3倍まで）
    return [p[0] + mx * dd(i) * k, p[1] + my * dd(i) * k];
  });
}

// 帯（中心線 xy・半幅 hw・中心のずれ ctr）の外側までの距離 D と、中心線に沿った位置 s、そこでの半幅 hw と帯の横の範囲 lo〜hi
// （中心線から左へ m）。帯の中なら D=0。hw・ctr は数か、点ごとの並び（だんだん広がる帯・横にずれた帯）。
// 両端は平らに切り、途中の角は丸く見る。角の丸みは、角の外側のすき間（前の辺の終わりより先で、次の辺の始まりより手前）だけに使う。
// ほかでは、その点を横に見る辺（まっすぐの距離）で決める（丸みを広く使うと、最初・最後の辺が半幅より短いときに帯が端の先へ
// はみ出し、点ごとに幅が違うと広い点の丸みがせまい辺の横へはみ出して、帯が描いた形より太くなる）
export function stripDistance(xy, cum, hw, p, ctr = 0) {
  let best = null;
  const at = (arr, i, tc) => (Array.isArray(arr) ? arr[i] + (arr[i + 1] - arr[i]) * tc : arr);
  const last = xy.length - 2;
  // 辺ごとの、点の位置（辺の始まり 0〜終わり 1）。長さのない辺は null
  const T = [];
  for (let i = 0; i <= last; i++) {
    const dx = xy[i + 1][0] - xy[i][0];
    const dy = xy[i + 1][1] - xy[i][1];
    const L2 = dx * dx + dy * dy;
    T.push(L2 < 1e-9 ? null : ((p[0] - xy[i][0]) * dx + (p[1] - xy[i][1]) * dy) / L2);
  }
  const prevT = (i) => { for (let k = i - 1; k >= 0; k--) if (T[k] != null) return T[k]; return null; };
  const nextT = (i) => { for (let k = i + 1; k <= last; k++) if (T[k] != null) return T[k]; return null; };
  let first = 0;
  while (first < last && T[first] == null) first++;
  let end = last;
  while (end > 0 && T[end] == null) end--;
  for (let i = 0; i <= last; i++) {
    const t = T[i];
    if (t == null) continue;
    const [ax, ay] = xy[i];
    const dx = xy[i + 1][0] - ax;
    const dy = xy[i + 1][1] - ay;
    const L = Math.hypot(dx, dy);
    const tc = Math.min(1, Math.max(0, t));
    const h = at(hw, i, tc);
    const c = at(ctr, i, tc);
    const lat = (dx * (p[1] - ay) - dy * (p[0] - ax)) / L; // 中心線から左へ（右はマイナス）
    let D;
    let raw;
    if ((i === first && t < 0) || (i === end && t > 1)) {
      const over = t < 0 ? -t * L : (t - 1) * L;
      D = Math.hypot(Math.max(0, lat - (c + h), c - h - lat), over);
      raw = Math.abs(lat) + over;
    } else if (t >= 0 && t <= 1) {
      D = Math.max(0, lat - (c + h), c - h - lat);
      raw = Math.abs(lat);
    } else {
      // 角の丸みは、角の外側のすき間だけ。丸みの半径は、その側のふちまで
      if (t < 0 && !(prevT(i) > 1)) continue;
      if (t > 1 && !(nextT(i) < 0)) continue;
      const dist = Math.hypot(p[0] - (ax + dx * tc), p[1] - (ay + dy * tc));
      D = Math.max(0, dist - (lat >= 0 ? c + h : h - c));
      raw = dist;
    }
    if (!best || D < best.D - 1e-9 || (Math.abs(D - best.D) <= 1e-9 && raw < best.raw)) {
      best = { D, raw, s: cum[i] + tc * L, hw: h, lo: c - h, hi: c + h };
    }
  }
  if (!best && T.some((t) => t != null)) {
    // どの決まりにも当たらない点（念のため）：いちばん近い辺の上の点から
    for (let i = 0; i <= last; i++) {
      if (T[i] == null) continue;
      const tc = Math.min(1, Math.max(0, T[i]));
      const [ax, ay] = xy[i];
      const dx = xy[i + 1][0] - ax;
      const dy = xy[i + 1][1] - ay;
      const lateral = Math.hypot(p[0] - (ax + dx * tc), p[1] - (ay + dy * tc));
      const h = at(hw, i, tc);
      const c = at(ctr, i, tc);
      if (!best || lateral < best.raw) best = { D: Math.max(0, lateral - h - Math.abs(c)), raw: lateral, s: cum[i] + tc * Math.hypot(dx, dy), hw: h, lo: c - h, hi: c + h };
    }
  }
  const h0 = Array.isArray(hw) ? hw[0] : hw;
  const c0 = Array.isArray(ctr) ? ctr[0] : ctr;
  return best || { D: Infinity, raw: Infinity, s: 0, hw: h0, lo: c0 - h0, hi: c0 + h0 };
}

const bboxOf = (xy, pad) => {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of xy) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  return [x0 - pad, y0 - pad, x1 + pad, y1 + pad];
};
const inBox = (b, x, y) => x >= b[0] && x <= b[2] && y >= b[1] && y <= b[3];

// すべての構造物を囲む範囲 [西, 南, 東, 北]（読み込む標高タイルを決めるため）。pad は m
export function featuresBounds(features, pad = 40) {
  const xy = features.flatMap((f) => f.coords.map(toXY));
  if (!xy.length) return null;
  const [x0, y0, x1, y1] = bboxOf(xy, pad);
  const [w, s] = toLngLat([x0, y0]);
  const [e, n] = toLngLat([x1, y1]);
  return [w, s, e, n];
}

// 垂直に切るとき（side 0）の壁の厚さ（m）。地面の段差は壁の中（ふちから外へ 0〜WALL_T）に置いて隠す。
// ふちちょうどに置くと、標高タイルの升目に沿ってぎざぎざになり、地形の補間（前後 0.5〜0.7m）で壁の外へはみ出して見える
export const WALL_T = 1.2;
// 帯・範囲のふちからの距離 d での高さ：inner（中の高さ）から v（外の地面）へ。band が 0 なら壁（厚さ wt）の中で段差にする。
// 補間で高い地面が低い側へはみ出すので、段差は高い側の面に寄せる（中が高ければふち寄り、外が高ければ外寄り）
const edgeBlend = (d, inner, v, band, wt = WALL_T) => {
  if (band > 0) return d >= band ? v : v + (inner - v) * (1 - d / band);
  return d < wt * (inner > v ? 0.25 : 0.75) ? inner : v;
};

// 坂道・階段の土台の横幅（両わきの壁・路肩を含む）。壁（side 0）は既定で両わきに WALL_T ずつ、いちばん細くて 0.1m ずつ。
// 斜面（side > 0）は既定で帯と同じ（路肩なし）
export function baseWidth(f) {
  if (f.walls === false && !(f.side > 0)) return f.width; // 壁を立てない
  if (f.side > 0) return Math.max(f.width, f.base ?? f.width);
  return Math.max(f.width + 0.2, f.base ?? f.width + 2 * WALL_T);
}
// 両わきの壁の厚さ（斜面なら 0）
export const wallThickness = (f) => (f.side > 0 ? 0 : (baseWidth(f) - f.width) / 2);

// ── 壁を立てない階段（walls: false）と平地のふち ──
// 平地のふちのうち、壁なしの階段が横切るところ（帯の中で、両わきのふちの線に沿っていない）は「開いている」：
// 平地はそこに壁を立てず（campus3dMesh.js）、ふちの外も掘らない（地面の段差は階段の段が隠す）。
// 両わきのふちの線から WALL_T 以内で向きが 30°以内なら「沿っている」：平地の壁がそのまま階段の両わきの壁になる
export const isOpenStairs = (f) => f.type === "stairs" && f.walls === false && !(f.side > 0);
const ALONG = Math.cos((30 * Math.PI) / 180);
// 平面の形だけ（高さはいらないので、平地より先に作れる）
export function stairsOpening(f) {
  const xy = f.coords.map(toXY);
  const hwv = vertexWidths(f).map((w) => w / 2);
  const cv = vertexShifts(f);
  return {
    xy, cum: cumulative(xy), hwv, cv,
    sides: [1, -1].map((sg) => offsetLine(xy, hwv.map((h, i) => cv[i] + sg * h))), // 左と右のふちの線
    box: bboxOf(xy, Math.max(...hwv.map((h, i) => h + Math.abs(cv[i]))) + WALL_T),
  };
}
// 点 p（向き dir のふちの上）が、どれかの線に沿っているか
function alongLines(lines, p, dir) {
  return lines.some((ln) => ln.some((a, k) => {
    const b = ln[k + 1];
    if (!b) return false;
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const l2 = dx * dx + dy * dy;
    if (l2 < 1e-9) return false;
    const t = Math.min(1, Math.max(0, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2));
    if (Math.hypot(p[0] - a[0] - dx * t, p[1] - a[1] - dy * t) > WALL_T) return false;
    return Math.abs(dx * dir[0] + dy * dir[1]) / Math.sqrt(l2) >= ALONG;
  }));
}
// ふちの点 p（ふちの向き dir）が、壁なしの階段の通り道で開いているか（opens は stairsOpening の並び）
export function edgeOpen(opens, p, dir) {
  return opens.some((o) => inBox(o.box, p[0], p[1]) && stripDistance(o.xy, o.cum, o.hwv, p, o.cv).D <= 0.01 && !alongLines(o.sides, p, dir));
}

// ── 坂・階段：標高タイルに「焼き込む」形 ──
// baseAt([lng,lat]) は元の地面の高さ。返す burn(x, y, v) は地面の高さ v をその点の坂の高さにする。
// 帯の外は side m かけて元の地面へ戻す（0 なら両わきの壁の厚さ wt のぶんでつなぎ、壁は campus3dMesh.js が立てる）。
// 土台が帯より広く、斜面のとき（side > 0）は、帯と斜面のあいだが平らな路肩になる
export function prepareSlope(f, baseAt) {
  const P = pathProfile(f, baseAt);
  if (!P.e.every(Number.isFinite)) return null;
  const { xy, cum, elev } = P;
  const prof = { s: P.s, e: P.e, flat: P.flat, seg: P.seg, segRun: P.segRun, steps: P.steps }; // 高さの折れ線（踊り場の区切りを含む）
  const side = f.side;
  const hwv = vertexWidths(f).map((w) => w / 2); // 点ごとの半幅（だんだん広がる帯）
  const wt = wallThickness(f); // 両わきの壁の厚さ（斜面なら 0）。幅が変わっても同じ
  const edge = (baseWidth(f) - f.width) / 2; // 帯のふちから土台のふちまで（壁の厚さか路肩の幅）
  const hbv = hwv.map((h) => h + edge); // 点ごとの土台の半幅
  const cv = vertexShifts(f); // 点ごとの帯の中心のずれ（左へ m）
  const hw = Math.max(...hwv.map((h, i) => h + Math.abs(cv[i]))); // 中心線からいちばん遠いふちまで
  const hb = Math.max(...hbv.map((h, i) => h + Math.abs(cv[i])));
  const box = bboxOf(xy, hb + side + 1);
  // 焼き込む地面：坂道は坂の面、階段は段の下（stairGround）。rise は階段のいちばん高い蹴上げ（段の角をなぞる線の高さ）
  let under = prof;
  let rise = 0;
  if (f.type === "stairs") {
    const fls = stairFlights(prof, f.riser, cum);
    const g = stairGround(fls);
    if (g.s.length >= 2) under = g;
    rise = Math.max(0, ...fls.map((fl) => fl.rise || 0)) || f.riser;
  }
  // 壁で囲った階段は削るだけ：まわりより高いところは元の地面のまま（段と壁で隠れる）。地面の段差が壁の外に出ないので、壁を細くできる
  const cutOnly = f.type === "stairs" && side === 0;
  // 壁なしの階段は、両端から WALL_T のあいだだけ盛りもする：地面の段差を端の外（段のない所）でなく段の下に置く
  const fillEnds = isOpenStairs(f) ? WALL_T : 0;
  const len = cum[cum.length - 1];
  const sw = side > 0 ? edge : 0; // 路肩の幅
  // 路肩の高さ：坂道は坂の面、階段は段の下の地面より下（坂の面から一段下）
  const shoulder = (s) => lerpAlong(prof.s, prof.e, s) - (f.type === "stairs" ? rise + 0.02 : 0);
  return {
    f, xy, cum, elev, prof, under, rise, hw, hb, hwv, hbv, cv, wt, side, box, walls: f.walls !== false,
    burn(x, y, v) {
      if (!inBox(box, x, y)) return v;
      const { D, s } = stripDistance(xy, cum, hwv, [x, y], cv);
      const h = lerpAlong(under.s, under.e, s);
      if (cutOnly) {
        if (D <= 0) return s < fillEnds || s > len - fillEnds ? h : Math.min(h, v);
        return h < v && D < wt * 0.75 ? h : v; // 掘ったところの段差は壁の中（外の面寄り）
      }
      if (D <= 0) return h;
      if (side === 0) return edgeBlend(D, h, v, 0, wt);
      if (sw <= 0) return edgeBlend(D, h, v, side); // 斜面はまっすぐに
      const hs = shoulder(s);
      return D <= sw ? hs : edgeBlend(D - sw, hs, v, side);
    },
  };
}

// ── 平地：囲んだ範囲を平らにする ──
// 多角形 ring（平面の m 座標、閉じない）の中か
export function pointInRing(x, y, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
// 多角形のふちまでの距離
function distToRing(x, y, ring) {
  let best = Infinity;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [ax, ay] = ring[j];
    const dx = ring[i][0] - ax;
    const dy = ring[i][1] - ay;
    const L2 = dx * dx + dy * dy || 1e-9;
    const t = Math.min(1, Math.max(0, ((x - ax) * dx + (y - ay) * dy) / L2));
    best = Math.min(best, Math.hypot(x - (ax + dx * t), y - (ay + dy * t)));
  }
  return best;
}
// 多角形のふちのいちばん近い辺 k（ring[k] から次の点へ）とその上の位置 t、距離 d
function nearestOnRing(x, y, ring) {
  let best = { d: Infinity, k: 0, t: 0 };
  for (let k = 0; k < ring.length; k++) {
    const [ax, ay] = ring[k];
    const b = ring[(k + 1) % ring.length];
    const dx = b[0] - ax;
    const dy = b[1] - ay;
    const L2 = dx * dx + dy * dy || 1e-9;
    const t = Math.min(1, Math.max(0, ((x - ax) * dx + (y - ay) * dy) / L2));
    const d = Math.hypot(x - (ax + dx * t), y - (ay + dy * t));
    if (d < best.d) best = { d, k, t };
  }
  return best;
}
const ringDir = (ring, k) => {
  const a = ring[(k + ring.length) % ring.length];
  const b = ring[(k + 1 + ring.length) % ring.length];
  const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
  return [(b[0] - a[0]) / l, (b[1] - a[1]) / l];
};

// 多角形の面積（左回りなら正）
export const ringArea = (ring) => ring.reduce((a, p, i) => { const q = ring[(i + 1) % ring.length]; return a + (p[0] * q[1] - q[0] * p[1]) / 2; }, 0);

// baseAt は元の地面。中の地面を 1m おき（広いときは間引く）に調べて、最低・平均・最高を出し、平らにする高さを決める。
// opens（stairsOpening の並び）：壁なしの階段が横切るふちの外は掘らない（そこには壁を立てないので、掘ると溝が見える）
export function prepareTerrace(f, baseAt, opens = []) {
  const ring = f.coords.map(toXY);
  const b0 = bboxOf(ring, 0);
  const step = Math.max(1, Math.sqrt(((b0[2] - b0[0]) * (b0[3] - b0[1])) / 2500));
  let sum = 0;
  let n = 0;
  let min = Infinity;
  let max = -Infinity;
  for (let x = b0[0] + step / 2; x < b0[2]; x += step) {
    for (let y = b0[1] + step / 2; y < b0[3]; y += step) {
      if (!pointInRing(x, y, ring)) continue;
      const v = baseAt(toLngLat([x, y]));
      if (!Number.isFinite(v)) continue;
      sum += v;
      n++;
      min = Math.min(min, v);
      max = Math.max(max, v);
    }
  }
  if (!n) {
    // 細すぎて升目に当たらないときは、頂点の地面で
    f.coords.forEach((c) => { const v = baseAt(c); if (Number.isFinite(v)) { sum += v; n++; min = Math.min(min, v); max = Math.max(max, v); } });
  }
  const mean = n ? sum / n : NaN;
  const elev = f.elev != null ? f.elev : mean;
  if (!Number.isFinite(elev)) return null;
  const side = f.side;
  const box = bboxOf(ring, Math.max(side, WALL_T) + 1);
  const near = side > 0 ? [] : opens.filter((o) => !(o.box[2] < box[0] || o.box[0] > box[2] || o.box[3] < box[1] || o.box[1] > box[3]));
  // 坂道・階段の高さの基準にする地面：開いていてもふちの外を掘る（ふちちょうどに置いた点の地面が、1cm の丸めで
  // 平地の高さと外の地面のあいだを飛ばないように）
  const level = (x, y, v) => {
    if (!inBox(box, x, y)) return v;
    return pointInRing(x, y, ring) ? elev : edgeBlend(distToRing(x, y, ring), elev, v, side);
  };
  return {
    f, ring, elev, side, box, stats: { min, mean, max }, level,
    // 表示する地面
    burn: !near.length ? level : (x, y, v) => {
      if (!inBox(box, x, y)) return v;
      if (pointInRing(x, y, ring)) return elev;
      const { d, k, t } = nearestOnRing(x, y, ring);
      if (d < WALL_T) {
        const a = ring[k];
        const b = ring[(k + 1) % ring.length];
        const p = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
        // 角に近いなら両側の辺の向きで見る（どちらかで開いていれば掘らない）
        const dirs = t < 1e-6 ? [ringDir(ring, k - 1), ringDir(ring, k)] : t > 1 - 1e-6 ? [ringDir(ring, k), ringDir(ring, k + 1)] : [ringDir(ring, k)];
        if (dirs.some((dir) => edgeOpen(near, p, dir))) return v;
      }
      return edgeBlend(d, elev, v, side);
    },
  };
}

// 階段の流れ：高さの折れ線（prepareSlope の prof）の区間ごとに、段数 n（蹴上げの数）を決める。段数は手で決めた数か、
// 高さの差を一段の高さで割った数。踊り場と、高さがほとんど変わらない区間は平ら（flat）。seg は中心線のどの辺か（cum は頂点の距離）。
// 流れの中の踏面はふつう n−1 枚で、両端が蹴上げ（踊り場は描いた長さのまま見える）。
// ただし高いほうの端が踊り場でない流れ（階段の端で上の地面につながる・次の流れに直接つながる）は、上がりきった一段
// （上の高さの踏面）も流れの中に含めて n 枚（top）。上の地面との段差を流れの端に作ると、標高タイルの補間で地面が段の上に出るため
export function stairFlights(prof, riser, cum) {
  const K = prof.s.length - 1;
  const out = [];
  for (let k = 0; k < K; k++) {
    const s0 = prof.s[k];
    const s1 = prof.s[k + 1];
    const L = s1 - s0;
    let seg = 0;
    while (seg < cum.length - 2 && cum[seg + 1] <= (s0 + s1) / 2) seg++;
    const e0 = prof.e[k];
    const e1 = prof.e[k + 1];
    const manual = prof.steps && prof.steps[seg] >= 1 ? Math.max(1, Math.round((prof.steps[seg] * L) / (prof.segRun?.[seg] || L))) : 0;
    const tiny = L < 0.05;
    const flat = tiny || !!prof.flat[k] || (!manual && Math.abs(e1 - e0) < riser / 2);
    out.push({ k, seg, s0, s1, e0, e1, tiny, flat, n: flat ? 0 : manual || Math.max(1, Math.round(Math.abs(e1 - e0) / riser)) });
  }
  // 高いほうの端のとなり（ごく短い区間はとばす）が踊り場でなければ top
  const near = (k, d) => { let j = k + d; while (out[j] && out[j].tiny) j += d; return out[j]; };
  out.forEach((fl) => {
    if (fl.flat) return;
    const nb = near(fl.k, fl.e1 > fl.e0 ? 1 : -1);
    fl.top = !nb || !nb.flat;
    fl.rise = Math.abs(fl.e1 - fl.e0) / fl.n; // 蹴上げ
    fl.treads = fl.top ? fl.n : fl.n - 1; // 流れの長さに並ぶ踏面の数
  });
  return out;
}

// 階段の段：流れごとの踏面の箱。s0〜s1 は中心線に沿った距離、top は段の上の標高、seg は中心線のどの辺か。踊り場は平ら（flat）
export function stairSteps(prof, riser, cum) {
  const out = [];
  for (const fl of stairFlights(prof, riser, cum)) {
    const { s0, s1, e0, e1, n, seg } = fl;
    const L = s1 - s0;
    const dh = e1 - e0;
    if (fl.tiny) continue;
    if (fl.flat) out.push({ s0, s1, top: e0 + dh / 2, seg, flat: true });
    else if (fl.top) {
      // 上がりきった一段も含めて n 枚。上りなら1段目から一段ぶん上がり、下りなら1段目は上の高さのまま
      for (let i = 0; i < n; i++) out.push({ s0: s0 + (L * i) / n, s1: s0 + (L * (i + 1)) / n, top: e0 + (dh * (dh > 0 ? i + 1 : i)) / n, seg });
    } else if (n === 1) {
      out.push({ s0, s1, top: Math.min(e0, e1), seg }); // 一段だけ：低いほうの高さのまま進み、高いほうの端で上がる
    } else {
      // n−1 枚。両端が蹴上げ
      for (let j = 0; j < n - 1; j++) out.push({ s0: s0 + (L * j) / (n - 1), s1: s0 + (L * (j + 1)) / (n - 1), top: e0 + (dh * (j + 1)) / n, seg });
    }
  }
  return out;
}

// 階段の下の地面（標高タイルに焼き込む高さの折れ線 { s, e }）。段の上に地面が出ないよう、段の内側の角を結ぶ線にする：
// 両端が蹴上げの流れは高いほうの端で一段ぶん低く、そこにつながる踊り場も一段ぶん下げる（段差は踊り場の箱の下に隠れる）。
// 階段の両端の高さは prof と同じ（まわりの地面とのあいだに段差を作らない）
export function stairGround(flights) {
  const S = [];
  const E = [];
  const put = (s, e) => {
    S.push(S.length && s <= S[S.length - 1] ? S[S.length - 1] + 1e-4 : s);
    E.push(e);
  };
  const real = flights.filter((fl) => !fl.tiny);
  // 両端が蹴上げの流れの、高いほうの端が踊り場にあるときの下げ幅
  const dropAt = (fl, end) => (fl && !fl.flat && !fl.top && (end === 1) === fl.e1 > fl.e0 ? fl.rise : 0);
  real.forEach((fl, i) => {
    const { s0, s1, e0, e1 } = fl;
    if (fl.flat) {
      const e = (e0 + e1) / 2;
      const d0 = dropAt(real[i - 1], 1); // 前の流れの高い端がここ
      const d1 = dropAt(real[i + 1], 0); // 次の流れの高い端がここ
      const half = Math.min(1.2, (s1 - s0) / 2);
      if (i === 0 && d1) { put(s0, e); put(s1 - half, e); put(s1 - half, e - d1); put(s1, e - d1); } // 階段の端の踊り場：端は元の高さ
      else if (i === real.length - 1 && d0) { put(s0, e - d0); put(s0 + half, e - d0); put(s0 + half, e); put(s1, e); }
      else { const d = Math.max(d0, d1); put(s0, e - d); put(s1, e - d); }
    } else if (fl.top) {
      put(s0, e0); put(s1, e1);
    } else if (e1 > e0) {
      put(s0, e0); put(s1, e1 - fl.rise);
    } else {
      put(s0, e0 - fl.rise); put(s1, e1);
    }
  });
  // 段の角にちょうど触れるところがあるので、両端の点のほかは少しだけ下げる（標高の丸めで地面が段の上に出ないように）
  for (let i = 1; i < E.length - 1; i++) E[i] -= 0.02;
  return { s: S, e: E };
}

// ── 線を持ち上げる面（橋の床・階段の段の上）：その上を通る線の見分け ──
// hwv は点ごとの半幅（なければ f.width の半分で一定）、cv は点ごとの帯の中心のずれ（なければ 0）
function pathOf(f, xy, cum, deckAt, hwv = null, cv = null) {
  const hv = hwv || xy.map(() => f.width / 2);
  const cc = cv || xy.map(() => 0);
  const segs = [];
  for (let i = 0; i < xy.length - 1; i++) {
    const dx = xy[i + 1][0] - xy[i][0];
    const dy = xy[i + 1][1] - xy[i][1];
    const L = Math.hypot(dx, dy);
    // 辺の横の範囲（中心線から左へ m）
    if (L > 1e-6) segs.push({ a: xy[i], ux: dx / L, uy: dy / L, L, lo: Math.min(cc[i] - hv[i], cc[i + 1] - hv[i + 1]), hi: Math.max(cc[i] + hv[i], cc[i + 1] + hv[i + 1]) });
  }
  const hw = Math.max(...hv.map((h, i) => h + Math.abs(cc[i])));
  return { f, xy, cum, hw, hwv: hv, cv: cc, segs, box: bboxOf(xy, hw + 1), deckAt };
}
export function prepareBridge(f, groundAt) {
  const xy = f.coords.map(toXY);
  const { cum, elev } = vertexElevations(f.coords, f.z, groundAt);
  if (elev.some((v) => !Number.isFinite(v))) return null;
  return { ...pathOf(f, xy, cum, (s) => lerpAlong(cum, elev, s)), elev };
}
// 階段の上のルートの通り道：手すりのあいだでいちばん広いところのまん中（中心線から左へ m）。
// 手すりが段の両端だけならまん中。まん中に手すりがあるときに、ルートが手すりの支柱に隠れて途切れないように
// 手すりの位置は幅に対する割合なので、通り道も割合で決まる（幅が変わる階段でも、同じ割合の位置を通る）
const laneRatio = (f) => {
  const xs = [0, ...(f.rails || []).filter((r) => r > 0.02 && r < 0.98), 1].sort((a, b) => a - b);
  let best = null;
  for (let i = 0; i < xs.length - 1; i++) {
    const gap = xs[i + 1] - xs[i];
    const mid = (xs[i] + xs[i + 1]) / 2;
    if (!best || gap > best.gap + 1e-6 || (Math.abs(gap - best.gap) <= 1e-6 && Math.abs(mid - 0.5) < Math.abs(best.mid - 0.5) - 1e-6)) best = { gap, mid };
  }
  return best.mid;
};
export const stairsLane = (f) => f.width * (0.5 - laneRatio(f));
// 階段の上を通る線は、段の角をなぞる高さ（坂の面 + 一段）より少し上（STAIRS_CLEAR）に、手すりのあいだの通り道（lane）へ寄せて描く。
// 段の角とほとんど同じ高さだと、画面での線の太さのぶん、手前の段の蹴上げに隠れて点線のように途切れる。
// 踊り場の前後で高さの折れ目があるので、点は 0.5m ごと。sl は prepareSlope の結果
const STAIRS_CLEAR = 0.15;
export const stairsPath = (sl) => {
  const k = 1 - 2 * laneRatio(sl.f); // 通り道 = 半幅 × k（中心線から左へ）
  return {
    ...pathOf(sl.f, sl.xy, sl.cum, (s) => lerpAlong(sl.prof.s, sl.prof.e, s) + (sl.rise || sl.f.riser) + STAIRS_CLEAR, sl.hwv, sl.cv),
    elev: sl.elev,
    laneAt: (s) => lerpAlong(sl.cum, sl.cv, s) + lerpAlong(sl.cum, sl.hwv, s) * k,
    step: 0.5,
  };
};

const ALIGN = Math.cos(35 * DEG); // 線の向きと橋の向きがこの角度以内なら「橋の上を通る線」

// 線分 A→B のうち、橋 br の上にある範囲 [t0, t1]（0〜1）。橋と向きがそろっていなければ null（橋の下をくぐる線）。
// margin は橋の両端から先へ、side は床のふちから外へ、どこまで「橋の上」とみなすか（m）
function onBridgeRange(A, B, br, margin, side) {
  const vx = B[0] - A[0];
  const vy = B[1] - A[1];
  const vl = Math.hypot(vx, vy);
  if (vl < 1e-6) return null;
  const ranges = [];
  for (const sg of br.segs) {
    if (Math.abs((vx * sg.ux + vy * sg.uy) / vl) < ALIGN) continue;
    let t0 = 0;
    let t1 = 1;
    // 橋の向き（0〜L）と横（±半幅）の4つの条件で切る
    const ax = A[0] - sg.a[0];
    const ay = A[1] - sg.a[1];
    const conds = [
      [ax * sg.ux + ay * sg.uy, vx * sg.ux + vy * sg.uy, -margin, sg.L + margin],
      [-ax * sg.uy + ay * sg.ux, -vx * sg.uy + vy * sg.ux, (sg.lo ?? -br.hw) - side, (sg.hi ?? br.hw) + side],
    ];
    let ok = true;
    for (const [p0, dp, lo, hi] of conds) {
      if (Math.abs(dp) < 1e-9) {
        if (p0 < lo || p0 > hi) { ok = false; break; }
        continue;
      }
      let ta = (lo - p0) / dp;
      let tb = (hi - p0) / dp;
      if (ta > tb) [ta, tb] = [tb, ta];
      t0 = Math.max(t0, ta);
      t1 = Math.min(t1, tb);
      if (t0 >= t1) { ok = false; break; }
    }
    if (ok && t1 - t0 > 1e-6) ranges.push([t0, t1]);
  }
  return ranges;
}

const mergeRanges = (rs) => {
  rs.sort((a, b) => a[0] - b[0]);
  const out = [];
  for (const r of rs) {
    if (out.length && r[0] <= out[out.length - 1][1] + 1e-9) out[out.length - 1][1] = Math.max(out[out.length - 1][1], r[1]);
    else out.push([r[0], r[1]]);
  }
  return out;
};

// 中心線に沿って距離 s の点・向き・横向き（平面の m 座標）
function centerAt(br, s) {
  let i = 1;
  while (i < br.cum.length - 1 && br.cum[i] < s) i++;
  const a = br.xy[i - 1];
  const b = br.xy[i];
  const L = br.cum[i] - br.cum[i - 1] || 1;
  const t = (s - br.cum[i - 1]) / L;
  const u = [(b[0] - a[0]) / L, (b[1] - a[1]) / L];
  return { p: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t], u, n: [-u[1], u[0]] };
}

// 階段の通り道（lane）へ寄せた点の並びを、両端の LANE_EASE m で元の位置からなめらかに寄せる（端で横に折れ曲がらないように）。
// 寄せる前の位置（p.free）を持たない点（地面の線とのつなぎ）はそのまま
const LANE_EASE = 1.5;
function easeIntoLane(pts) {
  const idx = pts.map((p, i) => (p.free ? i : -1)).filter((i) => i >= 0);
  if (idx.length < 2) return;
  const xy = idx.map((i) => toXY(pts[i]));
  const d = [0];
  for (let k = 1; k < xy.length; k++) d.push(d[k - 1] + Math.hypot(xy[k][0] - xy[k - 1][0], xy[k][1] - xy[k - 1][1]));
  const total = d[d.length - 1];
  idx.forEach((i, k) => {
    const w = Math.min(1, d[k] / LANE_EASE, (total - d[k]) / LANE_EASE);
    if (w >= 1) return;
    const f = toXY(pts[i].free);
    const ll = toLngLat([f[0] + (xy[k][0] - f[0]) * w, f[1] + (xy[k][1] - f[1]) * w]);
    pts[i][0] = ll[0];
    pts[i][1] = ll[1];
  });
}

// ルートや経路の線を橋の上に乗せるときの決まり：橋と向きがそろっていれば、床のふちから 2.5m 外まで橋の上とみなし、床の上へ寄せて描く
// （経路の線は手で引いたものなので、OSM の橋などとは数m ずれていることがある）
export const ROUTE_ON_BRIDGE = { side: 2.5, toDeck: true };

/**
 * 線（[[lat, lng], ...]）を、地面を通る部分と橋の上を通る部分に分ける。
 * 返す ground は地図に貼って描く線、onBridge は橋の上の線（[lng, lat, 床の標高] の点の並び）。
 * opts: margin（橋の両端から先へ m）, side（床のふちから外へ m）, toDeck（橋の上の点を床の上へ寄せる）
 */
export function splitByBridges(lines, bridges, { margin = 0.6, side = 0.6, toDeck = false } = {}) {
  if (!bridges.length) return { ground: lines, onBridge: [] };
  const ground = [];
  const onBridge = [];
  for (const line of lines) {
    if (line.length < 2) continue;
    const xy = line.map(([lat, lng]) => toXY([lng, lat]));
    let run = null; // 続いている区間 { br（地面なら null）, pts, tail（床へ寄せる前の終わりの点） }
    const close = () => {
      if (run && run.br && run.br.laneAt) easeIntoLane(run.pts);
      if (run && run.tail) run.pts.push(run.tail); // 床へ寄せた線を、地面の線の続きへつなぎ戻す
      if (run && run.pts.length > 1) (run.br ? onBridge : ground).push(run.pts);
      run = null;
    };
    for (let i = 0; i < xy.length - 1; i++) {
      const A = xy[i];
      const B = xy[i + 1];
      const at = (t) => [A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t];
      const latLngAt = (t) => {
        if (t <= 0) return line[i];
        if (t >= 1) return line[i + 1];
        const [lng, lat] = toLngLat(at(t));
        return [lat, lng];
      };
      // 橋の上の点 [lng, lat, 床の標高]。toDeck なら、中心線からの横のずれを床の内側（ふちから 0.4m）までに抑える。
      // 通り道（lane：階段の手すりのあいだ）があれば、そこへ寄せる
      const deckPoint = (br, t, raw = false) => {
        const q = at(t);
        const { s, lo, hi } = stripDistance(br.xy, br.cum, br.hwv || br.hw, q, br.cv || 0);
        if (!toDeck || raw) return [...toLngLat(q), br.deckAt(s)];
        const c = centerAt(br, s);
        const off = (q[0] - c.p[0]) * c.n[0] + (q[1] - c.p[1]) * c.n[1];
        // 床の内側（ふちから 0.4m）までに抑える。床がせまければまん中
        const free = (lo + 0.4 <= hi - 0.4 ? Math.max(lo + 0.4, Math.min(hi - 0.4, off)) : (lo + hi) / 2) - off;
        const o = br.laneAt ? br.laneAt(s) - off : free;
        const p = [...toLngLat([q[0] + c.n[0] * o, q[1] + c.n[1] * o]), br.deckAt(s)];
        if (br.laneAt) p.free = toLngLat([q[0] + c.n[0] * free, q[1] + c.n[1] * free]); // 通り道へ寄せる前の位置（両端でなめらかに寄せる）
        return p;
      };
      const moved = (a, b) => Math.hypot(...toXY(a).map((v, k) => v - toXY(b)[k])) > 0.3;
      const hits = [];
      for (const br of bridges) {
        if (!segBoxHit(br.box, A, B, side)) continue;
        for (const r of onBridgeRange(A, B, br, margin, side) || []) hits.push({ r, br });
      }
      // この線分を「地面」と「橋の上」の区間に分ける。重なった橋は、中心線にいちばん近いものにする
      const parts = [];
      let t = 0;
      for (const [t0, t1] of mergeRanges(hits.map((h) => h.r))) {
        if (t0 > t) parts.push([t, t0, null]);
        const tm = (t0 + t1) / 2;
        const mid = at(tm);
        const br = hits
          .filter((h) => h.r[0] <= tm && h.r[1] >= tm)
          .map((h) => h.br)
          .sort((a, b) => stripDistance(a.xy, a.cum, a.hwv || a.hw, mid, a.cv || 0).raw - stripDistance(b.xy, b.cum, b.hwv || b.hw, mid, b.cv || 0).raw)[0];
        parts.push([t0, t1, br]);
        t = t1;
      }
      if (t < 1) parts.push([t, 1, null]);
      for (const [ta, tb, br] of parts) {
        if (tb - ta < 1e-9) continue;
        if (!run || run.br !== br) {
          close();
          if (br) {
            // 床へ寄せたときは、地面の線の終わりの点から床の上へつなぐ
            const raw = deckPoint(br, ta, true);
            const p = deckPoint(br, ta);
            run = { br, pts: moved(raw, p) ? [raw, p] : [p] };
          } else run = { br, pts: [latLngAt(ta)] };
        }
        if (!br) {
          run.pts.push(latLngAt(tb));
          continue;
        }
        // 橋の上は 2m（階段は 0.5m）ごとに点を置き、それぞれに床の高さを付ける
        const len = (tb - ta) * Math.hypot(B[0] - A[0], B[1] - A[1]);
        const steps = Math.max(1, Math.ceil(len / (br.step || 2)));
        for (let k = 1; k <= steps; k++) run.pts.push(deckPoint(br, ta + ((tb - ta) * k) / steps));
        const raw = deckPoint(br, tb, true);
        run.tail = moved(raw, run.pts[run.pts.length - 1]) ? raw : null;
      }
    }
    close();
  }
  return { ground, onBridge };
}

function segBoxHit(b, A, B, pad = 0) {
  return !(Math.max(A[0], B[0]) < b[0] - pad || Math.min(A[0], B[0]) > b[2] + pad || Math.max(A[1], B[1]) < b[1] - pad || Math.min(A[1], B[1]) > b[3] + pad);
}

// ── 通り抜け：建物にあける穴の形（中心線を幅で太らせた多角形の集まり。平面の m 座標）──
export function passageFootprint(f) {
  const xy = f.coords.map(toXY);
  const hw = f.width / 2;
  const L = offsetLine(xy, hw);
  const R = offsetLine(xy, -hw);
  const polys = [];
  for (let i = 0; i < xy.length - 1; i++) polys.push([[L[i], L[i + 1], R[i + 1], R[i], L[i]]]);
  return polys;
}

// ── OSM の候補を構造物にする ──
export function candidateToFeature(c) {
  const extra = { name: c.name || "", osm: c.osm };
  if (c.type === "bridge") Object.assign(extra, { width: c.width, surface: c.surface, z: c.z });
  if (c.type === "stairs") Object.assign(extra, { width: c.width });
  if (c.type === "passage") Object.assign(extra, { width: c.width, height: c.height });
  if (c.type === "wall") Object.assign(extra, { height: c.height });
  return createFeature(c.type, c.coords, extra);
}
