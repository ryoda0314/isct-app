"use client";
// 3D表示に手で足す構造物（壁・坂・橋・建物の通り抜け・建物の形）と路面（道路・横断歩道・白線・路面）のエディタ（/editor/3d）。
// 地図をクリックして点を置き、ダブルクリックか Enter で確定。選んだ構造物の点はドラッグで動かし、＋で点を足す。
// 保存は開発サーバー（next dev）でだけ public/map-3d/features.json へ。本番では「書き出し」た JSON をそこに置く
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMapLibre } from "../../campus-sns/shared.jsx";
import { CampusMap3D } from "../../campus-sns/components/CampusMap3D.jsx";
import { CAMPUS_CENTER } from "../../campus-sns/hooks/useLocationSharing.js";
import {
  CANDIDATES_URL, FEATURES_URL, FEATURE_TYPES, STAIRS_MATERIAL_LABEL, SURFACE_LABEL, TREE_KIND_KEYS, TYPE_LABEL,
  aimSlope, azimuthName, baseWidth, buildingRoof, candidateToFeature, pointInRing, createFeature, cumulative, defaultCarve, defaultSlope, edgeAzimuths, extentAlong, facesDelete, facesInsert, featuresBounds, isArea, isPoint, minPoints, pitchSlope, slopeAzimuth, slopePitch, lerpAlong, normalizeFeature, offsetLine, vertexShifts, vertexWidths,
  ROUTE_ON_BRIDGE, parseFeatures, pathProfile, prepareBridge, prepareTerrace, serializeFeatures, splitByBridges, stairFlights, stairSteps, toLngLat, toXY, withLandings, withSegmentLength,
} from "../../campus-sns/campus3dFeatures.js";
import { dem } from "../../campus-sns/campusDem.js";
import { PHOTO_LAYER, buildingHeight, streetLines } from "../../campus-sns/campusMap3d.js";
import { CENTER_KINDS, CORNER_R, MARKING_KINDS, ROAD_PRESETS, SURFACE_KINDS, crosswalkAcross } from "../../campus-sns/campus3dPaint.js";
import { ROAD_KINDS, alignToLines, buildSnapIndex, nearestOnRoads, streetChain } from "../../campus-sns/campus3dSnap.js";

/* ── 見た目（2D のマップエディタと同じ暗い配色）── */
const T = { bg: "#1a1a1f", bg2: "#222228", bg3: "#2a2a32", bg4: "#32323c", tx: "#b0b0b8", txH: "#e8e8f0", txD: "#68687a", bd: "#2e2e38", bdL: "#3a3a48", accent: "#6375f0", green: "#4db88a", red: "#e5534b", yellow: "#f0c040" };
const TYPE_COL = { terrace: "#b48cff", slope: "#f0c040", stairs: "#ff7eb6", wall: "#e5534b", bridge: "#4db88a", passage: "#60a0ff", building: "#8ecae6", carve: "#f4a261", board: "#ff4b3a", road: "#d4a373", surface: "#8fb3c9", marking: "#f2f2f2", crosswalk: "#ffd166", tree: "#7ed37e", signal: "#ff8a5c" };
const REF_API = "/api/dev/map-3d-ref"; // 下絵（なぞる用の写真・図面。開発サーバーだけ）
// 木の形（campus3dMesh.js の addTree）
const TREE_KINDS = { broad: "枝の広がる木（ケヤキなど）", round: "丸い木（クスノキ・サクラなど）", ginkgo: "イチョウ", conifer: "針葉樹" };
const LIFT_COL = "#1a8ef0"; // ルートが橋の上に浮くところ
const CAND_COL = "#c070f0";
// 道に合わせる（スナップ）：線の頂点（交差点・曲がり角・端）はこの px 以内、線の上はこの px 以内なら吸い付く
const SNAP_COL = "#ff9f1c";
const SNAP_VERTEX_PX = 14;
const SNAP_EDGE_PX = 10;
const PICK_PX = 12; // 道路の道具で、地図の道を拾う距離
const TOOLS = [{ id: "select", label: "選択" }, ...FEATURE_TYPES.map((id) => ({ id, label: TYPE_LABEL[id] }))];
const HELP = {
  select: "構造物をクリックで選択。点はドラッグで移動、＋で点を足す。Delete で削除、Ctrl+Z で元に戻す",
  terrace: "平らにする範囲をクリックで囲む（3点以上）→ ダブルクリックか Enter で確定。中の傾斜を消して、ふちを垂直に切る",
  wall: "壁の線をクリックで描く → ダブルクリックか Enter で確定（Esc で取り消し）。高さは高いほうの地面から",
  slope: "坂道の中心線を、平地の段差をまたいで描く → 両端は自動で地面（平地）の高さ。左の図で途中の高さや両わきを決める",
  stairs: "階段の中心線を、平地の段差をまたいで描く → 両端の高さの差を一段の高さで割って段ができる",
  bridge: "橋の中心線を岸から岸へ描く → 両端は地面の高さ。途中の点に高さを入れると、そこが持ち上がる",
  passage: "建物の外から外へ、くぐる道の中心線を描く → 幅と天井の高さの穴が建物にあく",
  building: "地図の建物をクリック → その形と高さで「建物」になる（元の建物は消える）。左で高さを変え、「屋根を斜めに切る」で斜面に。新しい建物は、建物のないところをクリックで囲んで Enter",
  carve: "くり抜く範囲をクリックで囲む（建物のふち・角に吸い付く。Alt で外す）→ ダブルクリックか Enter で確定。建物の外にはみ出してよい（建物と重なるところだけくり抜く）。描いているあいだは建物を隠す。Esc でやめる",
  board: "板の前のふち（長い辺）の端と端を2回クリック → 3回目で奥のふち（奥行き）。続けて次の板を描ける。ほかの板の角・ふちと建物のふちに吸い付き、前の板とほぼ平行（3°以内）ならぴったり平行に（Alt で外す）。Shift+クリックで板を選ぶ。Esc でやめる",
  road: "地図の道をクリック → 交差点の先へまっすぐ続く道までつないで1本の道路にする（オレンジが取り込む範囲）。地図にない道は、道から離れたところか Alt を押しながら中心線を描いて Enter。幅・車線・歩道は左で。交差点は自動",
  surface: "広場・駅前・植え込み・導流帯など、道の形でない路面をクリックで囲む（3点以上）→ ダブルクリックか Enter で確定。道路は「道路」で引く。航空写真を敷くとなぞりやすい",
  marking: "白線をクリックで描く → ダブルクリックか Enter で確定。停止線・実線・破線・黄線は左で選ぶ（道路の中央線や外側線は自動）",
  crosswalk: "道路の上をクリック → その場所で道を直角に渡る横断歩道（車道のふちからふちへ）。道路のないところは、歩道から歩道へ2点クリック",
  tree: "木を置くところをクリック（1回で1本。続けて置くときはもう一度「木」）。種類・高さ・枝の広がりは左で。輪は枝の広がり。航空写真を敷くと木の位置がわかる",
};
const DRAFT_KEY = "map3dEditorDraft";
// 囲んで描く道具（範囲の種類と、建物のくり抜き）
const closedTool = (t) => isArea(t) || t === "carve";

// ── 屋根の板 ──
// 板の形：前のふち p1→p2 と、奥行きを決める点 p3（前のふちから p3 までの、ふちに直角な距離）→ 長方形の4点（[経度, 緯度]）。
// 小さすぎれば null
function boardRect(p1, p2, p3) {
  const a = toXY(p1);
  const b = toXY(p2);
  const c = toXY(p3);
  const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
  if (L < 0.1) return null;
  const n = [-(b[1] - a[1]) / L, (b[0] - a[0]) / L];
  const d = (c[0] - a[0]) * n[0] + (c[1] - a[1]) * n[1];
  if (Math.abs(d) < 0.05) return null;
  return [a, b, [b[0] + n[0] * d, b[1] + n[1] * d], [a[0] + n[0] * d, a[1] + n[1] * d]].map((p) => toLngLat(p).map((v) => Math.round(v * 1e7) / 1e7));
}
// 2点目：p1→p2 が向き dir（平面の m）とほぼ平行（PARALLEL_DEG 以内）なら、ぴったり平行にした点（長さはそのまま）。でなければ null
const PARALLEL_DEG = 3;
function alignParallel(p1, p2, dir) {
  if (!dir) return null;
  const a = toXY(p1);
  const b = toXY(p2);
  const v = [b[0] - a[0], b[1] - a[1]];
  const L = Math.hypot(v[0], v[1]);
  const dl = Math.hypot(dir[0], dir[1]);
  if (L < 0.3 || dl < 1e-6) return null;
  const u = [dir[0] / dl, dir[1] / dl];
  const cos = (v[0] * u[0] + v[1] * u[1]) / L;
  if (Math.abs(cos) < Math.cos((PARALLEL_DEG * Math.PI) / 180)) return null;
  const s = Math.sign(cos) * L;
  return { ll: toLngLat([a[0] + u[0] * s, a[1] + u[1] * s]), u: [u[0] * Math.sign(cos), u[1] * Math.sign(cos)], a };
}
// 平行にした線（a から向き u）と線分 seg（[経度, 緯度] ×2）の交わる点。なければ null
function lineSegCross(a, u, seg) {
  const p = toXY(seg[0]);
  const q = toXY(seg[1]);
  const e = [q[0] - p[0], q[1] - p[1]];
  const den = u[0] * e[1] - u[1] * e[0];
  if (Math.abs(den) < 1e-9) return null;
  const w = [p[0] - a[0], p[1] - a[1]];
  const t = (w[0] * e[1] - w[1] * e[0]) / den;
  const k = (w[0] * u[1] - w[1] * u[0]) / den;
  return t > 0 && k >= -0.02 && k <= 1.02 ? toLngLat([a[0] + u[0] * t, a[1] + u[1] * t]) : null;
}
// 建物 f の、点 ll（[経度, 緯度]）にある板の番号（重なっていれば上面がいちばん高いもの）。なければ null
function boardAt(f, ll) {
  if (!f?.boards?.length) return null;
  const p = toXY(ll);
  let best = null;
  f.boards.forEach((b, i) => {
    if (pointInRing(p[0], p[1], b.coords.map(toXY)) && (best == null || b.top > f.boards[best].top)) best = i;
  });
  return best;
}
const PAINT_TYPES = new Set(["road", "surface", "marking", "crosswalk"]);
const INITIAL_VIEW = { lat: CAMPUS_CENTER.lat, lng: CAMPUS_CENTER.lng, zoom: 17.2, bearing: 0 };
const EMPTY = { type: "FeatureCollection", features: [] };
const API = "/api/dev/map-3d";

/* ── 形の補助 ── */
const lengthOf = (coords) => {
  const c = cumulative(coords.map(toXY));
  return c[c.length - 1];
};
// 範囲（平地）は閉じた輪、幅のある構造物（坂道・階段・橋・通り抜け）は帯の輪郭（坂道・階段は土台の横幅）
const footprint = (f) => {
  if (isArea(f.type)) return [[...f.coords, f.coords[0]]];
  if (isPoint(f.type)) return [crownRing(f)];
  if (f.type === "wall" || f.type === "marking" || f.coords.length < 2) return null;
  const xy = f.coords.map(toXY);
  // 坂道・階段は点ごとの横幅（だんだん広がる）に土台のぶんを足す
  const path = f.type === "slope" || f.type === "stairs";
  const hw = path ? vertexWidths(f).map((w) => (w + baseWidth(f) - f.width) / 2) : xy.map(() => f.width / 2);
  const cv = path ? vertexShifts(f) : xy.map(() => 0); // 帯の中心のずれ（左へ m）
  const L = offsetLine(xy, hw.map((h, i) => cv[i] + h));
  const R = offsetLine(xy, hw.map((h, i) => cv[i] - h)).reverse();
  return [[...L, ...R, L[0]].map(toLngLat)];
};
// 木の枝の広がり（直径 crown）の円
function crownRing(f) {
  const [x, y] = toXY(f.coords[0]);
  const r = f.type === "signal" ? 0.6 : (f.crown || 4) / 2;
  return Array.from({ length: 25 }, (_, k) => toLngLat([x + r * Math.cos((k / 24) * 2 * Math.PI), y + r * Math.sin((k / 24) * 2 * Math.PI)]));
}
function overlayFC(features, selId) {
  const out = [];
  features.forEach((f) => {
    const p = { id: f.id, col: TYPE_COL[f.type], sel: f.id === selId ? 1 : 0, pt: PAINT_TYPES.has(f.type) ? 1 : 0 };
    const fp = footprint(f);
    if (fp) out.push({ type: "Feature", properties: { ...p, fill: 1 }, geometry: { type: "Polygon", coordinates: fp } });
    out.push({ type: "Feature", properties: { ...p, fill: 0 }, geometry: { type: "LineString", coordinates: isArea(f.type) ? [...f.coords, f.coords[0]] : isPoint(f.type) ? crownRing(f) : f.coords } });
    if (f.id === selId && f.type === "building") (f.cuts || []).forEach((c, ci) => slopeGuides(f, ci).lines.forEach((line) => out.push({ type: "Feature", properties: { ...p, fill: 2 }, geometry: { type: "LineString", coordinates: line } })));
    // 信号機の腕（柱から腕の先まで）
    if (f.type === "signal" && f.arm > 0) {
      const [x, y] = toXY(f.coords[0]);
      const b = (f.bearing * Math.PI) / 180;
      out.push({ type: "Feature", properties: { ...p, fill: 2 }, geometry: { type: "LineString", coordinates: [f.coords[0], toLngLat([x + Math.sin(b) * f.arm, y + Math.cos(b) * f.arm])] } });
    }
    if (f.id === selId && f.type === "building") (f.carves || []).forEach((cv) => out.push({ type: "Feature", properties: { ...p, col: TYPE_COL.carve, fill: 2 }, geometry: { type: "LineString", coordinates: [...cv.coords, cv.coords[0]] } }));
  });
  return { type: "FeatureCollection", features: out };
}
// 斜めに切った屋根の案内線：「低」の線（低い側の高さになる線。0 なら地面まで切れる線）と「高」の線を建物の幅いっぱいに
// （それぞれ回した向きで）、あいだに下る向きの線。ends は「低」「高」の線の片方の端（回すつまみを置くところ）
function slopeGuides(f, ci) {
  const c = buildingRoof(f).cuts[ci];
  const xy = f.coords.map(toXY);
  const across = (O, v) => {
    const s = xy.map((p) => (p[0] - O[0]) * v[0] + (p[1] - O[1]) * v[1]);
    const a = Math.min(...s) - 2;
    const b = Math.max(...s) + 2;
    return [[O[0] + v[0] * a, O[1] + v[1] * a], [O[0] + v[0] * b, O[1] + v[1] * b]];
  };
  const lo = across(c.A, c.vl);
  const hi = across(c.B, c.vh);
  return { lines: [lo.map(toLngLat), hi.map(toLngLat), [toLngLat(c.B), toLngLat(c.A)]], ends: [toLngLat(lo[1]), toLngLat(hi[1])], A: c.A, B: c.B, u: c.u };
}
// 線の角度（度）：下がる向き u に直角な向きから、向き d までの左回りの角。線に向きはないので -90〜90 に、さらに ±75 まで
function lineAngle(u, d) {
  const perp = [-u[1], u[0]];
  let a = (Math.atan2(perp[0] * d[1] - perp[1] * d[0], perp[0] * d[0] + perp[1] * d[1]) * 180) / Math.PI;
  if (a > 90) a -= 180;
  if (a <= -90) a += 180;
  return Math.round(Math.max(-75, Math.min(75, a)));
}
// OSM の候補（取り込んだものは除く）。i は候補リストでの番号
const candFC = (cands, used) => ({
  type: "FeatureCollection",
  features: cands.flatMap((c, i) => (used.has(c.osm) ? [] : [{ type: "Feature", properties: { i }, geometry: { type: "LineString", coordinates: c.coords } }])),
});
const fmt1 = (v) => (Number.isFinite(v) ? v.toFixed(1) : "—");
const near = (a, b) => Math.hypot(...toXY(a).map((v, k) => v - toXY(b)[k])) < 0.3;

/* ── 数値の入力（打っている途中は範囲外でも消さない。範囲内になったら反映）── */
function Num({ value, onChange, min, max, step = 0.1, nullable = false, placeholder = "", width = 64 }) {
  const fmt = (v) => (v == null ? "" : String(v));
  const [txt, setTxt] = useState(fmt(value));
  const focused = useRef(false);
  useEffect(() => {
    if (!focused.current) setTxt(fmt(value));
  }, [value]);
  return (
    <input
      type="number" inputMode="decimal" value={txt} step={step} placeholder={placeholder}
      onFocus={() => { focused.current = true; }}
      onBlur={() => { focused.current = false; setTxt(fmt(value)); }}
      onChange={(e) => {
        const s = e.target.value;
        setTxt(s);
        if (s.trim() === "") {
          if (nullable) onChange(null);
          return;
        }
        const n = parseFloat(s);
        if (Number.isFinite(n) && n >= min && n <= max) onChange(n);
      }}
      style={{ width, padding: "4px 6px", borderRadius: 5, border: `1px solid ${T.bdL}`, background: T.bg, color: T.txH, fontSize: 12, fontFamily: "inherit" }}
    />
  );
}

const Btn = ({ children, onClick, col = T.txH, active = false, disabled = false, title }) => (
  <button
    type="button" onClick={onClick} disabled={disabled} title={title}
    style={{ padding: "5px 11px", borderRadius: 6, border: `1.5px solid ${active ? col : T.bd}`, background: active ? `${col}22` : T.bg3, color: disabled ? T.txD : active ? col : T.txH, fontSize: 11, fontWeight: active ? 700 : 600, cursor: disabled ? "default" : "pointer", whiteSpace: "nowrap", fontFamily: "inherit" }}
  >
    {children}
  </button>
);
const Row = ({ label, children }) => (
  <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: T.tx, margin: "6px 0" }}>
    <span style={{ width: 96, flexShrink: 0, color: T.txD }}>{label}</span>
    {children}
  </label>
);

/* ── 信号機：柱の高さ・腕・車の信号の向き・歩行者の信号の向き ── */
function SignalPanel({ f, update }) {
  const [peds, setPeds] = useState(f.peds.join(", "));
  useEffect(() => setPeds(f.peds.join(", ")), [f.id, f.peds]);
  return (
    <>
      <Row label="柱の高さ (m)"><Num value={f.height} min={2.5} max={12} step={0.1} onChange={(v) => update({ height: v }, "height")} /><span style={{ fontSize: 10, color: T.txD }}>腕の高さ</span></Row>
      <Row label="腕の長さ (m)"><Num value={f.arm} min={0} max={12} step={0.1} onChange={(v) => update({ arm: v }, "arm")} /><span style={{ fontSize: 10, color: T.txD }}>0 は腕なし</span></Row>
      <Row label="腕の向き (度)"><Num value={f.bearing} min={0} max={360} step={5} onChange={(v) => update({ bearing: v }, "bearing")} /><span style={{ fontSize: 10, color: T.txD }}>北から右回り</span></Row>
      <Row label="車の信号 (度)"><Num value={f.face} min={0} max={360} step={5} nullable placeholder="なし" onChange={(v) => update({ face: v }, "face")} /><span style={{ fontSize: 10, color: T.txD }}>信号の面が向く方位（空欄はなし）</span></Row>
      <Row label="歩行者 (度)">
        <input value={peds} onChange={(e) => {
          setPeds(e.target.value);
          const v = e.target.value.split(/[,\s、]+/).filter(Boolean).map(Number);
          if (v.every(Number.isFinite)) update({ peds: v }, "peds");
        }} placeholder="例：0, 90" style={{ flex: 1, padding: "4px 6px", borderRadius: 5, border: `1px solid ${T.bdL}`, background: T.bg, color: T.txH, fontSize: 12, fontFamily: "inherit" }} />
      </Row>
      <div style={{ fontSize: 10, color: T.txD, lineHeight: 1.6, marginTop: 4 }}>
        歩行者の信号は柱に付き、面が向く方位をカンマで（4 つまで）。灯は歩行者だけが渡れるとき（車は赤、歩行者は青）。地図の線は腕
      </div>
    </>
  );
}

/* ── 坂・階段・橋の「横から見た形」「断面」と、各点の高さ ── */
const SVG_W = 312;
const fmt2 = (v) => (Number.isFinite(v) ? v.toFixed(2) : "—");
const r2 = (v) => Math.round(v * 100) / 100;
// 中心線に沿って距離 s の位置（平面 m）
const pointAt = (xy, cum, s) => {
  let i = 1;
  while (i < cum.length - 1 && cum[i] < s) i++;
  const t = (s - cum[i - 1]) / (cum[i] - cum[i - 1] || 1);
  return [xy[i - 1][0] + (xy[i][0] - xy[i - 1][0]) * t, xy[i - 1][1] + (xy[i][1] - xy[i - 1][1]) * t];
};
const gradeOf = (dz, run) => {
  const pct = (dz / (run || 1e-9)) * 100;
  return { pct, deg: (Math.atan2(Math.abs(dz), run) * 180) / Math.PI };
};
const Muted = ({ children, style }) => <div style={{ fontSize: 10, color: T.txD, lineHeight: 1.55, ...style }}>{children}</div>;
const Sub = ({ children }) => <div style={{ fontSize: 11, fontWeight: 700, color: T.tx, margin: "14px 0 6px" }}>{children}</div>;

// 横から見た形：灰色が元の地面、色の線が坂の面（階段は段々、橋は床）。ゆるいものは縦を伸ばし、急なものは縦横同じ縮尺
function ProfileSvg({ f, sh, groundFn, col, selVertex, onPick }) {
  const H = 132;
  const pad = { l: 36, r: 10, t: 18, b: 18 };
  const pw = SVG_W - pad.l - pad.r;
  const ph = H - pad.t - pad.b;
  const { xy, cum, elev, len, prof } = sh;
  const N = Math.min(160, Math.max(24, Math.ceil(len / 0.5)));
  const ss = Array.from({ length: N + 1 }, (_, k) => (len * k) / N);
  const gs = ss.map((s) => groundFn(toLngLat(pointAt(xy, cum, s))));
  if (!(len > 0) || !gs.every(Number.isFinite) || !prof.e.every(Number.isFinite)) return <Muted>標高を読み込み中…</Muted>;
  // 面：坂道・橋は高さの折れ線（踊り場は平ら）、階段は段々
  const surf = f.type === "stairs"
    ? [[0, prof.e[0]], ...stairSteps(prof, f.riser, cum).flatMap((st) => [[st.s0, st.top], [st.s1, st.top]]), [len, prof.e[prof.e.length - 1]]]
    : prof.s.map((s, k) => [s, prof.e[k]]);
  const zs = [...gs, ...surf.map((p) => p[1])];
  let z0 = Math.min(...zs);
  let z1 = Math.max(...zs);
  if (z1 - z0 < 1) { const m = (z0 + z1) / 2; z0 = m - 0.5; z1 = m + 0.5; }
  let sx = pw / len;
  let sy = ph / (z1 - z0);
  if (sy < sx) sx = sy; // 急なもの：縦横同じ（本当の傾き）
  else sy = Math.min(sy, sx * 10); // ゆるいもの：縦を最大10倍
  const ex = sy / sx;
  const zm = (z0 + z1) / 2;
  const X = (s) => pad.l + s * sx;
  const Y = (z) => pad.t + ph / 2 - (z - zm) * sy;
  const line = (pts) => pts.map(([s, z], k) => `${k ? "L" : "M"}${X(s).toFixed(1)},${Y(z).toFixed(1)}`).join("");
  const ground = ss.map((s, k) => [s, gs[k]]);
  const ramp = ss.map((s) => [s, lerpAlong(prof.s, prof.e, s)]);
  return (
    <svg width={SVG_W} height={H} style={{ display: "block", background: T.bg, borderRadius: 8, border: `1px solid ${T.bd}` }}>
      <path d={`${line(ground)}L${X(len)},${H}L${X(0)},${H}Z`} fill="#5b6470" opacity={0.35} />
      <path d={`${line(ramp)}${line([...ground].reverse()).replace(/^M/, "L")}Z`} fill={col} opacity={0.18} />
      <path d={line(ground)} fill="none" stroke="#9aa3ad" strokeWidth={1.5} />
      <path d={line(surf)} fill="none" stroke={col} strokeWidth={2.5} strokeLinejoin="round" />
      {cum.slice(0, -1).map((s, i) => {
        const run = cum[i + 1] - s;
        const { pct } = gradeOf(elev[i + 1] - elev[i], run);
        const mx = X(s + run / 2);
        const my = Math.min(Y(elev[i]), Y(elev[i + 1])) - 6;
        return run * sx > 26 && <text key={`g${i}`} x={mx} y={Math.max(10, my)} fontSize={9} fill={f.flat?.[i] ? col : T.txH} textAnchor="middle">{f.flat?.[i] ? "踊り場" : `${Math.round(pct)}%`}</text>;
      })}
      {cum.map((s, i) => (
        <g key={i} onClick={() => onPick(i)} style={{ cursor: "pointer" }}>
          <circle cx={X(s)} cy={Y(elev[i])} r={i === selVertex ? 6 : 4.5} fill={i === selVertex ? col : T.bg} stroke={col} strokeWidth={2} />
          <text x={X(s)} y={Y(elev[i]) + 15} fontSize={9} fill={T.txD} textAnchor="middle">{i + 1}</text>
        </g>
      ))}
      <text x={pad.l - 4} y={Y(z1) + 3} fontSize={9} fill={T.txD} textAnchor="end">{z1.toFixed(1)}</text>
      <text x={pad.l - 4} y={Y(z0) + 3} fontSize={9} fill={T.txD} textAnchor="end">{z0.toFixed(1)}</text>
      <text x={SVG_W - pad.r} y={11} fontSize={9} fill={T.txD} textAnchor="end">{ex > 1.05 ? `縦は ×${ex.toFixed(1)}` : "縦横同じ縮尺"}・全長 {len.toFixed(1)} m</text>
      <text x={pad.l} y={11} fontSize={9} fill="#9aa3ad">― 元の地面</text>
      <text x={pad.l + 58} y={11} fontSize={9} fill={col}>― {f.type === "bridge" ? "床" : f.type === "stairs" ? "階段" : "坂の面"}</text>
    </svg>
  );
}

// 断面（縦横同じ縮尺、点1から点2を見て）：帯の面（階段は段）、土台（両わきの壁か平らな路肩）と斜面、手すり（rails は段の幅に対する位置）。
// shift は帯の中心のずれ（中心線から左へ m）。ずれていれば、描いた中心線を点線で示す
function SectionSvg({ width, base, side, inner, outer, rails = [], shift = 0, walls = true, col }) {
  const H = rails.length ? 132 : 116;
  const d = inner - outer;
  const half = width / 2;
  const hb = Math.max(half, base / 2);
  const wall = side === 0 && walls;
  const reach = hb + side + 1.2 + Math.abs(shift);
  const zTop = Math.max(inner, outer) + (rails.length ? 1 : 0.3);
  const zBot = Math.min(inner, outer) - 0.5;
  // 上の2行（文字）の下、y 30〜H−4 に収める
  const sc = Math.min((SVG_W - 24) / (2 * reach), (H - 34) / Math.max(zTop - zBot, 0.8));
  const X = (x) => SVG_W / 2 + (x - shift) * sc; // x は帯の中心から右へ。左へずれた帯は図の左へ
  const Y = (z) => 30 + (zTop - z) * sc + (H - 34 - (zTop - zBot) * sc) / 2;
  const line = (pts) => pts.map(([x, z], k) => `${k ? "L" : "M"}${X(x).toFixed(1)},${Y(z).toFixed(1)}`).join("");
  // まわりの地面：壁なら壁の外の面まで、斜面なら斜面と路肩をへて帯のふちまで
  const ground = side === 0
    ? [[[-reach, outer], [-hb, outer]], [[hb, outer], [reach, outer]]]
    : [[[-reach, outer], [-(hb + side), outer], [-hb, inner], [-half, inner]], [[half, inner], [hb, inner], [hb + side, outer], [reach, outer]]];
  const wTop = Math.max(inner, outer) + 0.05; // 壁の上
  const wBot = Math.min(inner, outer) - 0.3;
  const railAt = (r) => {
    const on = r >= 0 && r <= 1;
    const lim = (on ? half : hb) - 0.06;
    const x = Math.min(lim, Math.max(-lim, -half + r * width));
    return { x, foot: on || Math.abs(x) <= half ? inner : wall ? wTop : inner };
  };
  return (
    <svg width={SVG_W} height={H} style={{ display: "block", background: T.bg, borderRadius: 8, border: `1px solid ${T.bd}` }}>
      {ground.map((g, k) => <path key={k} d={`${line(g)}L${X(g[g.length - 1][0])},${H}L${X(g[0][0])},${H}Z`} fill="#5b6470" opacity={0.35} />)}
      {ground.map((g, k) => <path key={`l${k}`} d={line(g)} fill="none" stroke="#9aa3ad" strokeWidth={1.5} />)}
      {wall && [-1, 1].map((sg) => (
        <rect key={sg} x={X(sg < 0 ? -hb : half)} y={Y(wTop)} width={Math.max(2, (hb - half) * sc)} height={(wTop - wBot) * sc} fill={T.txH} opacity={0.8} />
      ))}
      {side === 0 && !walls && inner > outer && <rect x={X(-half)} y={Y(inner)} width={width * sc} height={(inner - outer) * sc} fill={col} opacity={0.25} />}
      <line x1={X(-half)} y1={Y(inner)} x2={X(half)} y2={Y(inner)} stroke={col} strokeWidth={3} />
      {Math.abs(shift) > 0.01 && <>
        <line x1={X(shift)} y1={30} x2={X(shift)} y2={H - 4} stroke={T.txD} strokeWidth={1} strokeDasharray="3 3" />
        <text x={X(shift) + (shift > 0 ? 4 : -4)} y={H - 6} fontSize={9} fill={T.txD} textAnchor={shift > 0 ? "start" : "end"}>描いた線（{shift > 0 ? "左" : "右"}へ {fmt2(Math.abs(shift))} m ずれ）</text>
      </>}
      {rails.map((r, k) => {
        const { x, foot } = railAt(r);
        return (
          <g key={k}>
            <line x1={X(x)} y1={Y(foot)} x2={X(x)} y2={Y(foot + 0.9)} stroke={T.yellow} strokeWidth={2} />
            <circle cx={X(x)} cy={Y(foot + 0.9)} r={2.5} fill={T.yellow} />
          </g>
        );
      })}
      <text x={X(0)} y={Math.min(H - 3, Y(inner) + 12)} fontSize={9} fill={col} textAnchor="middle">幅 {width} m</text>
      <text x={6} y={12} fontSize={9} fill={T.txD}>{Math.abs(d) <= 0.05 ? "この点では地面と同じ高さ" : `地面との差 ${d > 0 ? "+" : "−"}${Math.abs(d).toFixed(2)} m（${d > 0 ? "盛る" : "掘る"}）`}</text>
      <text x={SVG_W - 6} y={12} fontSize={9} fill={T.txD} textAnchor="end">点1から点2を見て</text>
      <text x={6} y={25} fontSize={9} fill={T.txH}>
        {side === 0 && !walls ? "両わきに壁なし" : `土台 ${fmt2(hb * 2)} m${hb - half > 0.01 ? `（${wall ? "壁" : "路肩"} ${fmt2(hb - half)} m ずつ）` : ""}${side > 0 && Math.abs(d) > 0.05 ? `・斜面 ${side} m` : ""}`}
      </text>
    </svg>
  );
}

// 平地の断面：範囲のいちばん長い向きに切って、元の地面（灰色）と平らにしたあとの地面（色）
function TerraceProfileSvg({ f, tr, col }) {
  const H = 120;
  const pad = { l: 36, r: 10, t: 18, b: 14 };
  const pw = SVG_W - pad.l - pad.r;
  const ph = H - pad.t - pad.b;
  const ring = f.coords.map(toXY);
  let A = ring[0];
  let B = ring[1];
  ring.forEach((p) => ring.forEach((q) => { if (Math.hypot(p[0] - q[0], p[1] - q[1]) > Math.hypot(A[0] - B[0], A[1] - B[1])) { A = p; B = q; } }));
  const L = Math.hypot(B[0] - A[0], B[1] - A[1]);
  const ext = Math.max(4, f.side + 3, L * 0.15);
  const len = L + ext * 2;
  const u = [(B[0] - A[0]) / L, (B[1] - A[1]) / L];
  const N = 120;
  const ss = Array.from({ length: N + 1 }, (_, k) => (len * k) / N);
  const pts = ss.map((s) => [A[0] + u[0] * (s - ext), A[1] + u[1] * (s - ext)]);
  const g0 = pts.map((p) => dem.baseAt(toLngLat(p)));
  if (!tr || !(L > 0) || !g0.every(Number.isFinite)) return <Muted>標高を読み込み中…</Muted>;
  const g1 = pts.map((p, k) => tr.burn(p[0], p[1], g0[k]));
  let z0 = Math.min(...g0, ...g1);
  let z1 = Math.max(...g0, ...g1);
  if (z1 - z0 < 1) { const m = (z0 + z1) / 2; z0 = m - 0.5; z1 = m + 0.5; }
  let sx = pw / len;
  let sy = ph / (z1 - z0);
  if (sy < sx) sx = sy;
  else sy = Math.min(sy, sx * 10);
  const zm = (z0 + z1) / 2;
  const X = (s) => pad.l + s * sx;
  const Y = (z) => pad.t + ph / 2 - (z - zm) * sy;
  const line = (zs) => zs.map((z, k) => `${k ? "L" : "M"}${X(ss[k]).toFixed(1)},${Y(z).toFixed(1)}`).join("");
  return (
    <svg width={SVG_W} height={H} style={{ display: "block", background: T.bg, borderRadius: 8, border: `1px solid ${T.bd}` }}>
      <path d={`${line(g1)}L${X(len)},${H}L${X(0)},${H}Z`} fill="#5b6470" opacity={0.35} />
      <path d={line(g0)} fill="none" stroke="#9aa3ad" strokeWidth={1.2} strokeDasharray="3 2" />
      <path d={line(g1)} fill="none" stroke={col} strokeWidth={2.5} strokeLinejoin="round" />
      <text x={pad.l - 4} y={Y(z1) + 3} fontSize={9} fill={T.txD} textAnchor="end">{z1.toFixed(1)}</text>
      <text x={pad.l - 4} y={Y(z0) + 3} fontSize={9} fill={T.txD} textAnchor="end">{z0.toFixed(1)}</text>
      <text x={pad.l} y={11} fontSize={9} fill="#9aa3ad">- - 元の地面</text>
      <text x={pad.l + 62} y={11} fontSize={9} fill={col}>― 平らにしたあと</text>
      <text x={SVG_W - pad.r} y={11} fontSize={9} fill={T.txD} textAnchor="end">{sy / sx > 1.05 ? `縦は ×${(sy / sx).toFixed(1)}` : "縦横同じ縮尺"}</text>
    </svg>
  );
}

// 平地の設定：平らにする標高（空欄は中の地面の平均）と、ふち（0 で垂直に切る）
// 方位の円：クリック・ドラッグで向き（北 0・時計回りの度）を決める。15° ごとに吸い付く（Shift を押すと 1° ごと）
function Compass({ value, onChange, col }) {
  const ref = useRef(null);
  const pick = (e) => {
    const r = ref.current.getBoundingClientRect();
    const a = ((Math.atan2(e.clientX - (r.left + r.width / 2), -(e.clientY - (r.top + r.height / 2))) / Math.PI) * 180 + 360) % 360;
    onChange(e.shiftKey ? Math.round(a) : (Math.round(a / 15) * 15) % 360);
  };
  const R = 30;
  const tip = (deg, r) => [Math.sin((deg * Math.PI) / 180) * r, -Math.cos((deg * Math.PI) / 180) * r];
  const [x, y] = tip(value, R - 6);
  const [lx, ly] = tip(value - 150, 7);
  const [rx, ry] = tip(value + 150, 7);
  return (
    <svg ref={ref} width={72} height={72} viewBox="-36 -36 72 72" style={{ cursor: "pointer", touchAction: "none", flexShrink: 0 }}
      onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); pick(e); }} onPointerMove={(e) => e.buttons && pick(e)}>
      <circle r={R} fill={T.bg} stroke={T.bdL} />
      {[0, 45, 90, 135, 180, 225, 270, 315].map((d) => { const [a, b] = tip(d, R); const [c, e] = tip(d, R - (d % 90 ? 3 : 5)); return <line key={d} x1={a} y1={b} x2={c} y2={e} stroke={T.txD} />; })}
      {[["北", 0], ["東", 90], ["南", 180], ["西", 270]].map(([t, d]) => { const [a, b] = tip(d, R - 11); return <text key={t} x={a} y={b + 3} fontSize={8} textAnchor="middle" fill={T.txD}>{t}</text>; })}
      <line x1={0} y1={0} x2={x} y2={y} stroke={col} strokeWidth={2.5} />
      <polygon points={`${x},${y} ${x + lx},${y + ly} ${x + rx},${y + ry}`} fill={col} />
      <circle r={2.5} fill={col} />
    </svg>
  );
}

// 建物：高さと、屋根を斜めに切る面（6つまで）。面ごとに低くなる向き・傾き・低い側の高さ。屋根はどの面よりも低いところなので、
// 向かい合う2面で横から見て台形、4面で寄棟になる
// 屋根の板：下絵（図面・写真）の上で、板を1枚ずつ描く。次の板の高さは「自動」（斜めに切った屋根の、その板のまん中の高さ）か
// 「指定」（描くたびに足す）。選んだ板は高さ・種類を変え、角のひし形・まん中の四角で動かす
function BoardPanel({ f, update, bi, setBi, next, setNext, drawing, onDraw, hide3d, setHide3d }) {
  const col = TYPE_COL.board;
  const boards = f.boards || [];
  const b = bi != null ? boards[bi] : null;
  const hint = { fontSize: 10, color: T.txD };
  const r2 = (v) => Math.round(v * 100) / 100;
  // 選んでいる板だけ変える（傾いた板は、点ごとの高さもいっしょに動かす）
  const setBoard = (fn, key) => update((g) => ({ boards: (g.boards || []).map((x, j) => (j === bi ? { ...x, ...fn(x) } : x)) }), key ? `board${bi}:${key}` : undefined);
  const raise = (x, top) => ({ top, tops: x.tops ? x.tops.map((t) => r2(t + top - x.top)) : undefined });
  return (
    <>
      <div style={{ fontSize: 12, fontWeight: 700, color: T.txH, margin: "12px 0 6px" }}>屋根の板（{boards.length}枚{boards.length ? `・うち植え込み ${boards.filter((x) => x.kind === "green").length}` : ""}）</div>
      <div style={{ ...hint, lineHeight: 1.6, marginBottom: 6 }}>板があると、屋根は板でできる（板のないところは斜めの屋根の 0.8m 下＝暗いすき間）。左の下の「下絵」で図面を出して、上からなぞる</div>
      <Row label="次の板の高さ">
        <div style={{ display: "flex", gap: 4 }}>
          <Btn col={col} active={next.mode === "auto"} onClick={() => setNext({ ...next, mode: "auto" })} title="斜めに切った屋根の、その板のまん中の高さ（あとで選んで直せる）">自動</Btn>
          <Btn col={col} active={next.mode === "fixed"} onClick={() => setNext({ ...next, mode: "fixed" })}>指定</Btn>
        </div>
      </Row>
      {next.mode === "fixed" && <>
        <Row label="高さ (m)">
          <Num value={next.top} min={0} max={f.height + 5} step={0.05} width={58} onChange={(v) => setNext({ ...next, top: v })} />
          {[0.2, 0.4, -0.2].map((d) => <Btn key={d} col={col} onClick={() => setNext({ ...next, top: r2(next.top + d) })}>{d > 0 ? "+" : "−"}{Math.abs(d)}</Btn>)}
        </Row>
        <Row label="描くたびに (m)"><Num value={next.step} min={-2} max={2} step={0.05} width={58} onChange={(v) => setNext({ ...next, step: v })} /><span style={hint}>次の高さに足す（観客席なら 0.4）</span></Row>
      </>}
      <Row label="種類">
        <div style={{ display: "flex", gap: 4 }}>
          <Btn col={col} active={next.kind !== "green"} onClick={() => setNext({ ...next, kind: "deck" })}>板</Btn>
          <Btn col={TYPE_COL.tree} active={next.kind === "green"} onClick={() => setNext({ ...next, kind: "green" })}>植え込み</Btn>
        </div>
      </Row>
      <div style={{ display: "flex", gap: 6, margin: "6px 0", flexWrap: "wrap" }}>
        <Btn col={col} active={drawing} onClick={onDraw}>{drawing ? "板を描いている（Esc でやめる）" : "板を描く"}</Btn>
        {boards.length > 0 && <Btn col={T.red} onClick={() => { if (window.confirm(`屋根の板 ${boards.length} 枚を全部消しますか？（「元に戻す」で戻せます）`)) { setBi(null); update({ boards: undefined }); } }}>全部消す</Btn>}
      </div>
      <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: T.tx, margin: "4px 0", cursor: "pointer" }}>
        <input type="checkbox" checked={hide3d} onChange={(e) => setHide3d(e.target.checked)} />立体の屋根を隠す（下絵と板の線だけ見る）
      </label>
      <div style={{ ...hint, lineHeight: 1.6 }}>板の線は赤（植え込みは緑）、中の色は高さ（青 → 黄 → 赤で高い）。板の上にマウスを置くと高さが出る。建物を選んだあと、板をクリックで選ぶ</div>
      {b && <div style={{ border: `1px solid ${col}66`, borderRadius: 6, padding: "6px 8px", marginTop: 8 }}>
        <div style={{ fontSize: 11, color: col, fontWeight: 700, marginBottom: 2 }}>選んでいる板 #{bi + 1}</div>
        <Row label="高さ (m)">
          <Num value={b.top} min={0} max={f.height + 5} step={0.05} width={58} onChange={(v) => setBoard((x) => raise(x, v), "top")} />
          {[0.2, -0.2].map((d) => <Btn key={d} col={col} onClick={() => setBoard((x) => raise(x, r2(x.top + d)))}>{d > 0 ? "+" : "−"}{Math.abs(d)}</Btn>)}
        </Row>
        {b.tops && <div style={{ ...hint, display: "flex", alignItems: "center", gap: 6, margin: "2px 0 4px" }}>傾いた板（角ごとの高さ {b.tops.join(" / ")}）<Btn col={col} onClick={() => setBoard(() => ({ tops: undefined }))}>水平にする</Btn></div>}
        <Row label="種類">
          <div style={{ display: "flex", gap: 4 }}>
            <Btn col={col} active={b.kind !== "green"} onClick={() => setBoard(() => ({ kind: undefined }))}>板</Btn>
            <Btn col={TYPE_COL.tree} active={b.kind === "green"} onClick={() => setBoard(() => ({ kind: "green" }))}>植え込み</Btn>
          </div>
        </Row>
        <div style={{ display: "flex", gap: 6, marginTop: 4, flexWrap: "wrap" }}>
          <Btn col={col} onClick={() => setNext({ ...next, mode: "fixed", top: r2(b.top + (next.step || 0)) })} title="この板の高さ（＋描くたびに足す分）を、次の板の高さに">この高さから続ける</Btn>
          <Btn col={T.red} onClick={() => { update((g) => ({ boards: (g.boards || []).filter((_, j) => j !== bi) })); setBi(null); }}>この板を消す</Btn>
        </div>
        <div style={{ ...hint, marginTop: 4 }}>角のひし形をドラッグで角を、まん中の四角で板ごと動かす。Delete で消す</div>
      </div>}
    </>
  );
}

function BuildingPanel({ f, update, carveIdx, setCarveIdx, onDrawCarve, boards }) {
  const col = TYPE_COL.building;
  const cuts = f.cuts || [];
  const [ci0, setCi] = useState(0);
  const ci = Math.min(ci0, Math.max(0, cuts.length - 1));
  const cut = cuts[ci];
  const withCut = (g, c) => ({ ...g, slope: c.slope, low: c.low }); // 面と建物を合わせたもの（aimSlope などに渡す）
  const cf = cut ? withCut(f, cut) : null;
  const az = cf ? slopeAzimuth(cf) : null;
  const pitch = cf ? slopePitch(cf) : null;
  const edges = useMemo(() => edgeAzimuths(f.coords), [f.coords]);
  const hint = { fontSize: 10, color: T.txD };
  // 選んでいる面だけ変える
  const setCut = (fn, key) => update((g) => ({ cuts: g.cuts.map((c, j) => (j === ci ? { ...c, ...fn(withCut(g, c)) } : c)) }), key ? `${key}${ci}` : undefined);
  const aim = (v, fit = false) => setCut((g) => ({ slope: aimSlope(g, ((v % 360) + 360) % 360, fit) }), fit ? null : "az");
  // 台形：選んでいる面と、向かい合う面（同じ傾き・低い側の高さ）。斜面が建物の4割より長いと上が平らに残らないので、3割にする
  const trapezoid = () => {
    update((g) => {
      const c = g.cuts[ci];
      const cg = withCut(g, c);
      const a = slopeAzimuth(cg);
      const A = toXY(c.slope[0]);
      const B = toXY(c.slope[1]);
      const ext = extentAlong(g.coords, a);
      let L = Math.hypot(B[0] - A[0], B[1] - A[1]);
      if (L > ext * 0.4) L = ext * 0.3;
      const opp = (a + 180) % 360;
      const rest = g.cuts.filter((o, j) => j !== ci && Math.abs(((slopeAzimuth(withCut(g, o)) - opp + 540) % 360) - 180) > 1);
      return { cuts: [{ slope: aimSlope(cg, a, false, L), low: c.low }, { slope: aimSlope(cg, opp, false, L), low: c.low }, ...rest].slice(0, 6) };
    });
    setCi(0);
  };
  const addCut = () => {
    update((g) => {
      const c = g.cuts[ci];
      return { cuts: [...g.cuts, { slope: aimSlope(withCut(g, c), (slopeAzimuth(withCut(g, c)) + 90) % 360), low: c.low }].slice(0, 6) };
    });
    setCi(cuts.length);
  };
  const removeCut = () => {
    update((g) => (g.cuts.length > 1 ? { cuts: g.cuts.filter((_, j) => j !== ci) } : { cuts: undefined }));
    setCi(Math.max(0, ci - 1));
  };
  return (
    <>
      <Row label={cuts.length ? "いちばん高いところ (m)" : "高さ (m)"}><Num value={f.height} min={0.1} max={250} step={0.5} onChange={(v) => update({ height: v }, "height")} /><span style={hint}>地面から屋上まで</span></Row>
      <BoardPanel f={f} update={update} {...boards} />
      <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: T.tx, margin: "6px 0", cursor: "pointer" }}>
        <input type="checkbox" checked={cuts.length > 0} onChange={(e) => { update(e.target.checked ? { cuts: [{ slope: defaultSlope(f.coords), low: 0 }] } : { cuts: undefined }); setCi(0); }} />屋根を斜めに切る
      </label>
      {cut && <>
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap", margin: "2px 0 6px" }}>
          {cuts.map((c, j) => <Btn key={j} col={col} active={j === ci} onClick={() => setCi(j)}>面{j + 1}（{azimuthName(slopeAzimuth(withCut(f, c)))}へ）</Btn>)}
        </div>
        <Row label="低くなる向き">
          <Compass value={az} col={col} onChange={(v) => aim(v)} />
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ display: "flex", alignItems: "center", gap: 4 }}><Num value={Math.round(az)} min={0} max={359} step={1} width={56} onChange={(v) => aim(v)} />度</span>
            <span style={{ fontSize: 11, color: T.tx }}>{azimuthName(az)}へ下がる</span>
          </div>
        </Row>
        <Row label={cut.rotLow || cut.rotHigh ? "傾き（点1–点2）" : "傾き (度)"}><Num value={Math.round(pitch * 10) / 10} min={1} max={89} step={1} onChange={(v) => setCut((g) => ({ slope: pitchSlope(g, v) }), "pitch")} /><span style={hint}>{cut.rotLow || cut.rotHigh ? "線を回したので、傾きは場所で変わる（点1と点2を結ぶところの値）" : "急にするほど斜面が短く、上の平らなところが広い"}</span></Row>
        <Row label="低い側の高さ (m)"><Num value={cut.low} min={0} max={f.height} step={0.5} onChange={(v) => setCut(() => ({ low: v }), "low")} /><span style={hint}>0 なら「低」の線で地面まで</span></Row>
        {[["rotLow", "「低」の線の角度"], ["rotHigh", "「高」の線の角度"]].map(([key, label]) => (
          <Row key={key} label={label}>
            <Num value={cut[key] ?? 0} min={-75} max={75} step={1} width={52} onChange={(v) => setCut(() => ({ [key]: v }), key)} />
            <select value="" onChange={(e) => {
              const ed = edges.find((x) => String(x.i) === e.target.value);
              if (!ed) return;
              const xy = f.coords.map(toXY);
              const a = xy[ed.i];
              const b = xy[(ed.i + 1) % xy.length];
              setCut((g) => { const A = toXY(g.slope[0]); const B = toXY(g.slope[1]); const L = Math.hypot(B[0] - A[0], B[1] - A[1]) || 1; return { [key]: lineAngle([(B[0] - A[0]) / L, (B[1] - A[1]) / L], [b[0] - a[0], b[1] - a[1]]) }; });
            }} style={{ fontSize: 11, padding: "3px 4px", borderRadius: 5, border: `1px solid ${T.bdL}`, background: T.bg, color: T.tx, maxWidth: 120 }}>
              <option value="">辺に平行に…</option>
              {edges.filter((x) => x.len >= 2).map((x) => <option key={x.i} value={x.i}>点{x.i + 1}–{(x.i + 1) % f.coords.length + 1}（{azimuthName(x.az)}の辺）</option>)}
            </select>
          </Row>
        ))}
        <div style={{ fontSize: 10, color: T.txD, lineHeight: 1.6, margin: "-2px 0 4px" }}>0 は下がる向きに直角。「低」と「高」の線をそれぞれ回せる（地図の ↻ をドラッグでも）。平行でなければ、あいだは2本の線を結ぶねじれた斜面になる（線が近いところほど急）</div>
        {(() => { const X = buildingRoof(f).cuts[ci]?.X; return X && pointInRing(X[0], X[1], f.coords.map(toXY)) ? <div style={{ fontSize: 10, color: T.yellow, lineHeight: 1.6, marginBottom: 4 }}>「低」と「高」の線が建物の中で交わっている：交わる点のまわりは、すべての高さが集まる急な斜面になる</div> : null; })()}
        <div style={{ display: "flex", gap: 6, margin: "4px 0", flexWrap: "wrap" }}>
          <Btn col={col} onClick={() => aim(az, true)} title="この面の斜面を建物の端から端までにする（傾きは変わる）">建物いっぱいに</Btn>
          <Btn col={col} onClick={() => aim(az + 180)} title="この面の高い側と低い側を入れかえる">向きを逆に</Btn>
        </div>
        <Row label="段々にする (m)">
          <Num value={f.step ?? null} nullable placeholder="しない" min={0.1} max={5} step={0.05} width={64} onChange={(v) => update({ step: v ?? undefined }, "step")} />
          <div style={{ display: "flex", gap: 4 }}>
            {[[0.4, "観客席"], [1, "テラス"]].map(([v, l]) => <Btn key={v} col={col} active={f.step === v} onClick={() => update({ step: v })}>{l} {v}m</Btn>)}
          </div>
        </Row>
        <div style={{ fontSize: 10, color: T.txD, lineHeight: 1.6, margin: "-2px 0 4px" }}>斜めの屋根を、この高さごとの水平な段にする（段の境目は斜面の同じ高さの線。線を回した面なら扇のように開く）。段の板は「軒の出」だけ、段の向きに壁の外へ張り出す（斜めに交わる壁ではのこぎりの歯のように）。歩いて見るときは段を上れる（0.6m まで）</div>
        <div style={{ fontSize: 11, color: T.tx, margin: "8px 0 4px" }}>辺に沿って切る（その辺へ向かって低く、建物いっぱいに）</div>
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
          {edges.filter((e) => e.len >= 2).map((e) => (
            <Btn key={e.i} col={col} active={Math.abs(((az - e.az + 540) % 360) - 180) < 1} onClick={() => aim(e.az, true)} title={`点${e.i + 1}と点${(e.i + 1) % f.coords.length + 1}のあいだの辺（${e.len.toFixed(1)} m）`}>
              点{e.i + 1}–{(e.i + 1) % f.coords.length + 1}（{azimuthName(e.az)}）
            </Btn>
          ))}
        </div>
        <div style={{ display: "flex", gap: 6, margin: "10px 0 0", flexWrap: "wrap" }}>
          <Btn col={col} onClick={trapezoid} title="この面の向かい側も同じ傾きで切る（横から見て台形）">台形にする</Btn>
          <Btn col={col} onClick={addCut} disabled={cuts.length >= 6} title="切る面をもう1つ（この面から 90° まわした向き）。4面で寄棟">切る面を足す</Btn>
          <Btn col={T.red} onClick={removeCut}>この面を消す</Btn>
        </div>
      </>}
      <div style={{ fontSize: 10, color: T.txD, lineHeight: 1.6, marginTop: 6 }}>
        地図の建物をクリックして作ると、その形と高さから始まり、元の建物は描かれなくなる（中心がこの形の中にある建物）。形の点はドラッグ・＋で動かせるので、真上から見て斜めに切ることもできる。
        {cut ? "屋根はどの面よりも低いところ：向かい合う2面で台形、4面で寄棟。向きは円をクリック・ドラッグ（15° ごと、Shift で 1° ごと）か度で。「低」は建物のいちばん低い側の端に来て、向きを変えても傾きはそのまま。地図の点線は面ごとの「低」「高」の線で、四角はドラッグでも動かせる" : ""}
      </div>
      <CarvePanel f={f} update={update} ci={carveIdx} setCi={setCarveIdx} onDraw={onDrawCarve} />
      <div style={{ fontSize: 12, fontWeight: 700, color: T.txH, margin: "12px 0 6px" }}>見た目</div>
      <Row label="ガラス張り (m)"><Num value={f.glass ?? null} nullable placeholder="なし" min={0.5} max={f.height} step={0.5} onChange={(v) => update({ glass: v ?? undefined }, "glass")} /><span style={hint}>地面からこの高さまで（窓の桟つき）。空ならなし</span></Row>
      {f.glass > 0 && <Row label="桟の間隔 (m)"><Num value={f.glassPitch ?? 1.5} min={0.5} max={6} step={0.1} onChange={(v) => update({ glassPitch: v }, "glassPitch")} />
        <Btn active={f.glassFrame === "light"} col={col} title="細い明るい枠（アルミ）⇔ 太い暗い枠" onClick={() => update({ glassFrame: f.glassFrame === "light" ? undefined : "light" })}>明るい枠</Btn></Row>}
      {f.glass > 0 && <Row label="ガラスの辺">
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
          {f.coords.map((_, i) => {
            const on = !f.glassSides || f.glassSides[i] !== false;
            const e = edges.find((x) => x.i === i);
            return <Btn key={i} col={col} active={on} title={`点${i + 1}と点${(i + 1) % f.coords.length + 1}のあいだの辺（${e ? e.len.toFixed(1) : "?"} m）。押すとガラス ⇔ 壁`} onClick={() => update((g) => ({ glassSides: g.coords.map((_, j) => (j === i ? !on : !g.glassSides || g.glassSides[j] !== false)) }))}>点{i + 1}–{(i + 1) % f.coords.length + 1}{e ? ` ${azimuthName(e.az)}` : ""}</Btn>;
          })}
        </div>
      </Row>}
      <Row label="軒の出 (m)"><Num value={f.eave ?? null} nullable placeholder="なし" min={0.1} max={10} step={0.1} onChange={(v) => update({ eave: v ?? undefined }, "eave")} /><span style={hint}>屋根のふちから外へ出る板（屋根が 1m より低い辺は出さない）。段々の屋根では段の板の張り出し</span></Row>
      {f.eave > 0 && <Row label="軒を出す辺">
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
          {f.coords.map((_, i) => {
            const on = !f.eaveSides || f.eaveSides[i] !== false;
            const e = edges.find((x) => x.i === i);
            return <Btn key={i} col={col} active={on} title={`点${i + 1}と点${(i + 1) % f.coords.length + 1}のあいだの辺（${e ? e.len.toFixed(1) : "?"} m）。押すと軒あり ⇔ なし`} onClick={() => update((g) => ({ eaveSides: g.coords.map((_, j) => (j === i ? !on : !g.eaveSides || g.eaveSides[j] !== false)) }))}>点{i + 1}–{(i + 1) % f.coords.length + 1}{e ? ` ${azimuthName(e.az)}` : ""}</Btn>;
          })}
        </div>
      </Row>}
      <Row label="屋上">
        <div style={{ display: "flex", gap: 4 }}>
          {[[undefined, "ふつう"], ["green", "緑"], ["deck", "木の床"]].map(([v, l]) => <Btn key={l} col={col} active={f.roof === v} onClick={() => update({ roof: v })}>{l}</Btn>)}
        </div>
        <span style={hint}>緑は草の塊を散らし、軒は暗い色に（段々の屋根なら、段ごとに植え込みか木の段）</span>
      </Row>
    </>
  );
}

// 建物のくり抜き（ベランダ・テラス）：床の高さ・天井の高さ（空なら上まで抜く）・手すり壁
function CarvePanel({ f, update, ci: ci0, setCi, onDraw }) {
  const col = TYPE_COL.carve;
  const carves = f.carves || [];
  const ci = Math.min(ci0, Math.max(0, carves.length - 1));
  const cv = carves[ci];
  const hint = { fontSize: 10, color: T.txD };
  const setCarve = (patch, key) => update((g) => ({ carves: g.carves.map((c, j) => (j === ci ? { ...c, ...(typeof patch === "function" ? patch(c) : patch) } : c)) }), key ? `${key}${ci}` : undefined);
  // 点ごとの床・天井（斜めにくり抜く）：入れた点だけ数、ほかは null
  const [ppOn, setPpOn] = useState(false);
  const perPoint = ppOn || !!(cv && (cv.floors || cv.ceils));
  const setPoint = (key, k, v) => setCarve((c) => ({ [key]: c.coords.map((_, i) => (i === k ? v : c[key]?.[i] ?? null)) }), `${key}${k}`);
  return (
    <div style={{ marginTop: 14, paddingTop: 10, borderTop: `1px solid ${T.bd}` }}>
      <div style={{ fontSize: 12, color: T.txH, fontWeight: 600, marginBottom: 6 }}>くり抜き（ベランダ・テラス）</div>
      {carves.length > 0 && (
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 6 }}>
          {carves.map((c, j) => <Btn key={j} col={col} active={j === ci} onClick={() => setCi(j)}>くり抜き{j + 1}（{c.floors || c.ceils ? "斜め" : `${c.bottom} m`}{c.top == null ? "〜上まで" : c.floors || c.ceils ? "" : `〜${c.top} m`}）</Btn>)}
        </div>
      )}
      {cv && <>
        <Row label="床の高さ (m)"><Num value={cv.bottom} min={0} max={f.height} step={0.5} onChange={(v) => setCarve({ bottom: v }, "cb")} /><span style={hint}>地面から。0 なら1階から（ピロティ）</span></Row>
        <Row label="天井の高さ (m)"><Num value={cv.top} nullable placeholder="上まで" min={cv.bottom + 0.5} max={250} step={0.5} onChange={(v) => setCarve({ top: v }, "ct")} /><span style={hint}>空なら上まで抜く（屋上テラス）</span></Row>
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: T.tx, margin: "6px 0", cursor: "pointer" }}>
          <input type="checkbox" checked={cv.rail} onChange={(e) => setCarve({ rail: e.target.checked })} />手すり壁（床のふちに 1.1 m）
        </label>
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: T.tx, margin: "6px 0", cursor: "pointer" }}>
          <input type="checkbox" checked={perPoint} onChange={(e) => { setPpOn(e.target.checked); if (!e.target.checked) setCarve({ floors: undefined, ceils: undefined }); }} />点ごとに床・天井の高さを変える（斜めにくり抜く）
        </label>
        {perPoint && <>
          <table style={{ borderCollapse: "collapse", fontSize: 11, color: T.tx, margin: "2px 0 4px" }}>
            <thead><tr style={{ color: T.txD }}><th style={{ textAlign: "left", padding: "2px 8px 2px 0", fontWeight: 400 }}>点</th><th style={{ textAlign: "left", fontWeight: 400 }}>床 (m)</th><th style={{ textAlign: "left", fontWeight: 400, paddingLeft: 8 }}>天井 (m)</th></tr></thead>
            <tbody>
              {cv.coords.map((_, k) => (
                <tr key={k}>
                  <td style={{ padding: "2px 8px 2px 0", color: col, fontWeight: 600 }}>{k + 1}</td>
                  <td><Num value={cv.floors?.[k] ?? null} nullable placeholder={String(cv.bottom)} min={0} max={250} step={0.5} width={60} onChange={(v) => setPoint("floors", k, v)} /></td>
                  <td style={{ paddingLeft: 8 }}>{cv.top == null ? <span style={{ color: T.txD }}>上まで</span> : <Num value={cv.ceils?.[k] ?? null} nullable placeholder={String(cv.top)} min={0} max={250} step={0.5} width={60} onChange={(v) => setPoint("ceils", k, v)} />}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ fontSize: 10, color: T.txD, lineHeight: 1.6 }}>空欄はふつうの床・天井の高さ。点のあいだは斜めの面でつながるので、上辺と下辺が平行でなくても続けてくり抜ける（例：床を 3.5→7 m にすると坂のようなテラス）。地図のひし形の番号が点の番号</div>
        </>}
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", margin: "4px 0" }}>
          {[1, 2, 3, 4].filter((k) => k * 3.5 < f.height).map((k) => (
            <Btn key={k} col={col} onClick={() => setCarve({ bottom: k * 3.5, top: cv.top == null ? null : Math.max(k * 3.5 + 0.5, k * 3.5 + (cv.top - cv.bottom)) })} title={`床を ${k + 1} 階（${k * 3.5} m）に。1階分 3.5 m`}>{k + 1}階</Btn>
          ))}
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", margin: "6px 0" }}>
          <Btn col={col} onClick={() => onDraw(ci)}>範囲を描き直す</Btn>
          <Btn col={T.red} onClick={() => { update((g) => (g.carves.length > 1 ? { carves: g.carves.filter((_, j) => j !== ci) } : { carves: undefined })); setCi(Math.max(0, ci - 1)); }}>このくり抜きを消す</Btn>
        </div>
      </>}
      <Btn col={col} active onClick={() => onDraw(null)} disabled={carves.length >= 8}>くり抜く範囲を描く</Btn>
      <div style={{ fontSize: 10, color: T.txD, lineHeight: 1.6, marginTop: 6 }}>
        地図で囲むと、建物と重なるところを床の高さから天井の高さまでくり抜く（建物のふち・角に吸い付く。外にはみ出してよい）。外の壁はそこだけあき、奥の壁と床・天井ができる。天井を空にすると上まで抜けて屋上テラスに。ひし形の点はドラッグで動かせる
      </div>
    </div>
  );
}

function TerracePanel({ f, demTick, update }) {
  const col = TYPE_COL.terrace;
  const tr = useMemo(() => prepareTerrace(f, (ll) => dem.baseAt(ll)), [f, demTick]); // eslint-disable-line react-hooks/exhaustive-deps
  const st = tr?.stats;
  const ready = !!tr && Number.isFinite(st?.mean);
  const setElev = (v) => update({ elev: v == null ? null : r2(v) }, "elev");
  return (
    <div>
      <Sub>平らにする高さ（いちばん長い向きの断面）</Sub>
      <TerraceProfileSvg f={f} tr={tr} col={col} />
      <Row label="標高 (m)">
        <Num value={f.elev} nullable placeholder={ready ? `自動 ${st.mean.toFixed(2)}` : "自動"} min={-50} max={200} width={96} onChange={setElev} />
      </Row>
      {ready && (
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 6 }}>
          <Btn onClick={() => setElev(st.min)} title="中の地面のいちばん低いところに合わせる（ぜんぶ掘る）">いちばん低く</Btn>
          <Btn onClick={() => setElev(null)} title="空欄（自動）＝中の地面の平均">平均</Btn>
          <Btn onClick={() => setElev(st.max)} title="中の地面のいちばん高いところに合わせる（ぜんぶ盛る）">いちばん高く</Btn>
          <Btn onClick={() => setElev(tr.elev - 0.5)}>−0.5m</Btn>
          <Btn onClick={() => setElev(tr.elev + 0.5)}>+0.5m</Btn>
        </div>
      )}
      <Muted>
        {ready
          ? `中の元の地面：最低 ${st.min.toFixed(2)}・平均 ${st.mean.toFixed(2)}・最高 ${st.max.toFixed(2)} m。いまの高さ ${tr.elev.toFixed(2)} m だと、いちばん深いところで ${Math.max(0, st.max - tr.elev).toFixed(2)} m 掘り、${Math.max(0, tr.elev - st.min).toFixed(2)} m 盛る`
          : "標高を読み込み中…"}
      </Muted>
      <Sub>ふち</Sub>
      <Row label="ふちの斜面 (m)">
        <Num value={f.side} min={0} max={30} onChange={(v) => update({ side: v }, "side")} />
        {f.side > 0 ? <Btn onClick={() => update({ side: 0 })}>垂直に切る</Btn> : <Btn onClick={() => update({ side: 3 })}>斜面にする</Btn>}
      </Row>
      <Muted>0 なら、ふちを垂直に切って壁を立てる。段差をつなぐには、ふちをまたいで坂道か階段を描く（そこだけ壁があく）</Muted>
      {!(f.side > 0) && <>
        <Row label="壁の上の色">
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
            <Btn active={!f.wallTop} col={col} title="壁の外の高い側の路面の色（路面がなければ壁の色）" onClick={() => update({ wallTop: undefined })}>自動（まわりの路面）</Btn>
            <Btn active={f.wallTop === "wall"} col={col} onClick={() => update({ wallTop: "wall" })}>壁の色</Btn>
            {Object.entries(SURFACE_KINDS).map(([k, v]) => <Btn key={k} active={f.wallTop === k} col={col} onClick={() => update({ wallTop: k })}>{v.label}</Btn>)}
          </div>
        </Row>
        <Muted>壁の横の面は壁の色のまま。上の面（ふちから外へ 1.7m の帯）を、まわりの地面になじむ色にする</Muted>
      </>}
    </div>
  );
}

// 坂道・階段・橋の設定：横から見た形・まとめて変えるボタン・各点の高さ・（坂道と階段は）帯と両わき・（橋は）ルート
function ShapeEditor({ f, demTick, selVertex, setSelVertex, update, lift, onAlign }) {
  const isBridge = f.type === "bridge";
  const col = TYPE_COL[f.type];
  // 坂・階段は元の地面から、橋は（坂を入れた）真下の地面から
  const groundFn = useCallback((ll) => (isBridge ? dem.groundAt(ll) : dem.levelAt(ll)), [isBridge]);
  const sh = useMemo(() => {
    const P = pathProfile(f, groundFn);
    return { ...P, prof: { s: P.s, e: P.e, flat: P.flat, seg: P.seg, segRun: P.segRun, steps: P.steps }, len: P.cum[P.cum.length - 1], ground: f.coords.map(groundFn) };
  }, [f, groundFn, demTick]); // eslint-disable-line react-hooks/exhaustive-deps
  const ready = sh.elev.every(Number.isFinite) && sh.ground.every(Number.isFinite);
  const offs = sh.elev.map((e, i) => e - sh.ground[i]); // いまの「地面から」
  // 両わきとも平地のふちに沿っていて、自動で壁なしにした階段（campus3dFeatures.js の withAutoOpenStairs。dem が持つ形で見る）
  const autoOpen = f.type === "stairs" && dem.slopes.some((sl) => sl.f.id === f.id && sl.f.autoOpen);
  const setZ = (i, v) => update((g) => ({ z: g.coords.map((_, k) => (k === i ? v : g.z?.[k] ?? null)) }), `z${i}`);
  const setAll = (fn) => ready && update((g) => ({ z: g.coords.map((_, k) => r2(fn(k))) }));
  // 階段の流れ：区間ごとの段数（蹴上げの数）と踏面。段数を手で決めた階段は steps を持つ
  const flights = f.type === "stairs" && ready ? stairFlights(sh.prof, f.riser, sh.cum).filter((x) => !x.flat) : [];
  const isPath = f.type === "slope" || f.type === "stairs";
  const segFl = f.coords.slice(1).map((_, i) => flights.find((x) => x.seg === i) || null);
  const segN = segFl.map((x) => (x ? x.n : 0));
  const segLen = f.coords.slice(1).map((_, i) => sh.cum[i + 1] - sh.cum[i]);
  // 踏面：流れの長さ（角の踊り場を除く）÷ 並ぶ踏面の数（ふつうは 段数−1、＊の流れは 段数）
  const treadOf = (x) => (x && x.treads > 0 ? (x.s1 - x.s0) / x.treads : null);
  const manual = Array.isArray(f.steps);
  const toggleFlat = (i) => update((g) => {
    const flat = g.coords.slice(1).map((_, k) => (k === i ? !g.flat?.[k] : !!g.flat?.[k]));
    // 段数を手で決めているときは、踊り場にした区間の段数を外し、段に戻した区間は踏面 0.3m で数える
    const st = g.steps ? g.steps.map((v, k) => (k !== i ? v : flat[k] ? null : Math.max(1, Math.round((segLen[k] || 0.3) / 0.3)))) : g.steps;
    return { flat, steps: st };
  });
  // 段と踊り場の表で数を変えたとき。段の区間は 長さ＝踏面×（段数−1。＊の区間は段数）で、
  //   段数 → 最後に踏面を入れた区間は踏面を、ほかは長さを保つ／踏面 → 段数を保って長さが変わる／長さ → 段数を保って踏面が変わる。
  // 踊り場は長さ。長さが変わると、その区間の向きのまま、うしろの点がまとめてずれる。はじめて数を入れたときに、ほかの段の区間の段数も手で決めたことにする
  // 区間ごとに、最後に手で入れた踏面（長さを入れたら消す）。入力は一文字ごとに反映されるので（11 は 1 を経る）、
  // いまの形からでなく入れた値から長さを出す。点の数が変わったら区間がずれるので忘れる
  const [keepTread, setKeepTread] = useState({});
  useEffect(() => setKeepTread({}), [f.coords.length]);
  const setSegment = (i, what, v) => {
    if (!ready || !(v > 0)) return;
    const fl = f.flat?.[i] ? null : segFl[i];
    const tc = (n) => (fl?.top ? n : n - 1); // 流れの長さに並ぶ踏面の数
    if (what === "tread" && !(fl && tc(fl.n) > 0)) return;
    if (what === "tread" || what === "len") setKeepTread((k) => ({ ...k, [i]: what === "tread" ? v : null }));
    update((g) => {
      const st = g.steps ? [...g.steps] : g.coords.slice(1).map((_, k) => (g.flat?.[k] ? null : segN[k] || null));
      let L = segLen[i];
      if (!fl) {
        if (what === "len") L = v;
      } else {
        const run = fl.s1 - fl.s0; // 角の踊り場を除いた長さ
        st[i] = what === "n" ? Math.round(v) : fl.n;
        if (what === "n") { if (keepTread[i]) L = segLen[i] - run + tc(st[i]) * keepTread[i]; }
        else if (what === "tread") L = segLen[i] - run + tc(fl.n) * v;
        else L = v;
      }
      return { coords: Math.abs(L - segLen[i]) < 1e-6 ? g.coords : withSegmentLength(g.coords, i, L), steps: st };
    }, `${what}${i}`);
  };
  // 踊り場を入れる：階段は「◯段ごと」、坂道は「◯m 上がるごと」
  const [every, setEvery] = useState(f.type === "stairs" ? 12 : 0.75);
  const [landLen, setLandLen] = useState(1.5);
  const addLandings = () => {
    if (!ready) return;
    const w = withLandings(f, groundFn, f.type === "stairs" ? every * f.riser : every, landLen);
    if (w.added) update({ coords: w.coords, z: w.z, flat: w.flat, widths: w.widths || undefined, shifts: w.shifts || undefined, steps: undefined }); // 分けた区間の段数は自動に戻す
  };
  // 土台：両わきの壁（斜面なら路肩）の幅。各点の横幅（空欄は両端なら横幅、途中は前後を結ぶ）
  const edgeW = (baseWidth(f) - f.width) / 2;
  const wv = isPath ? vertexWidths(f) : f.coords.map(() => f.width);
  const cv = isPath ? vertexShifts(f) : f.coords.map(() => 0); // 点ごとの帯の中心のずれ（左へ m）
  const setW = (i, v) => update((g) => ({ widths: g.coords.map((_, k) => (k === i ? v : g.widths?.[k] ?? null)) }), `w${i}`);
  const setC = (i, v) => update((g) => ({ shifts: g.coords.map((_, k) => (k === i ? v : g.shifts?.[k] ?? null)) }), `c${i}`);
  // 手すり：段の幅に対する位置（0 が左の端、1 が右の端）。本数を決めると段の両端から同じ間隔で並べる
  const rails = f.rails || [];
  const evenRails = (n) => (n <= 0 ? [] : n === 1 ? [0.5] : Array.from({ length: n }, (_, k) => Math.round((k / (n - 1)) * 1000) / 1000));
  const setRail = (k, x) => update((g) => ({ rails: (g.rails || []).map((r, j) => (j === k ? x / g.width : r)) }), `rail${k}`);
  const treads = flights.map(treadOf).filter((t) => t != null);
  const rises = flights.map((x) => x.rise);
  const totalSteps = flights.reduce((a, x) => a + x.n, 0);
  const si = selVertex != null && selVertex < f.coords.length ? selVertex : offs.reduce((b, d, i) => (Math.abs(d) > Math.abs(offs[b]) ? i : b), 0);
  const th = { fontWeight: 500, padding: "2px 2px" };
  return (
    <div>
      <Sub>横から見た形</Sub>
      <ProfileSvg f={f} sh={sh} groundFn={groundFn} col={col} selVertex={selVertex} onPick={setSelVertex} />
      {!isBridge && (
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 6 }}>
          <Btn onClick={() => update({ z: f.coords.map(() => null), flat: f.coords.slice(1).map(() => false), steps: undefined })} title="両端を地面の高さにして、そのあいだを直線で結ぶ（踊り場もなくし、段数も自動に）">まっすぐ</Btn>
          <Btn onClick={() => setAll((k) => sh.elev[0] - sh.ground[k])} title="すべての点を点1と同じ標高に">水平に</Btn>
          <Btn onClick={() => setAll((k) => offs[k] - 1)}>全体 −1m</Btn>
          <Btn onClick={() => setAll((k) => offs[k] + 1)}>全体 +1m</Btn>
        </div>
      )}

      <Sub>各点の高さ</Sub>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
        <thead>
          <tr style={{ color: T.txD, textAlign: "right" }}>
            <th style={{ ...th, textAlign: "left" }}>点</th>
            <th style={th}>地面から</th>
            <th style={th}>標高</th>
            <th style={th}>{isPath ? "次まで（押すと踊り場）" : "次までの勾配"}</th>
            {isBridge && <th style={th}>下の空き</th>}
          </tr>
        </thead>
        <tbody>
          {f.coords.map((_, i) => {
            const last = i === f.coords.length - 1;
            const run = last ? 0 : sh.cum[i + 1] - sh.cum[i];
            const dz = last ? 0 : sh.elev[i + 1] - sh.elev[i];
            const g = gradeOf(dz, run);
            const n = f.type === "stairs" && !last ? segN[i] : 0;
            const arrow = Math.abs(g.pct) < 0.5 ? "→" : dz > 0 ? "↗" : "↘";
            return (
              <tr key={i} onClick={() => setSelVertex(i)} style={{ background: i === selVertex ? `${col}22` : "transparent", cursor: "pointer", textAlign: "right" }}>
                <td style={{ textAlign: "left", padding: "3px 2px", color: i === selVertex ? col : T.tx }}>{i + 1}</td>
                <td style={{ padding: "3px 2px" }}>
                  <Num value={f.z?.[i] ?? null} nullable placeholder="自動" min={-30} max={60} width={56} onChange={(v) => setZ(i, v)} />
                </td>
                <td style={{ padding: "3px 2px" }}>
                  <Num value={ready ? r2(sh.elev[i]) : null} min={-50} max={200} width={62} onChange={(v) => ready && setZ(i, r2(v - sh.ground[i]))} />
                </td>
                <td style={{ color: Math.abs(g.pct) > 100 ? T.yellow : T.txH, whiteSpace: "nowrap" }}>
                  {!last && isPath && (
                    <button type="button" onClick={(e) => { e.stopPropagation(); toggleFlat(i); }} title="この区間を踊り場（平ら）にする／戻す"
                      style={{ marginRight: 4, padding: "1px 6px", borderRadius: 5, border: `1px solid ${f.flat?.[i] ? col : T.bdL}`, background: f.flat?.[i] ? `${col}33` : "transparent", color: f.flat?.[i] ? col : T.txD, fontSize: 10, cursor: "pointer", fontFamily: "inherit" }}>
                      {f.flat?.[i] ? "踊り場" : f.type === "stairs" ? "段" : "坂"}
                    </button>
                  )}
                  {last || f.flat?.[i] ? "" : f.type === "stairs" ? (n ? `${arrow} ${n}段` : "平ら") : `${arrow} ${Math.abs(g.pct).toFixed(0)}% (${g.deg.toFixed(0)}°)`}
                </td>
                {isBridge && <td style={{ color: T.txD }}>{fmt1(sh.elev[i] - f.thickness - sh.ground[i])}</td>}
              </tr>
            );
          })}
        </tbody>
      </table>
      <Muted style={{ marginTop: 4 }}>
        {isBridge ? "地面から＝その点の真下の地面から床までの高さ。" : "地面から＝その点の元の地面からの高さ（−で掘る、＋で盛る）。"}
        空欄は自動（両端は地面、途中は前後の点を結ぶ。踊り場は平らにして、高さの差は残りの区間に割り振る）。標高（m）を直接入れてもよい。
      </Muted>

      {isPath && <>
        <Sub>踊り場</Sub>
        <Row label="">
          <label style={{ display: "flex", gap: 5, alignItems: "center" }}>
            <input type="checkbox" checked={!!f.corner} onChange={(e) => update({ corner: e.target.checked })} />曲がり角を踊り場にする（幅のぶん平らに）
          </label>
        </Row>
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", fontSize: 12, color: T.tx }}>
          <Num value={every} min={f.type === "stairs" ? 2 : 0.1} max={f.type === "stairs" ? 60 : 10} step={f.type === "stairs" ? 1 : 0.05} width={52} onChange={setEvery} />
          <span>{f.type === "stairs" ? "段ごとに" : "m 上がるごとに"}</span>
          <Num value={landLen} min={0.5} max={10} step={0.1} width={52} onChange={setLandLen} />
          <span>m の踊り場を</span>
          <Btn col={col} onClick={addLandings}>入れる</Btn>
        </div>
        <Muted style={{ marginTop: 4 }}>長い{f.type === "stairs" ? "段" : "坂"}の区間を同じ高さずつに分けて、あいだに踊り場を足す（点が増える）。区間ごとの「{f.type === "stairs" ? "段" : "坂"}／踊り場」は上の表のボタンでも切り替えられる</Muted>
      </>}

      {!isBridge && <>
        <Sub>横幅と両わき（点{si + 1}の断面）</Sub>
        {ready ? <SectionSvg width={r2(wv[si])} base={wv[si] + 2 * edgeW} side={f.side} inner={sh.elev[si]} outer={sh.ground[si]} rails={f.type === "stairs" ? rails : []} shift={cv[si]} walls={f.walls !== false} col={col} /> : <Muted>標高を読み込み中…</Muted>}
        <Row label={`${TYPE_LABEL[f.type]}の横幅 (m)`}>
          <Num value={f.width} min={0.5} max={60} onChange={(v) => update({ width: v }, "width")} />
        </Row>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11, margin: "4px 0" }}>
          <thead>
            <tr style={{ color: T.txD, textAlign: "right" }}>
              <th style={{ ...th, textAlign: "left" }}>点</th><th style={th}>横幅 m</th><th style={th}>ずれ m（左が＋）</th>
            </tr>
          </thead>
          <tbody>
            {f.coords.map((_, i) => (
              <tr key={i} onClick={() => setSelVertex(i)} style={{ background: i === selVertex ? `${col}22` : "transparent", cursor: "pointer", textAlign: "right" }}>
                <td style={{ textAlign: "left", padding: "2px", color: i === selVertex ? col : T.tx }}>{i + 1}</td>
                <td style={{ padding: "2px" }}><Num value={f.widths?.[i] ?? null} nullable placeholder={String(r2(wv[i]))} min={0.5} max={60} width={56} onChange={(v) => setW(i, v)} /></td>
                <td style={{ padding: "2px" }}><Num value={f.shifts?.[i] ?? null} nullable placeholder={String(r2(cv[i]))} min={-30} max={30} width={56} onChange={(v) => setC(i, v)} /></td>
              </tr>
            ))}
          </tbody>
        </table>
        {(f.widths || f.shifts) && (
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 4 }}>
            {f.widths && <Btn onClick={() => update({ widths: undefined })} title="点ごとの横幅を消して、どこも同じ横幅にする">どこも同じ幅に</Btn>}
            {f.shifts && <Btn onClick={() => update({ shifts: undefined })} title="帯を描いた線のまん中に戻す">ずれをなくす</Btn>}
          </div>
        )}
        <Muted style={{ marginBottom: 4 }}>
          空欄は自動（両端なら上の横幅・ずれ 0、途中は前後の点のあいだを結ぶ）。両端だけ入れると、だんだん広がる台形に。ずれは帯の中心を描いた線から横へずらす（上底を横にずらした台形など）。
          地図で選ぶと、各点の両わきに四角いつまみが出る。ドラッグすると、反対側のふちはそのままで横幅とずれが変わる（平地のふちや角に吸い付く。Alt で外す）
        </Muted>
        <Row label="両わき">
          <Btn active={f.side === 0 && f.walls !== false} col={col} onClick={() => update({ side: 0, walls: undefined })} title="両わきと両端に擁壁を立てる">擁壁</Btn>
          <Btn active={f.side > 0} col={col} onClick={() => update({ side: f.side > 0 ? f.side : 3, walls: undefined })} title="壁を立てず、まわりの地面へ斜面でつなぐ">斜面</Btn>
          {f.type === "stairs" && <Btn active={f.side === 0 && f.walls === false} col={col} onClick={() => update({ side: 0, walls: false })} title="壁も斜面も作らない（平地の中に置いて、平地の壁を両わきの壁にするとき）">なし</Btn>}
        </Row>
        {autoOpen && (
          <div style={{ fontSize: 10, color: T.yellow, lineHeight: 1.6, margin: "0 0 6px" }}>
            両わきとも平地のふちに沿っているので、階段の壁は立てずに平地の壁を両わきの壁にしています（自動。「なし」と同じ）。高さのそろった1枚の壁になる
          </div>
        )}
        {f.side === 0 && f.walls !== false && !autoOpen && (
          <Row label="土台の横幅 (m)">
            <Num value={f.base ?? null} nullable placeholder={`自動 ${fmt2(baseWidth({ ...f, base: null }))}`} min={f.width} max={80} width={84} onChange={(v) => update({ base: v }, "base")} />
            <span style={{ fontSize: 10, color: T.txD }}>{edgeW > 0.01 ? `壁 ${fmt2(edgeW)} m ずつ` : ""}</span>
          </Row>
        )}
        {f.side > 0 && <>
          <Row label="斜面の幅 (m)"><Num value={f.side} min={0.1} max={30} onChange={(v) => update({ side: v }, "side")} /></Row>
          <Row label="土台の横幅 (m)">
            <Num value={f.base ?? null} nullable placeholder={`自動 ${fmt2(baseWidth({ ...f, base: null }))}`} min={f.width} max={80} width={84} onChange={(v) => update({ base: v }, "base")} />
            <span style={{ fontSize: 10, color: T.txD }}>{edgeW > 0.01 ? `路肩 ${fmt2(edgeW)} m ずつ` : ""}</span>
          </Row>
        </>}
        <Muted>
          {TYPE_LABEL[f.type]}の横幅は歩くところ{f.type === "stairs" ? "（段）" : ""}の幅。擁壁：両わきと両端に壁（土台の横幅は壁を含めた全体の幅、空欄は自動で両わきに 1.2m ずつ）。
          斜面：壁を立てず、土台のふちから元の地面へ斜面でつなぐ。{f.type === "stairs" && "なし：壁も斜面も作らない。平地のふちに合わせて置くと、平地の壁がそのまま両わきの壁になる（平地の高さは階段の下の端にそろえる）"}
          {f.type === "slope" && f.side === 0 && edgeW < 1.2 && <span style={{ color: T.yellow }}>　壁が 1.2m より細いと、まわりの地面とのつなぎ目が見えることがある</span>}
        </Muted>
      </>}

      {f.type === "stairs" && <>
        <Sub>手すり</Sub>
        <div style={{ display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap", fontSize: 12, color: T.tx }}>
          <span>本数</span>
          <Num value={rails.length} min={0} max={12} step={1} width={44} onChange={(n) => update({ rails: evenRails(Math.round(n)) }, "railsN")} />
          <Btn onClick={() => update({ rails: [0, 1] })} title="段の両端に1本ずつ">両端</Btn>
          <Btn onClick={() => update({ rails: [0.5] })} title="段のまん中に1本">まん中</Btn>
          <Btn onClick={() => update({ rails: [0, 0.5, 1] })}>両端とまん中</Btn>
          {edgeW > 0.1 && <Btn onClick={() => update({ rails: [-edgeW / 2 / f.width, 1 + edgeW / 2 / f.width] })} title="両わきの土台の上（まん中）に1本ずつ">{f.side === 0 ? "壁の上" : "路肩の上"}</Btn>}
          <Btn onClick={() => update({ rails: [] })}>なし</Btn>
        </div>
        {rails.length > 0 && (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11, marginTop: 6 }}>
            <thead>
              <tr style={{ color: T.txD, textAlign: "right" }}>
                <th style={{ ...th, textAlign: "left" }}>手すり</th><th style={th}>左の端から m</th><th style={{ ...th, textAlign: "left" }}>場所</th><th style={th}></th>
              </tr>
            </thead>
            <tbody>
              {rails.map((r, k) => (
                <tr key={k} style={{ textAlign: "right" }}>
                  <td style={{ textAlign: "left", color: T.tx }}>{k + 1}</td>
                  <td style={{ padding: "2px" }}><Num value={r2(r * f.width)} min={r2(-edgeW)} max={r2(f.width + edgeW)} step={0.05} width={64} onChange={(v) => setRail(k, v)} /></td>
                  <td style={{ textAlign: "left", color: T.txD, paddingLeft: 6 }}>{r >= 0 && r <= 1 ? (Math.abs(r - 0.5) < 0.005 ? "段のまん中" : "段の上") : `${r < 0 ? "左" : "右"}の${f.side === 0 ? "壁" : "路肩"}の上`}</td>
                  <td><Btn onClick={() => update({ rails: rails.filter((_, j) => j !== k) })} title="この手すりを消す">×</Btn></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div style={{ marginTop: 6 }}><Btn onClick={() => update({ rails: [...rails, 0.5] })} disabled={rails.length >= 12}>1本足す（まん中に）</Btn></div>
        <Muted style={{ marginTop: 4 }}>
          位置は、点1から点2を見て段の左の端からの距離（0〜{f.width} m が段の上）。マイナスか段の横幅より大きくすると、土台（{f.side === 0 ? "壁" : "路肩"}）の上。
          本数を変えると、段の両端から同じ間隔で並べ直す。段の横幅を変えても、並び方（端・まん中）はそのまま{f.widths ? "（点ごとに横幅が違うときは、上の「横幅」での位置。広いところでは同じ割合の位置に並ぶ）" : ""}
        </Muted>
      </>}

      {f.type === "stairs" && <>
        <Sub>段と踊り場（点1の側から）</Sub>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
          <thead>
            <tr style={{ color: T.txD, textAlign: "right" }}>
              <th style={{ ...th, textAlign: "left" }}>区間</th><th style={th}></th><th style={th}>段数</th><th style={th}>踏面 m</th><th style={th}>長さ m</th>
            </tr>
          </thead>
          <tbody>
            {segLen.map((len, i) => {
              const landing = !!f.flat?.[i];
              const n = segN[i];
              const tread = treadOf(segFl[i]);
              const top = !landing && !!segFl[i]?.top;
              return (
                <tr key={i} style={{ textAlign: "right" }}>
                  <td style={{ textAlign: "left", color: T.tx, whiteSpace: "nowrap" }} title={top ? "上がりきった一段（上の高さの踏面）も含む区間。長さ＝段数×踏面" : undefined}>{i + 1}→{i + 2}{top ? "＊" : ""}</td>
                  <td>
                    <button type="button" onClick={() => toggleFlat(i)} title="段の区間と踊り場を切り替える"
                      style={{ padding: "1px 6px", borderRadius: 5, border: `1px solid ${landing ? col : T.bdL}`, background: landing ? `${col}33` : "transparent", color: landing ? col : T.txD, fontSize: 10, cursor: "pointer", fontFamily: "inherit" }}>
                      {landing ? "踊り場" : "段"}
                    </button>
                  </td>
                  <td style={{ padding: "2px" }}>{landing ? <span style={{ color: T.txD }}>—</span> : <Num value={n || null} min={1} max={200} step={1} width={46} onChange={(v) => setSegment(i, "n", v)} />}</td>
                  <td style={{ padding: "2px" }}>{landing || !tread ? <span style={{ color: T.txD }}>—</span> : <Num value={r2(tread)} min={0.1} max={3} step={0.01} width={54} onChange={(v) => setSegment(i, "tread", v)} />}</td>
                  <td style={{ padding: "2px" }}><Num value={r2(len)} min={0.1} max={200} step={0.05} width={56} onChange={(v) => setSegment(i, "len", v)} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <Muted style={{ marginTop: 4 }}>
          段数＝蹴上げの数。段の区間は両端が蹴上げで、長さ＝踏面×（段数−1）。踊り場は入れた長さのまま見える。
          ＊の区間（上の地面や次の段に直接つながる）は、上がりきった一段も含めて 長さ＝踏面×段数。
          踏面か長さを変えると段数はそのまま。段数を変えると、最後に踏面を入れた区間は踏面を、ほかは長さを保つ。長さが変わると、その区間の向きのまま、うしろの点がずれる。
          {manual ? "段数は手で決めている。蹴上げはどの段も同じ（高さの差 ÷ 段数の合計）" : "段数はいま、一段の高さから自動で決まっている。数を入れると手で決めたことになる"}
        </Muted>
        {manual
          ? <Row label="一段の高さ"><span style={{ fontSize: 12, color: T.txH }}>{rises.length ? `${fmt2(Math.min(...rises))}${Math.max(...rises) - Math.min(...rises) > 0.005 ? `〜${fmt2(Math.max(...rises))}` : ""} m（自動）` : "—"}</span><Btn onClick={() => update({ steps: undefined })} title="段数を、一段の高さから自動で決める">段数を自動に戻す</Btn></Row>
          : <Row label="一段の高さ (m)"><Num value={f.riser} min={0.08} max={0.4} step={0.01} onChange={(v) => update({ riser: v }, "riser")} /></Row>}
        <Row label="段の材質">
          <div style={{ display: "flex", gap: 6 }}>
            {Object.entries(STAIRS_MATERIAL_LABEL).map(([k, v]) => <Btn key={k} active={(f.material || "") === k} col={TYPE_COL.stairs} onClick={() => update({ material: k || undefined })}>{v}</Btn>)}
          </div>
        </Row>
        <Muted>
          {totalSteps ? `${totalSteps}段・踏面 ${treads.length ? fmt2(Math.min(...treads)) : "—"}${treads.length && Math.max(...treads) - Math.min(...treads) > 0.01 ? `〜${fmt2(Math.max(...treads))}` : ""} m` : "高さの差がないので段はない（両端の高さを変える）"}
          {treads.length > 0 && Math.min(...treads) < 0.22 && <span style={{ color: T.yellow }}>　踏面がせまい（急な階段）。点のあいだを長くするか、一段を高く</span>}
          {treads.length > 0 && Math.max(...treads) > 0.8 && <span style={{ color: T.yellow }}>　踏面が広い。坂のほうが合うかも</span>}
        </Muted>
      </>}

      {isBridge && lift && <>
        <Sub>ルート案内</Sub>
        {lift.len > 1
          ? <Muted style={{ color: T.txH }}><span style={{ color: LIFT_COL, fontWeight: 700 }}>経路の線 {lift.len.toFixed(0)} m</span> がこの橋の上を通る（地図の青い線）。ルートはここで橋の上に浮く</Muted>
          : <Muted style={{ color: T.yellow }}>経路の線がこの橋の上を通っていないので、ルート案内は地面のまま。経路の線（通路）に重ねて描くか、下のボタンで合わせる</Muted>}
        <div style={{ marginTop: 6 }}><Btn col={LIFT_COL} active={lift.len <= 1} onClick={onAlign} title="橋の各点を、近くの経路の線（8m 以内）に合わせる">経路の線に合わせる</Btn></div>
      </>}
      {isBridge && <>
        <Sub>床</Sub>
        <Row label="幅 (m)"><Num value={f.width} min={0.5} max={60} onChange={(v) => update({ width: v }, "width")} /></Row>
        <Row label="床の厚さ (m)"><Num value={f.thickness} min={0.05} max={5} step={0.05} onChange={(v) => update({ thickness: v }, "thickness")} /></Row>
        <Row label="床">
          <select value={f.surface} onChange={(e) => update({ surface: e.target.value })} style={{ padding: "4px 6px", borderRadius: 5, border: `1px solid ${T.bdL}`, background: T.bg, color: T.txH, fontSize: 12 }}>
            {Object.entries(SURFACE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </Row>
        <Row label="">
          <label style={{ display: "flex", gap: 5, alignItems: "center" }}><input type="checkbox" checked={f.railing} onChange={(e) => update({ railing: e.target.checked })} />手すり</label>
          <label style={{ display: "flex", gap: 5, alignItems: "center" }}><input type="checkbox" checked={f.piers} onChange={(e) => update({ piers: e.target.checked })} />柱</label>
        </Row>
      </>}
    </div>
  );
}

export default function Map3DEditor() {
  const mapLibre = useMapLibre(true);
  const [bmData, setBmData] = useState(null);
  const [features, setFeatures] = useState(null);
  const [savedText, setSavedText] = useState("");
  const [mapFeatures, setMapFeatures] = useState(null); // 3D地図に渡す（入力のたびに作り直さないよう少し遅らせる）
  const [tool, setTool] = useState("select");
  const [draft, setDraft] = useState([]);
  const [selId, setSelId] = useState(null);
  const [carveIdx, setCarveIdx] = useState(0); // 選んでいる建物の、選んでいるくり抜き
  const carveRedraw = useRef(null); // くり抜きを描き直すときの番号
  useEffect(() => setCarveIdx(0), [selId]);
  const [boardIdx, setBoardIdx] = useState(null); // 選んでいる建物の、選んでいる屋根の板
  const [boardNext, setBoardNext] = useState({ mode: "auto", top: 1, step: 0.4, kind: "deck" }); // 次に描く板
  const [hide3d, setHide3d] = useState(false); // 立体の屋根を隠して、下絵と板の線だけ見る
  const lastBoardDir = useRef(null); // 前に描いた板の向き（平面の m。次の板を平行にそろえる）
  useEffect(() => setBoardIdx(null), [selId]);
  const [refs, setRefs] = useState([]); // 下絵（開発サーバーの data/map-3d-ref）
  const [refShow, setRefShow] = useState({}); // 出している下絵：id → 濃さ
  const [selVertex, setSelVertex] = useState(null);
  const [cands, setCands] = useState([]);
  const [showCands, setShowCands] = useState(true);
  const [selCand, setSelCand] = useState(null);
  const [seeThrough, setSeeThrough] = useState(true);
  const [photo, setPhoto] = useState(false); // 航空写真を下に敷く
  const [photoOpacity, setPhotoOpacity] = useState(0.85);
  const [canSave, setCanSave] = useState(null);
  const [restore, setRestore] = useState(null); // 保存していない前回の編集 { features, at }
  const [toast, setToast] = useState(null);
  const [mapReady, setMapReady] = useState(false);
  const [demTick, setDemTick] = useState(0);
  const [snapOn, setSnapOn] = useState(true);
  const altRef = useRef(false); // Alt を押しているあいだは道に合わせない
  const snapFns = useRef({}); // 地図の準備ができたら { snapAt, showSnap }
  const mapApi = useRef(null);
  const hist = useRef({ past: [], future: [], key: null, at: 0 });
  const cur = useRef(null); // いまの構造物（続けて変更しても、描き直しを待たずに最新を使う）
  const markers = useRef([]);
  const S = useRef({}); // 地図のイベントから最新の状態を見るため

  const say = useCallback((msg, err = false) => {
    setToast({ msg, err });
    setTimeout(() => setToast((t) => (t && t.msg === msg ? null : t)), 2600);
  }, []);

  /* ── 読み込み：地図データ・構造物・OSM の候補・保存できるか ── */
  useEffect(() => {
    import("../../campus-sns/campusBasemapData.js").then((m) => setBmData(m.BASEMAP));
    fetch(FEATURES_URL, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null)
      .then((j) => {
        const list = parseFeatures(j);
        const text = serializeFeatures(list);
        cur.current = list;
        setFeatures(list);
        setMapFeatures(list);
        setSavedText(text);
        try {
          const d = JSON.parse(localStorage.getItem(DRAFT_KEY) || "null");
          if (d && Array.isArray(d.features) && serializeFeatures(parseFeatures(d)) !== text) setRestore(d);
        } catch { /* 下書きが壊れていたら使わない */ }
      });
    fetch(CANDIDATES_URL).then((r) => (r.ok ? r.json() : null)).catch(() => null).then((j) => setCands((j && j.candidates) || []));
    fetch(API).then((r) => setCanSave(r.ok)).catch(() => setCanSave(false));
    fetch(REF_API).then((r) => (r.ok ? r.json() : null)).catch(() => null).then((j) => setRefs((j && j.refs) || []));
  }, []);

  const dirty = useMemo(() => features != null && serializeFeatures(features) !== savedText, [features, savedText]);
  // 合わせる先の道：道路・通路（経路の網）・線路
  const snapIndex = useMemo(() => bmData && buildSnapIndex([...streetLines(bmData), ...bmData.rail.surface.map((pts) => ({ k: "rail", pts }))]), [bmData]);
  // 経路の網の線（ルート案内が通る道）。橋の上を通るかの確認と「経路の線に合わせる」に使う
  const walkLines = useMemo(() => (bmData ? streetLines(bmData).filter((l) => l.k === "walk").map((l) => l.pts) : null), [bmData]);
  const walkIndex = useMemo(() => walkLines && buildSnapIndex(walkLines.map((pts) => ({ k: "walk", pts }))), [walkLines]);

  // 3D地図への反映は、打ち終わってから
  useEffect(() => {
    if (!features) return undefined;
    const id = setTimeout(() => setMapFeatures(features), 250);
    return () => clearTimeout(id);
  }, [features]);

  // 表の高さを出すため、構造物のまわりの標高を読んでおく
  useEffect(() => {
    if (!features?.length) return;
    dem.ensure(featuresBounds(features)).then(() => setDemTick((v) => v + 1));
  }, [features]);

  // 保存していない編集は、この端末に下書きとして残す
  useEffect(() => {
    if (!features) return undefined;
    const id = setTimeout(() => {
      try {
        if (dirty) localStorage.setItem(DRAFT_KEY, JSON.stringify({ features, at: Date.now() }));
        else localStorage.removeItem(DRAFT_KEY);
      } catch { /* 保存できなくても編集は続けられる */ }
    }, 500);
    return () => clearTimeout(id);
  }, [features, dirty]);
  useEffect(() => {
    const onUnload = (e) => {
      if (!S.current.dirty) return;
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onUnload);
    return () => window.removeEventListener("beforeunload", onUnload);
  }, []);

  /* ── 変更と元に戻す ── */
  // key が同じ連続した変更（同じ欄への入力など）は、元に戻すとき1回にまとめる
  const commit = useCallback((next, key = null) => {
    const prev = cur.current;
    const value = typeof next === "function" ? next(prev) : next;
    const h = hist.current;
    const now = Date.now();
    if (!(key && h.key === key && now - h.at < 1500)) {
      h.past.push(prev);
      if (h.past.length > 100) h.past.shift();
    }
    h.future = [];
    h.key = key;
    h.at = now;
    cur.current = value;
    setFeatures(value);
  }, []);
  const undo = useCallback(() => {
    const h = hist.current;
    if (!h.past.length) return;
    h.future.push(cur.current);
    h.key = null;
    cur.current = h.past.pop();
    setFeatures(cur.current);
  }, []);
  const redo = useCallback(() => {
    const h = hist.current;
    if (!h.future.length) return;
    h.past.push(cur.current);
    h.key = null;
    cur.current = h.future.pop();
    setFeatures(cur.current);
  }, []);
  const updateFeature = useCallback((id, patch, key) => {
    commit((list) => list.map((f) => (f.id === id ? normalizeFeature({ ...f, ...(typeof patch === "function" ? patch(f) : patch) }) || f : f)), key ? `${id}:${key}` : null);
  }, [commit]);

  const sel = features?.find((f) => f.id === selId) || null;
  const select = useCallback((id) => {
    setSelId(id);
    setSelVertex(null);
    setSelCand(null);
  }, []);

  /* ── 描く ── */
  // add は最後に足す点、full は点の並びをまるごと（地図の道を取り込む・道路を渡る横断歩道）、extra は既定値に重ねる設定
  const finishDraft = useCallback((add, full, extra) => {
    const { draft: d0, tool: tl } = S.current;
    const d = Array.isArray(full) ? full : Array.isArray(add) ? [...d0, add] : d0;
    const pts = d.filter((p, i) => i === 0 || !near(p, d[i - 1])); // ダブルクリックで重なった点は1つに
    setDraft([]);
    // 屋根の板：選んでいる建物に足す（道具はそのまま＝続けて次の板を描く）。高さは「自動」なら斜めに切った屋根の、板のまん中の高さ
    if (tl === "board") {
      const b = S.current.sel;
      if (!b || b.type !== "building" || pts.length < 3) return;
      const ring = boardRect(pts[0], pts[1], pts[2]);
      if (!ring) return;
      const nx = S.current.boardNext;
      const xy = ring.map(toXY);
      const mid = xy.reduce((a, p) => [a[0] + p[0] / 4, a[1] + p[1] / 4], [0, 0]);
      const top = nx.mode === "auto" ? Math.round(Math.max(0, buildingRoof({ ...b, boards: undefined }).hSmooth(mid)) * 20) / 20 : nx.top;
      lastBoardDir.current = [xy[1][0] - xy[0][0], xy[1][1] - xy[0][1]];
      updateFeature(b.id, (g) => ({ boards: [...(g.boards || []), { coords: ring, top, ...(nx.kind === "green" ? { kind: "green" } : {}) }] }));
      setBoardIdx((b.boards || []).length);
      if (nx.mode === "fixed" && nx.step) setBoardNext((v) => ({ ...v, top: Math.round((v.top + v.step) * 100) / 100 }));
      return;
    }
    // 建物のくり抜き：選んでいる建物に足す（描き直しなら、その範囲を置きかえる）
    if (tl === "carve") {
      const redo = carveRedraw.current;
      carveRedraw.current = null;
      setTool("select");
      const b = S.current.sel;
      if (!b || b.type !== "building" || pts.length < 3) return;
      const list = b.carves || [];
      const idx = redo != null && list[redo] ? redo : list.length;
      updateFeature(b.id, (g) => {
        const cs = g.carves || [];
        return { carves: idx < cs.length ? cs.map((cv, j) => (j === idx ? { ...cv, coords: pts, floors: undefined, ceils: undefined } : cv)) : [...cs, defaultCarve(g, pts)] };
      });
      setCarveIdx(idx);
      return;
    }
    if (tl === "select" || pts.length < minPoints(tl)) return;
    const f = createFeature(tl, pts, extra);
    if (!f) return;
    commit((list) => [...list, f]);
    setTool("select");
    setSelId(f.id);
    setSelVertex(null);
    setSelCand(null);
  }, [commit, updateFeature]);

  // 描いている形に点を1つ足す。横断歩道は渡る向きの2点で決まる：2点目で確定。木は1点で確定。屋根の板は3点目で確定
  const addDraftPoint = useCallback((pt) => {
    const s = S.current;
    if ((s.tool === "crosswalk" && s.draft.length >= 1) || (s.tool === "board" && s.draft.length >= 2) || isPoint(s.tool)) s.finishDraft(pt);
    else setDraft((d) => [...d, pt]);
  }, []);

  const removeVertex = useCallback((id, v) => {
    updateFeature(id, (g) => {
      // 消した点の前後の区間は1つになる（どちらも踊り場なら踊り場のまま）
      const fl = g.flat;
      const flat = !fl ? fl : v === 0 ? fl.slice(1) : v === g.coords.length - 1 ? fl.slice(0, -1) : [...fl.slice(0, v - 1), fl[v - 1] && fl[v], ...fl.slice(v + 1)];
      // 段数を手で決めているときは、つないだ区間の段数を足す
      const st = g.steps;
      const steps = !st ? st : v === 0 ? st.slice(1) : v === g.coords.length - 1 ? st.slice(0, -1) : [...st.slice(0, v - 1), (st[v - 1] || 0) + (st[v] || 0) || null, ...st.slice(v + 1)];
      // 建物のガラスの辺（辺 i は点 i → 点 i+1、輪）：消した点の前後の辺は1つになり、どちらかがガラスならガラス
      // 軒を出す辺も同じ
      const n = g.coords.length;
      const sides = (gs) => (!gs ? gs : v === 0 ? [...gs.slice(1, n - 1), gs[n - 1] || gs[0]] : [...gs.slice(0, v - 1), gs[v - 1] || gs[v], ...gs.slice(v + 1)]);
      // 平地の辺ごとの面（ガラス・れんが）も同じく1つに（扉の位置はつないだ辺の上に直す）
      const xy = g.coords.map(toXY);
      const lens = xy.map((p, i) => Math.hypot(xy[(i + 1) % n][0] - p[0], xy[(i + 1) % n][1] - p[1]));
      return { coords: g.coords.filter((_, i) => i !== v), z: g.z ? g.z.filter((_, i) => i !== v) : g.z, flat, steps, widths: g.widths ? g.widths.filter((_, i) => i !== v) : g.widths, shifts: g.shifts ? g.shifts.filter((_, i) => i !== v) : g.shifts, glassSides: sides(g.glassSides), eaveSides: sides(g.eaveSides), faces: facesDelete(g.faces, v, lens) };
    });
    setSelVertex(null);
  }, [updateFeature]);
  const removeFeature = useCallback((id) => {
    commit((list) => list.filter((g) => g.id !== id));
    setSelId(null);
    setSelVertex(null);
  }, [commit]);
  // Delete キー：屋根の板を選んでいればその板、点を選んでいればその点（2点より多いとき）、でなければ構造物ごと
  const removeSelected = useCallback(() => {
    const { sel: f, selVertex: v, boardIdx: bi } = S.current;
    if (!f) return;
    if (f.type === "building" && bi != null && f.boards?.[bi]) {
      updateFeature(f.id, (g) => ({ boards: (g.boards || []).filter((_, j) => j !== bi) }));
      setBoardIdx(null);
      return;
    }
    if (v != null && f.coords.length > minPoints(f.type)) removeVertex(f.id, v);
    else removeFeature(f.id);
  }, [removeVertex, removeFeature, updateFeature]);

  const adopt = useCallback((c) => {
    const f = candidateToFeature(c);
    if (!f) return;
    commit((list) => [...list, f]);
    setSelId(f.id);
    setSelVertex(null);
    setSelCand(null);
    say(`${TYPE_LABEL[f.type]}を取り込みました`);
  }, [commit, say]);

  const flyTo = useCallback((coords) => {
    const map = mapApi.current?.getMap();
    if (!map || !coords.length) return;
    const lngs = coords.map((c) => c[0]);
    const lats = coords.map((c) => c[1]);
    map.fitBounds([[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]], { padding: 140, maxZoom: 19, duration: 600 });
  }, []);

  /* ── 保存・書き出し・読み込み ── */
  const save = useCallback(async () => {
    const list = S.current.features;
    if (!list) return;
    try {
      const r = await fetch(API, { method: "POST", headers: { "Content-Type": "application/json" }, body: serializeFeatures(list) });
      if (!r.ok) throw new Error(String(r.status));
      setSavedText(serializeFeatures(list));
      try { localStorage.removeItem(DRAFT_KEY); } catch { /* なくてよい */ }
      say(`保存しました（${list.length}件）`);
    } catch (e) {
      say(`保存できませんでした（${e.message}）`, true);
    }
  }, [say]);
  const download = useCallback(() => {
    const blob = new Blob([serializeFeatures(S.current.features || [])], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "features.json";
    a.click();
    URL.revokeObjectURL(a.href);
  }, []);
  const fileRef = useRef(null);
  const importFile = useCallback((file) => {
    file.text().then((txt) => {
      const list = parseFeatures(JSON.parse(txt));
      commit(list);
      select(null);
      say(`読み込みました（${list.length}件）`);
    }).catch(() => say("JSON を読めませんでした", true));
  }, [commit, select, say]);

  S.current = { features, draft, tool, sel, selVertex, boardIdx, boardNext, showCands, cands, dirty, snapOn, snapIndex, bmData, finishDraft, addDraftPoint, removeSelected, undo, redo, save };

  // Alt を押しているあいだは道に合わせない（点のドラッグ中はマウスのイベントが来ないので、キーで見る）
  useEffect(() => {
    const onDown = (e) => {
      if (e.key !== "Alt") return;
      altRef.current = true;
      e.preventDefault(); // Windows でメニューに入らないように
    };
    const onUp = (e) => {
      if (e.key !== "Alt") return;
      altRef.current = false;
      e.preventDefault();
    };
    const onBlur = () => { altRef.current = false; };
    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
      window.removeEventListener("blur", onBlur);
    };
  }, []);

  /* ── キー操作 ── */
  useEffect(() => {
    const onKey = (e) => {
      const s = S.current;
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName);
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === "s") {
        e.preventDefault();
        s.save();
        return;
      }
      if (e.key === "Escape") {
        if (s.draft.length) setDraft([]);
        else if (s.tool !== "select") setTool("select");
        else { setSelId(null); setSelVertex(null); setSelCand(null); }
        return;
      }
      if (typing) return;
      if (e.key === "Enter" && s.draft.length) s.finishDraft();
      else if ((e.key === "Delete" || e.key === "Backspace") && s.sel) { e.preventDefault(); s.removeSelected(); }
      else if (mod && e.key.toLowerCase() === "z") { e.preventDefault(); if (e.shiftKey) s.redo(); else s.undo(); }
      else if (mod && e.key.toLowerCase() === "y") { e.preventDefault(); s.redo(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  /* ── 地図：編集用の線（建物の下に描くので、半透明の建物越しに見える）とクリック ── */
  useEffect(() => {
    if (!mapReady) return undefined;
    const map = mapApi.current?.getMap();
    if (!map) return undefined;
    map.doubleClickZoom.disable();
    const before = map.getLayer("nav-accuracy") ? "nav-accuracy" : undefined;
    map.addSource("ed-feat", { type: "geojson", data: EMPTY });
    map.addSource("ed-cands", { type: "geojson", data: EMPTY });
    map.addSource("ed-draft", { type: "geojson", data: EMPTY });
    map.addSource("ed-snap", { type: "geojson", data: EMPTY });
    map.addSource("ed-lift", { type: "geojson", data: EMPTY });
    map.addSource("ed-pick", { type: "geojson", data: EMPTY });
    map.addSource("ed-boards", { type: "geojson", data: EMPTY });
    const sel = ["==", ["get", "sel"], 1];
    [
      { id: "ed-fill", type: "fill", source: "ed-feat", filter: ["==", ["get", "fill"], 1], paint: { "fill-color": ["get", "col"], "fill-opacity": ["case", sel, 0.38, ["==", ["get", "pt"], 1], 0.04, 0.18] } },
      // 選んだ建物の屋根の板：中の色は高さ（t：0 低い〜1 高い）、線は赤（植え込みは緑、選んでいる板は黄色）
      { id: "ed-board-fill", type: "fill", source: "ed-boards", paint: { "fill-color": ["interpolate", ["linear"], ["get", "t"], 0, "#2b6cff", 0.5, "#f5d000", 1, "#ff3b1f"], "fill-opacity": ["case", sel, 0.5, 0.22] } },
      { id: "ed-board-line", type: "line", source: "ed-boards", layout: { "line-join": "round" }, paint: { "line-color": ["case", sel, "#ffe100", ["==", ["get", "g"], 1], "#21c25b", "#ff2020"], "line-width": ["case", sel, 3, 1.4] } },
      { id: "ed-cand-line", type: "line", source: "ed-cands", layout: { "line-cap": "round" }, paint: { "line-color": CAND_COL, "line-width": 3, "line-dasharray": [1.5, 1.5], "line-opacity": 0.85 } },
      { id: "ed-cand-hit", type: "line", source: "ed-cands", paint: { "line-color": "rgba(0,0,0,0)", "line-width": 16 } },
      // 道路・白線・横断歩道は、選んでいないときは線を出さない（地面の塗りがそのまま見える。クリックで選べる）
      { id: "ed-guide", type: "line", source: "ed-feat", filter: ["==", ["get", "fill"], 2], paint: { "line-color": ["get", "col"], "line-width": 2, "line-dasharray": [2, 1.5] } },
      { id: "ed-line", type: "line", source: "ed-feat", filter: ["==", ["get", "fill"], 0], layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": ["get", "col"], "line-width": ["case", sel, 4.5, 2.5], "line-opacity": ["case", sel, 1, ["==", ["get", "pt"], 1], 0, 1] } },
      { id: "ed-hit", type: "line", source: "ed-feat", filter: ["==", ["get", "fill"], 0], paint: { "line-color": "rgba(0,0,0,0)", "line-width": 18 } },
      { id: "ed-draft-line", type: "line", source: "ed-draft", filter: ["==", ["geometry-type"], "LineString"], layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": ["get", "col"], "line-width": 3, "line-dasharray": [2, 1.2] } },
      { id: "ed-draft-pt", type: "circle", source: "ed-draft", filter: ["==", ["geometry-type"], "Point"], paint: { "circle-radius": 5, "circle-color": ["get", "col"], "circle-stroke-color": "#ffffff", "circle-stroke-width": 2, "circle-pitch-alignment": "map" } },
      // 選んだ橋の上を通る経路の線（ルートが浮くところ）
      { id: "ed-lift", type: "line", source: "ed-lift", layout: { "line-cap": "round" }, paint: { "line-color": LIFT_COL, "line-width": 6, "line-opacity": 0.8, "line-dasharray": [1.2, 0.8] } },
      // 道に合わせたときの目印：合わせた線と、点（頂点なら大きい輪、線の上なら小さい輪）
      // 道路の道具で、クリックすると取り込む道
      { id: "ed-pick", type: "line", source: "ed-pick", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": SNAP_COL, "line-width": 9, "line-opacity": 0.5 } },
      { id: "ed-snap-seg", type: "line", source: "ed-snap", filter: ["==", ["geometry-type"], "LineString"], layout: { "line-cap": "round" }, paint: { "line-color": SNAP_COL, "line-width": 5, "line-opacity": 0.55 } },
      { id: "ed-snap-pt", type: "circle", source: "ed-snap", filter: ["==", ["geometry-type"], "Point"], paint: { "circle-radius": ["case", ["==", ["get", "v"], 1], 8, 5.5], "circle-color": "#ffffff", "circle-stroke-color": SNAP_COL, "circle-stroke-width": 3, "circle-pitch-alignment": "map" } },
    ].forEach((l) => map.addLayer(l, before));

    // 画面上の点 pt（マウスの位置）の近くに道があれば、そこへ合わせた点。なければ null
    const snapAt = (pt, ll, alt = false) => {
      const s = S.current;
      if (!s.snapOn || alt || altRef.current) return null;
      // くり抜き：建物のふち・角。屋根の板：建物のふち・角と、ほかの板のふち・角
      if ((s.tool === "carve" || s.tool === "board") && s.sel?.type === "building") {
        const rings = [s.sel.coords, ...(s.tool === "board" ? (s.sel.boards || []).map((b) => b.coords) : [])];
        let best = null;
        for (const r of rings) {
          r.forEach((c) => {
            const q = map.project(c);
            const d = Math.hypot(q.x - pt.x, q.y - pt.y);
            if (d <= SNAP_VERTEX_PX && (!best || d < best.d)) best = { ll: c, d, vertex: true };
          });
        }
        if (best) return best;
        for (const r of rings) {
          r.forEach((a, i) => {
            const b = r[(i + 1) % r.length];
            const A = map.project(a);
            const B = map.project(b);
            const dx = B.x - A.x;
            const dy = B.y - A.y;
            const l2 = dx * dx + dy * dy;
            if (l2 < 1) return;
            const t = Math.max(0, Math.min(1, ((pt.x - A.x) * dx + (pt.y - A.y) * dy) / l2));
            const d = Math.hypot(A.x + dx * t - pt.x, A.y + dy * t - pt.y);
            if (d <= SNAP_EDGE_PX && (!best || d < best.d)) best = { ll: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t], d, vertex: false, seg: [a, b] };
          });
        }
        if (best || s.tool === "board") return best;
      }
      if (!s.snapIndex) return null;
      // 許す距離を m に直して近くの道を集め（傾けると奥ほど縮むので広めに）、画面上の距離で確かめる
      const mpp = (78271.517 * Math.cos((ll.lat * Math.PI) / 180)) / 2 ** map.getZoom();
      const { vertex, edge } = nearestOnRoads(s.snapIndex, [ll.lng, ll.lat], SNAP_VERTEX_PX * mpp * 3);
      const px = (c) => {
        const q = map.project(c.ll);
        return Math.hypot(q.x - pt.x, q.y - pt.y);
      };
      if (vertex && px(vertex) <= SNAP_VERTEX_PX) return { ...vertex, vertex: true };
      if (edge && px(edge) <= SNAP_EDGE_PX) return { ...edge, vertex: false };
      return null;
    };
    const showSnap = (snap) => {
      map.getSource("ed-snap")?.setData(snap ? { type: "FeatureCollection", features: [
        ...(snap.seg ? [{ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: snap.seg } }] : []),
        { type: "Feature", properties: { v: snap.vertex ? 1 : 0 }, geometry: { type: "Point", coordinates: snap.ll } },
      ] } : EMPTY);
    };
    // 道路の道具で、まだ点を置いていないとき：マウスの下の地図の道を、交差点の先へまっすぐ続く道までつないだもの（Alt で拾わない）
    let picked = null;
    const pickAt = (pt, ll, alt = false) => {
      const s = S.current;
      if (s.tool !== "road" || s.draft.length || alt || altRef.current || !s.snapIndex) return null;
      const mpp = (78271.517 * Math.cos((ll.lat * Math.PI) / 180)) / 2 ** map.getZoom();
      const { edge } = nearestOnRoads(s.snapIndex, [ll.lng, ll.lat], PICK_PX * mpp * 3);
      if (!edge || !ROAD_KINDS.has(edge.k)) return null;
      const q = map.project(edge.ll);
      if (Math.hypot(q.x - pt.x, q.y - pt.y) > PICK_PX) return null;
      if (picked?.li !== edge.li) picked = { li: edge.li, chain: streetChain(s.snapIndex, edge.li) };
      return picked.chain;
    };
    const showPick = (chain) => {
      map.getSource("ed-pick")?.setData(chain ? { type: "FeatureCollection", features: [{ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: chain.coords } }] } : EMPTY);
    };
    snapFns.current = { snapAt, showSnap, showPick };

    // 屋根の板の道具で、次に置く点：角に吸い付けばその角。2点目は前の板（選んでいる板か、前に描いた板）とほぼ平行なら平行に
    // （ふちに吸い付いていれば、平行な線とふちの交わる点）
    const refDir = () => {
      const s = S.current;
      const b = s.sel?.boards?.[s.boardIdx];
      if (b) {
        const p = b.coords.map(toXY);
        return [p[1][0] - p[0][0], p[1][1] - p[0][1]];
      }
      return lastBoardDir.current;
    };
    const boardPoint = (pt, ll, alt) => {
      const s = S.current;
      const raw = [ll.lng, ll.lat];
      const snap = snapAt(pt, ll, alt);
      if (snap?.vertex) return { ll: snap.ll, snap };
      if (s.draft.length === 1 && !alt && !altRef.current) {
        const par = alignParallel(s.draft[0], snap ? snap.ll : raw, refDir());
        if (par) {
          const x = snap?.seg ? lineSegCross(par.a, par.u, snap.seg) : null;
          return { ll: x || par.ll, snap: x ? snap : null };
        }
      }
      return { ll: snap ? snap.ll : raw, snap };
    };
    // 選んだ建物の屋根の板の上にマウスを置くと、その板の高さ
    const tip = document.createElement("div");
    tip.style.cssText = "position:absolute;pointer-events:none;z-index:6;padding:2px 7px;border-radius:4px;background:rgba(20,20,26,.86);color:#fff;font:11px/1.5 sans-serif;white-space:nowrap;display:none";
    map.getContainer().appendChild(tip);
    const showTip = (ev) => {
      const s = S.current;
      const i = s.sel?.type === "building" && !s.draft.length ? boardAt(s.sel, [ev.lngLat.lng, ev.lngLat.lat]) : null;
      if (i == null) {
        tip.style.display = "none";
        return;
      }
      const b = s.sel.boards[i];
      tip.textContent = `板 #${i + 1}：高さ ${b.top.toFixed(2)} m${b.kind === "green" ? "・植え込み" : ""}${b.tops ? "・傾いた板" : ""}`;
      tip.style.left = `${ev.point.x + 14}px`;
      tip.style.top = `${ev.point.y + 12}px`;
      tip.style.display = "block";
    };

    const onClick = (ev) => {
      const s = S.current;
      if (mapApi.current?.isWalking?.()) return; // 歩いて見るあいだのタップは見回すため
      // 屋根の板：3回のクリックで1枚（Shift+クリックは板を選ぶ）
      if (s.tool === "board") {
        if (ev.originalEvent?.shiftKey) {
          const i = boardAt(s.sel, [ev.lngLat.lng, ev.lngLat.lat]);
          if (i != null) setBoardIdx(i);
          return;
        }
        s.addDraftPoint(boardPoint(ev.point, ev.lngLat, ev.originalEvent?.altKey).ll);
        return;
      }
      if (s.tool !== "select") {
        const alt = ev.originalEvent?.altKey;
        const ll = [ev.lngLat.lng, ev.lngLat.lat];
        // 道路：地図の道をクリックしたら、その道（まっすぐ続く先まで）を取り込む。設定は道の種類から
        const chain = pickAt(ev.point, ev.lngLat, alt);
        if (chain) {
          showPick(null);
          s.finishDraft(null, chain.coords, ROAD_PRESETS[chain.k]);
          return;
        }
        // 建物：地図の建物をクリックしたら、その形と高さで「建物」を作る（元の建物は描かれなくなる）
        if (s.tool === "building" && !s.draft.length && !alt) {
          const hit = map.queryRenderedFeatures(ev.point, { layers: ["cb-buildings"] })[0];
          const b = hit && s.bmData?.buildings[hit.properties.i];
          if (b) {
            s.finishDraft(null, b.p.map(([lat, lng]) => [lng, lat]), { height: buildingHeight(b) });
            return;
          }
        }
        // 横断歩道：道路の上をクリックしたら、その場所で道を直角に渡る横断歩道
        const across = s.tool === "crosswalk" && !s.draft.length && !alt ? crosswalkAcross(s.features, ll) : null;
        if (across) {
          s.finishDraft(null, across);
          return;
        }
        const snap = snapAt(ev.point, ev.lngLat, alt);
        s.addDraftPoint(snap ? snap.ll : ll);
        return;
      }
      // 選んでいる建物の屋根の板をクリック → その板を選ぶ
      if (s.sel?.type === "building" && s.sel.boards?.length) {
        const i = boardAt(s.sel, [ev.lngLat.lng, ev.lngLat.lat]);
        if (i != null) {
          setBoardIdx(i);
          return;
        }
      }
      const hit = map.queryRenderedFeatures(ev.point, { layers: ["ed-hit", "ed-fill"] })[0];
      if (hit) {
        setSelId(hit.properties.id);
        setSelVertex(null);
        setSelCand(null);
        return;
      }
      const c = s.showCands ? map.queryRenderedFeatures(ev.point, { layers: ["ed-cand-hit"] })[0] : null;
      if (c) {
        setSelCand(s.cands[c.properties.i]);
        setSelId(null);
        setSelVertex(null);
        return;
      }
      setSelId(null);
      setSelVertex(null);
      setSelCand(null);
    };
    const onDbl = (ev) => {
      if (S.current.tool === "select" || mapApi.current?.isWalking?.()) return;
      ev.preventDefault();
      S.current.finishDraft();
    };
    // 描く道具のときは、道に合う位置を示す。描いている途中は、最後の点からそこまでの線も出す
    const onMove = (ev) => {
      const s = S.current;
      if (mapApi.current?.isWalking?.()) return;
      showTip(ev);
      if (s.tool === "select") return;
      // 屋根の板：1点目のあとは前のふちの線、2点目のあとは板の形（長方形）
      if (s.tool === "board") {
        const bp = boardPoint(ev.point, ev.lngLat, ev.originalEvent?.altKey);
        showSnap(bp.snap);
        const col = TYPE_COL.board;
        const feats = s.draft.map((p) => ({ type: "Feature", properties: { col }, geometry: { type: "Point", coordinates: p } }));
        if (s.draft.length === 1) feats.push({ type: "Feature", properties: { col }, geometry: { type: "LineString", coordinates: [s.draft[0], bp.ll] } });
        const r = s.draft.length === 2 ? boardRect(s.draft[0], s.draft[1], bp.ll) : null;
        if (r) feats.push({ type: "Feature", properties: { col }, geometry: { type: "LineString", coordinates: [...r, r[0]] } });
        map.getSource("ed-draft")?.setData({ type: "FeatureCollection", features: feats });
        return;
      }
      const chain = pickAt(ev.point, ev.lngLat, ev.originalEvent?.altKey);
      showPick(chain);
      const snap = chain ? null : snapAt(ev.point, ev.lngLat, ev.originalEvent?.altKey);
      showSnap(snap);
      if (!s.draft.length) return;
      const col = TYPE_COL[s.tool];
      const pts = [...s.draft, snap ? snap.ll : [ev.lngLat.lng, ev.lngLat.lat], ...(closedTool(s.tool) ? [s.draft[0]] : [])];
      map.getSource("ed-draft")?.setData({ type: "FeatureCollection", features: [
        { type: "Feature", properties: { col }, geometry: { type: "LineString", coordinates: pts } },
        ...s.draft.map((p) => ({ type: "Feature", properties: { col }, geometry: { type: "Point", coordinates: p } })),
      ] });
    };
    const onOut = () => {
      showSnap(null);
      showPick(null);
      tip.style.display = "none";
    };
    map.on("click", onClick);
    map.on("dblclick", onDbl);
    map.on("mousemove", onMove);
    map.on("mouseout", onOut);
    return () => {
      map.off("click", onClick);
      map.off("dblclick", onDbl);
      map.off("mousemove", onMove);
      map.off("mouseout", onOut);
      tip.remove();
      snapFns.current = {};
    };
  }, [mapReady]);

  // 線の表示を最新に
  useEffect(() => {
    const map = mapReady ? mapApi.current?.getMap() : null;
    if (!map || !features) return;
    map.getSource("ed-feat")?.setData(overlayFC(features, selId));
  }, [mapReady, features, selId]);
  // 選んだ建物の屋根の板（中の色は高さ：いちばん低い板 0〜いちばん高い板 1）
  useEffect(() => {
    const map = mapReady ? mapApi.current?.getMap() : null;
    const src = map?.getSource("ed-boards");
    if (!src) return;
    const bs = sel?.type === "building" ? sel.boards || [] : [];
    const tops = bs.map((b) => b.top);
    const lo = Math.min(...tops);
    const hi = Math.max(...tops);
    src.setData({ type: "FeatureCollection", features: bs.map((b, i) => ({
      type: "Feature",
      properties: { i, t: hi > lo ? (b.top - lo) / (hi - lo) : 0.5, g: b.kind === "green" ? 1 : 0, sel: i === boardIdx ? 1 : 0 },
      geometry: { type: "Polygon", coordinates: [[...b.coords, b.coords[0]]] },
    })) });
  }, [mapReady, sel, boardIdx]);
  // 下絵（写真・図面）：地面に貼る画像。manifest の順に下から重ねる（写真の上に図面の線）
  useEffect(() => {
    const map = mapReady ? mapApi.current?.getMap() : null;
    if (!map) return;
    for (const r of refs) {
      const id = `ed-ref-${r.id}`;
      const op = refShow[r.id];
      if (op == null) {
        if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", "none");
        continue;
      }
      if (!map.getSource(id)) {
        map.addSource(id, { type: "image", url: `${REF_API}/${encodeURIComponent(r.file)}`, coordinates: r.corners });
        map.addLayer({ id, type: "raster", source: id, paint: { "raster-opacity": op, "raster-fade-duration": 0 } }, "ed-fill");
      }
      map.setLayoutProperty(id, "visibility", "visible");
      map.setPaintProperty(id, "raster-opacity", op);
    }
    for (const r of refs) if (map.getLayer(`ed-ref-${r.id}`)) map.moveLayer(`ed-ref-${r.id}`, "ed-fill");
  }, [mapReady, refs, refShow]);
  useEffect(() => {
    const map = mapReady ? mapApi.current?.getMap() : null;
    if (!map) return;
    const used = new Set((features || []).map((f) => f.osm).filter(Boolean));
    map.getSource("ed-cands")?.setData(showCands ? candFC(cands, used) : EMPTY);
  }, [mapReady, cands, showCands, features]);
  useEffect(() => {
    const map = mapReady ? mapApi.current?.getMap() : null;
    if (!map) return;
    const col = TYPE_COL[tool] || T.txH;
    map.getSource("ed-draft")?.setData(draft.length ? { type: "FeatureCollection", features: [
      ...(draft.length > 1 ? [{ type: "Feature", properties: { col }, geometry: { type: "LineString", coordinates: closedTool(tool) ? [...draft, draft[0]] : draft } }] : []),
      ...draft.map((p) => ({ type: "Feature", properties: { col }, geometry: { type: "Point", coordinates: p } })),
    ] } : EMPTY);
    map.getCanvas().style.cursor = tool === "select" ? "" : "crosshair";
    if (tool === "select") snapFns.current.showSnap?.(null);
    if (tool !== "road" || draft.length) snapFns.current.showPick?.(null);
  }, [mapReady, draft, tool]);
  // 建物を半透明にして、下の線や穴を見やすく。半透明の建物は奥行きを書くので、あとから描く構造物（壁・階段）は建物の裏で消え、
  // 先に描いた地形（段差）だけが透けて見えてしまう → 半透明のあいだは構造物を建物より先に描く
  useEffect(() => {
    const map = mapReady ? mapApi.current?.getMap() : null;
    if (!map?.getLayer("cb-buildings")) return;
    map.setPaintProperty("cb-buildings", "fill-extrusion-opacity", seeThrough ? 0.5 : 0.97);
    if (map.getLayer("cb-extras")) map.moveLayer("cb-extras", seeThrough ? "cb-buildings" : map.getLayer("nav-route-passed") ? "nav-route-passed" : undefined);
  }, [mapReady, seeThrough]);
  // くり抜き・屋根の板を描いているあいだ（と「立体の屋根を隠す」のとき）は、3Dの構造物（建物の屋根）を隠す：
  // 屋根の下になる地面の線・下絵や、描いている形が見えるように
  useEffect(() => {
    const map = mapReady ? mapApi.current?.getMap() : null;
    if (map?.getLayer("cb-extras")) map.setLayoutProperty("cb-extras", "visibility", tool === "carve" || tool === "board" || hide3d ? "none" : "visible");
  }, [mapReady, tool, hide3d]);
  // 航空写真（campusMap3d.js の cb-photo）。道路の上・手で描いた路面の下に敷く
  useEffect(() => {
    const map = mapReady ? mapApi.current?.getMap() : null;
    if (!map?.getLayer(PHOTO_LAYER)) return;
    map.setLayoutProperty(PHOTO_LAYER, "visibility", photo ? "visible" : "none");
    map.setPaintProperty(PHOTO_LAYER, "raster-opacity", photoOpacity);
  }, [mapReady, photo, photoOpacity]);
  // 候補リストの番号が変わったら、選んでいた候補は外す
  useEffect(() => setSelCand(null), [cands]);

  /* ── 選んだ構造物の点（ドラッグで移動）と、辺の真ん中の＋（点を足す）── */
  useEffect(() => {
    const ml = window.maplibregl;
    const map = mapReady ? mapApi.current?.getMap() : null;
    markers.current.forEach((m) => m.remove());
    markers.current = [];
    if (!ml || !map || !sel) return undefined;
    const col = TYPE_COL[sel.type];
    // 描いているあいだは、選んだ構造物の点は「その点をそのまま使う」ボタン（となりの路面と角をそろえる）。＋やふちのつまみは出さない
    const drawing = tool !== "select";
    const dot = (i) => {
      const d = document.createElement("div");
      const on = i === selVertex;
      d.style.cssText = `width:${on ? 16 : 13}px;height:${on ? 16 : 13}px;border-radius:50%;background:${on ? col : "#fff"};border:3px solid ${col};box-sizing:border-box;cursor:${drawing ? "copy" : "grab"};box-shadow:0 1px 4px rgba(0,0,0,.5)`;
      d.title = drawing ? `点${i + 1}（ここに点を置く）` : `点${i + 1}`;
      return d;
    };
    sel.coords.forEach((c, i) => {
      const m = new ml.Marker({ element: dot(i), draggable: !drawing, opacityWhenCovered: "1" }).setLngLat(c).addTo(map);
      m.getElement().addEventListener("click", (e) => {
        e.stopPropagation();
        if (S.current.tool !== "select") S.current.addDraftPoint(c);
        else setSelVertex(i);
      });
      // 動かしているあいだは線だけ動かし、離したときに確定（3Dの作り直しは重いので）。道の近くでは道に合わせる
      m.on("drag", () => {
        const raw = m.getLngLat();
        const snap = snapFns.current.snapAt?.(map.project(raw), raw);
        if (snap) m.setLngLat(snap.ll);
        snapFns.current.showSnap?.(snap);
        const ll = m.getLngLat();
        const f = { ...sel, coords: sel.coords.map((p, k) => (k === i ? [ll.lng, ll.lat] : p)) };
        map.getSource("ed-feat")?.setData(overlayFC(S.current.features.map((g) => (g.id === sel.id ? f : g)), sel.id));
      });
      m.on("dragend", () => {
        snapFns.current.showSnap?.(null);
        const ll = m.getLngLat();
        updateFeature(sel.id, (g) => ({ coords: g.coords.map((p, k) => (k === i ? [ll.lng, ll.lat] : p)) }));
        setSelVertex(i);
      });
      markers.current.push(m);
    });
    // 範囲（平地）は、最後の点と最初の点のあいだにも＋を出す
    for (let i = 0; i < (drawing || sel.type === "crosswalk" ? 0 : sel.coords.length - (isArea(sel.type) ? 0 : 1)); i++) {
      const a = sel.coords[i];
      const b = sel.coords[(i + 1) % sel.coords.length];
      const d = document.createElement("div");
      d.textContent = "+";
      d.title = "点を足す";
      d.style.cssText = `width:15px;height:15px;border-radius:50%;background:${T.bg2}d0;color:${col};border:1.5px solid ${col};font:700 13px/12px sans-serif;text-align:center;cursor:copy;opacity:.85`;
      d.addEventListener("click", (e) => {
        e.stopPropagation();
        const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
        updateFeature(sel.id, (g) => ({
          coords: [...g.coords.slice(0, i + 1), mid, ...g.coords.slice(i + 1)],
          z: g.z ? [...g.z.slice(0, i + 1), null, ...g.z.slice(i + 1)] : g.z,
          widths: g.widths ? [...g.widths.slice(0, i + 1), null, ...g.widths.slice(i + 1)] : g.widths, // 足した点の横幅・ずれは前後を結ぶ
          shifts: g.shifts ? [...g.shifts.slice(0, i + 1), null, ...g.shifts.slice(i + 1)] : g.shifts,
          flat: g.flat ? [...g.flat.slice(0, i + 1), g.flat[i], ...g.flat.slice(i + 1)] : g.flat, // 分けた2つの区間は、元の区間と同じ
          glassSides: g.glassSides ? [...g.glassSides.slice(0, i + 1), g.glassSides[i], ...g.glassSides.slice(i + 1)] : g.glassSides, // 建物：分けた2つの辺は元の辺と同じ
          eaveSides: g.eaveSides ? [...g.eaveSides.slice(0, i + 1), g.eaveSides[i], ...g.eaveSides.slice(i + 1)] : g.eaveSides,
          faces: facesInsert(g.faces, i), // 平地：分けた2つの辺は元の面（扉はある側に）
          // 段数を手で決めているときは、半分ずつに分ける
          steps: g.steps ? [...g.steps.slice(0, i), ...(g.steps[i] ? [Math.max(1, Math.round(g.steps[i] / 2)), Math.max(1, g.steps[i] - Math.round(g.steps[i] / 2))] : [null, null]), ...g.steps.slice(i + 1)] : g.steps,
        }));
        setSelVertex(i + 1);
      });
      markers.current.push(new ml.Marker({ element: d, opacityWhenCovered: "1" }).setLngLat([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]).addTo(map));
    }
    // 建物の屋根を斜めに切る面ごとの2点（低・高）。ドラッグで斜面の向きと、始まり・終わりを変える
    if (!drawing && sel.type === "building" && sel.cuts) {
      sel.cuts.forEach((cut, ci) => cut.slope.forEach((c, k) => {
        const d = document.createElement("div");
        d.textContent = `${k ? "高" : "低"}${sel.cuts.length > 1 ? ci + 1 : ""}`;
        d.title = k ? `面${ci + 1}の点2：屋根の高さ ${sel.height} m（ここより先も同じ）` : `面${ci + 1}の点1：屋根の高さ ${cut.low} m（ここより手前も同じ。0 ならここで地面まで切れる）`;
        d.style.cssText = `min-width:22px;height:22px;padding:0 3px;box-sizing:border-box;border-radius:6px;background:${k ? col : "#fff"};color:${k ? "#1a1a1f" : col};border:2px solid ${col};font:700 12px/18px sans-serif;text-align:center;cursor:grab;box-shadow:0 1px 4px rgba(0,0,0,.5)`;
        const mk = new ml.Marker({ element: d, draggable: true, opacityWhenCovered: "1" }).setLngLat(c).addTo(map);
        mk.on("dragend", () => {
          const ll = mk.getLngLat();
          updateFeature(sel.id, (g) => ({ cuts: g.cuts.map((x, j) => (j === ci ? { ...x, slope: x.slope.map((q, i) => (i === k ? [ll.lng, ll.lat] : q)) } : x)) }));
        });
        markers.current.push(mk);
      }));
      // 「低」「高」の線を回すつまみ（線の端）。ドラッグした向きに線が回る（点1・点2のまわりに）
      sel.cuts.forEach((cut, ci) => {
        const g = slopeGuides(sel, ci);
        g.ends.forEach((e, k) => {
          const d = document.createElement("div");
          d.textContent = "↻";
          d.title = `面${ci + 1}の「${k ? "高" : "低"}」の線を回す（ドラッグ）`;
          d.style.cssText = `width:20px;height:20px;border-radius:50%;background:#fff;color:${col};border:2px solid ${col};box-sizing:border-box;font:700 13px/16px sans-serif;text-align:center;cursor:grab;box-shadow:0 1px 4px rgba(0,0,0,.5)`;
          const mk = new ml.Marker({ element: d, draggable: true, opacityWhenCovered: "1" }).setLngLat(e).addTo(map);
          mk.on("dragend", () => {
            const ll = mk.getLngLat();
            const P = toXY([ll.lng, ll.lat]);
            const O = k ? g.B : g.A;
            const a = lineAngle(g.u, [P[0] - O[0], P[1] - O[1]]);
            updateFeature(sel.id, (h) => ({ cuts: h.cuts.map((x, j) => (j === ci ? { ...x, [k ? "rotHigh" : "rotLow"]: a } : x)) }));
          });
          markers.current.push(mk);
        });
      });
    }
    // 建物の選んでいるくり抜きの点（ひし形）：ドラッグで動かす
    if (!drawing && sel.type === "building" && sel.carves?.[carveIdx]) {
      sel.carves[carveIdx].coords.forEach((c, k) => {
        const d = document.createElement("div");
        d.title = `くり抜き${carveIdx + 1}の点${k + 1}`;
        d.style.cssText = "width:16px;height:16px;cursor:grab;display:flex;align-items:center;justify-content:center";
        d.style.width = "20px";
        d.style.height = "20px";
        const inner = document.createElement("div");
        inner.style.cssText = `width:15px;height:15px;transform:rotate(45deg);background:#fff;border:2px solid ${TYPE_COL.carve};box-sizing:border-box;box-shadow:0 1px 4px rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center`;
        const num = document.createElement("span");
        num.textContent = String(k + 1);
        num.style.cssText = "transform:rotate(-45deg);font:700 9px/1 sans-serif;color:#9a4d12";
        inner.appendChild(num);
        d.appendChild(inner);
        const mk = new ml.Marker({ element: d, draggable: true, opacityWhenCovered: "1" }).setLngLat(c).addTo(map);
        mk.on("dragend", () => {
          const ll = mk.getLngLat();
          updateFeature(sel.id, (g) => ({ carves: g.carves.map((cv, j) => (j === carveIdx ? { ...cv, coords: cv.coords.map((q, i) => (i === k ? [ll.lng, ll.lat] : q)) } : cv)) }));
        });
        markers.current.push(mk);
      });
    }
    // 建物の選んでいる屋根の板：角のひし形（ドラッグで角を動かす。ほかの板・建物の角に吸い付く）と、まん中の四角（板ごと動かす）
    if (!drawing && sel.type === "building" && boardIdx != null && sel.boards?.[boardIdx]) {
      const bcol = TYPE_COL.board;
      const bc = sel.boards[boardIdx].coords;
      const cornerSnap = (raw) => {
        if (!S.current.snapOn || altRef.current) return null;
        const pt = map.project(raw);
        let best = null;
        [sel.coords, ...sel.boards.filter((_, j) => j !== boardIdx).map((b) => b.coords)].forEach((r) => r.forEach((c) => {
          const q = map.project(c);
          const d = Math.hypot(q.x - pt.x, q.y - pt.y);
          if (d <= SNAP_VERTEX_PX && (!best || d < best.d)) best = { ll: c, d, vertex: true };
        }));
        return best;
      };
      bc.forEach((c, k) => {
        const d = document.createElement("div");
        d.title = `板 #${boardIdx + 1} の角${k + 1}`;
        d.style.cssText = "width:18px;height:18px;cursor:grab;display:flex;align-items:center;justify-content:center";
        const inner = document.createElement("div");
        inner.style.cssText = `width:11px;height:11px;transform:rotate(45deg);background:#fff;border:2px solid ${bcol};box-sizing:border-box;box-shadow:0 1px 3px rgba(0,0,0,.5)`;
        d.appendChild(inner);
        const mk = new ml.Marker({ element: d, draggable: true, opacityWhenCovered: "1" }).setLngLat(c).addTo(map);
        mk.on("drag", () => {
          const snap = cornerSnap(mk.getLngLat());
          if (snap) mk.setLngLat(snap.ll);
          snapFns.current.showSnap?.(snap);
        });
        mk.on("dragend", () => {
          snapFns.current.showSnap?.(null);
          const ll = mk.getLngLat();
          updateFeature(sel.id, (g) => ({ boards: g.boards.map((b, j) => (j === boardIdx ? { ...b, coords: b.coords.map((q, i) => (i === k ? [ll.lng, ll.lat] : q)) } : b)) }));
        });
        markers.current.push(mk);
      });
      const mid = bc.reduce((a, p) => [a[0] + p[0] / bc.length, a[1] + p[1] / bc.length], [0, 0]);
      const sq = document.createElement("div");
      sq.title = `板 #${boardIdx + 1} を動かす`;
      sq.style.cssText = `width:12px;height:12px;border-radius:2px;background:${bcol};border:2px solid #fff;box-sizing:border-box;cursor:move;box-shadow:0 1px 3px rgba(0,0,0,.5)`;
      const mm = new ml.Marker({ element: sq, draggable: true, opacityWhenCovered: "1" }).setLngLat(mid).addTo(map);
      mm.on("dragend", () => {
        const ll = mm.getLngLat();
        const dx = ll.lng - mid[0];
        const dy = ll.lat - mid[1];
        updateFeature(sel.id, (g) => ({ boards: g.boards.map((b, j) => (j === boardIdx ? { ...b, coords: b.coords.map((q) => [q[0] + dx, q[1] + dy]) } : b)) }));
      });
      markers.current.push(mm);
    }
    // 坂道・階段：各点の左右のふちのつまみ。ドラッグで、反対側のふちはそのままで横幅とずれを変える（その点の横の線の上だけ動く）
    if (!drawing && (sel.type === "slope" || sel.type === "stairs")) {
      const xy = sel.coords.map(toXY);
      const wv0 = vertexWidths(sel);
      const cv0 = vertexShifts(sel);
      // その点で、ふちが動く向き（角では留め継ぎの向きと倍率。offsetLine と同じ）
      const frame = (i) => {
        const n = xy.length;
        const nrm = (j) => { const dx = xy[j + 1][0] - xy[j][0]; const dy = xy[j + 1][1] - xy[j][1]; const l = Math.hypot(dx, dy) || 1; return [-dy / l, dx / l]; };
        const a = nrm(Math.max(0, i - 1));
        const b = nrm(Math.min(n - 2, i));
        let mx = a[0] + b[0];
        let my = a[1] + b[1];
        const ml2 = Math.hypot(mx, my);
        if (ml2 < 1e-6) return { m: a, k: 1 };
        mx /= ml2;
        my /= ml2;
        return { m: [mx, my], k: Math.min(3, 1 / Math.max(1e-3, mx * a[0] + my * a[1])) };
      };
      // つまみの線（その点の横の線）と、平地のふち・角の吸い付き先（線の上の位置 d m）
      const snapD = (i, d, raw) => {
        const { m, k } = frame(i);
        const v = xy[i];
        const at = (t) => [v[0] + m[0] * t * k, v[1] + m[1] * t * k];
        const mpp = (78271.517 * Math.cos((raw.lat * Math.PI) / 180)) / 2 ** map.getZoom();
        let best = null;
        S.current.features.forEach((g) => {
          if (g.id === sel.id || g.type !== "terrace") return;
          const ring = g.coords.map(toXY);
          ring.forEach((q, j) => {
            // 角：線へ垂直に下ろした位置（角が線から 14px 以内）
            const t = ((q[0] - v[0]) * m[0] + (q[1] - v[1]) * m[1]) / k;
            const p = at(t);
            const dist = Math.hypot(q[0] - p[0], q[1] - p[1]) / mpp;
            const off = Math.abs(t - d) * k / mpp;
            if (dist <= SNAP_VERTEX_PX && off <= SNAP_VERTEX_PX * 2 && (!best || best.edge || off < best.off)) best = { t, off, ll: toLngLat(q), edge: false };
            // ふち：線との交わり
            const r = ring[(j + 1) % ring.length];
            const ex = r[0] - q[0];
            const ey = r[1] - q[1];
            const den = m[0] * k * ey - m[1] * k * ex;
            if (Math.abs(den) < 1e-9) return;
            const tt = ((q[0] - v[0]) * ey - (q[1] - v[1]) * ex) / den;
            const u = ((q[0] - v[0]) * m[1] * k - (q[1] - v[1]) * m[0] * k) / den;
            if (u < 0 || u > 1) return;
            const off2 = Math.abs(tt - d) * k / mpp;
            if (off2 <= SNAP_EDGE_PX && (!best || (best.edge && off2 < best.off))) best = { t: tt, off: off2, ll: toLngLat(at(tt)), edge: true };
          });
        });
        return best;
      };
      const square = (side) => {
        const d = document.createElement("div");
        d.style.cssText = `width:11px;height:11px;border-radius:2px;background:#fff;border:2.5px solid ${col};box-sizing:border-box;cursor:ew-resize;box-shadow:0 1px 3px rgba(0,0,0,.45)`;
        d.title = `${side > 0 ? "左" : "右"}のふち（ドラッグで横幅とずれ。反対側のふちはそのまま）`;
        return d;
      };
      sel.coords.forEach((_, i) => {
        const { m, k } = frame(i);
        [1, -1].forEach((side) => {
          const edgeAt = (t) => toLngLat([xy[i][0] + m[0] * t * k, xy[i][1] + m[1] * t * k]);
          const mk = new ml.Marker({ element: square(side), draggable: true, opacityWhenCovered: "1" }).setLngLat(edgeAt(cv0[i] + (side * wv0[i]) / 2)).addTo(map);
          mk.getElement().addEventListener("click", (e) => { e.stopPropagation(); setSelVertex(i); });
          // ドラッグした位置 → このふちの位置 t（中心線から左へ m）。反対側のふちはそのまま
          const widthShift = (raw, alt) => {
            const q = toXY([raw.lng, raw.lat]);
            let t = ((q[0] - xy[i][0]) * m[0] + (q[1] - xy[i][1]) * m[1]) / k;
            const snap = alt || altRef.current || !S.current.snapOn ? null : snapD(i, t, raw);
            if (snap) t = snap.t;
            const other = cv0[i] - (side * wv0[i]) / 2;
            const lo = side > 0 ? Math.max(t, other + 0.5) : Math.min(t, other - 0.5);
            const w = Math.round(Math.abs(lo - other) * 100) / 100;
            const c = Math.round(((lo + other) / 2) * 100) / 100;
            return { w, c, t: lo, snap };
          };
          mk.on("drag", () => {
            const raw = mk.getLngLat();
            const r = widthShift(raw, false);
            mk.setLngLat(edgeAt(r.t));
            snapFns.current.showSnap?.(r.snap ? { ll: r.snap.ll, vertex: !r.snap.edge } : null);
            const g = { ...sel, widths: sel.coords.map((__, j) => (j === i ? r.w : sel.widths?.[j] ?? null)), shifts: sel.coords.map((__, j) => (j === i ? r.c : sel.shifts?.[j] ?? null)) };
            map.getSource("ed-feat")?.setData(overlayFC(S.current.features.map((h) => (h.id === sel.id ? g : h)), sel.id));
          });
          mk.on("dragend", () => {
            snapFns.current.showSnap?.(null);
            const r = widthShift(mk.getLngLat(), false);
            updateFeature(sel.id, (g) => ({
              widths: g.coords.map((__, j) => (j === i ? r.w : g.widths?.[j] ?? null)),
              shifts: g.coords.map((__, j) => (j === i ? r.c : g.shifts?.[j] ?? null)),
            }));
            setSelVertex(i);
          });
          markers.current.push(mk);
        });
      });
    }
    return () => {
      markers.current.forEach((m) => m.remove());
      markers.current = [];
    };
  }, [mapReady, sel, selVertex, updateFeature, tool, carveIdx, boardIdx]);

  /* ── カメラ ── */
  const camera = (pitch) => {
    const map = mapApi.current?.getMap();
    map?.easeTo({ pitch, bearing: pitch ? map.getBearing() : 0, duration: 500 });
  };

  // 選んだ橋の上を通る経路の線（ルートが浮くところ）
  const lift = useMemo(() => {
    if (!sel || sel.type !== "bridge" || !walkLines) return null;
    const br = prepareBridge(sel, (ll) => dem.groundAt(ll));
    if (!br) return { pieces: [], len: 0 };
    const { onBridge } = splitByBridges(walkLines, [br], ROUTE_ON_BRIDGE);
    return { pieces: onBridge, len: onBridge.reduce((sum, piece) => sum + lengthOf(piece), 0) };
  }, [sel, walkLines, demTick]);
  const alignToWalk = useCallback(() => {
    const f = S.current.sel;
    if (!f || !walkIndex) return;
    const { coords, moved } = alignToLines(walkIndex, f.coords, 8);
    if (!moved) {
      say("近く（8m 以内）に向きのそろった経路の線がありません", true);
      return;
    }
    updateFeature(f.id, { coords });
    say(`経路の線に合わせました（${moved}点）`);
  }, [walkIndex, updateFeature, say]);
  useEffect(() => {
    const map = mapReady ? mapApi.current?.getMap() : null;
    map?.getSource("ed-lift")?.setData({ type: "FeatureCollection", features: (lift?.pieces || []).map((piece) => ({ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: piece.map((p) => [p[0], p[1]]) } })) });
  }, [mapReady, lift]);

  /* ── 左の欄：選んだ構造物 ── */
  const update = (patch, key) => sel && updateFeature(sel.id, patch, key);
  const detail = sel && (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <span style={{ width: 10, height: 10, borderRadius: 3, background: TYPE_COL[sel.type] }} />
        <b style={{ fontSize: 14 }}>{TYPE_LABEL[sel.type]}</b>
        <span style={{ fontSize: 11, color: T.txD }}>{lengthOf(sel.coords).toFixed(1)} m・{sel.coords.length}点</span>
        {sel.osm && <a href={`https://www.openstreetmap.org/${sel.osm}`} target="_blank" rel="noreferrer" style={{ fontSize: 10, color: CAND_COL, marginLeft: "auto" }}>OSM {sel.osm}</a>}
      </div>
      <Row label="名前">
        <input value={sel.name} onChange={(e) => update({ name: e.target.value }, "name")} placeholder="（なくてよい）"
          style={{ flex: 1, padding: "4px 6px", borderRadius: 5, border: `1px solid ${T.bdL}`, background: T.bg, color: T.txH, fontSize: 12, fontFamily: "inherit" }} />
      </Row>
      {sel.type === "wall" && <>
        <Row label="種類">
          <div style={{ display: "flex", gap: 6 }}>
            <Btn active={!sel.kind} col={TYPE_COL.wall} onClick={() => update({ kind: undefined })}>壁</Btn>
            <Btn active={sel.kind === "hedge"} col={TYPE_COL.tree} onClick={() => update({ kind: "hedge" })}>生け垣</Btn>
            <Btn active={sel.kind === "fence"} col={TYPE_COL.wall} onClick={() => update({ kind: "fence" })}>柵</Btn>
            <Btn active={sel.kind === "rail"} col={TYPE_COL.wall} onClick={() => update({ kind: "rail" })}>ガードパイプ</Btn>
            <Btn active={sel.kind === "glass"} col={TYPE_COL.wall} onClick={() => update({ kind: "glass" })}>ガラスの手すり</Btn>
          </div>
        </Row>
        <Row label="高さ (m)"><Num value={sel.height} min={0.1} max={40} onChange={(v) => update({ height: v }, "height")} /><span style={{ fontSize: 10, color: T.txD }}>高いほうの地面から</span></Row>
        <Row label="厚さ (m)"><Num value={sel.thickness} min={0.05} max={5} step={0.05} onChange={(v) => update({ thickness: v }, "thickness")} /></Row>
        {sel.kind === "glass" && <Row label="下の縁石 (m)"><Num value={sel.curb ?? null} nullable placeholder="なし" min={0.05} max={1.5} step={0.05} onChange={(v) => update({ curb: v ?? undefined }, "curb")} /><span style={{ fontSize: 10, color: T.txD }}>石の縁石の高さ。ガラスはその上</span></Row>}
      </>}
      {sel.type === "terrace" && <TerracePanel f={sel} demTick={demTick} update={update} />}
      {sel.type === "tree" && <>
        <Row label="種類">
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {TREE_KIND_KEYS.map((k) => <Btn key={k} active={sel.kind === k} col={TYPE_COL.tree} onClick={() => update({ kind: k })}>{TREE_KINDS[k]}</Btn>)}
          </div>
        </Row>
        <Row label="高さ (m)"><Num value={sel.height} min={1} max={40} step={0.5} onChange={(v) => update({ height: v }, "height")} /><span style={{ fontSize: 10, color: T.txD }}>地面からてっぺんまで</span></Row>
        <Row label="枝の広がり (m)"><Num value={sel.crown} min={1} max={30} step={0.5} onChange={(v) => update({ crown: v }, "crown")} /><span style={{ fontSize: 10, color: T.txD }}>葉の直径（地図の輪）</span></Row>
        <div style={{ fontSize: 10, color: T.txD, lineHeight: 1.6, marginTop: 4 }}>点をドラッグして動かす。歩いて見るときは幹にぶつかる（葉の下はくぐれる）</div>
      </>}
      {sel.type === "signal" && <SignalPanel f={sel} update={update} />}
      {sel.type === "passage" && <>
        <Row label="幅 (m)"><Num value={sel.width} min={0.5} max={60} onChange={(v) => update({ width: v }, "width")} /></Row>
        <Row label="天井の高さ (m)"><Num value={sel.height} min={0.1} max={40} onChange={(v) => update({ height: v }, "height")} /><span style={{ fontSize: 10, color: T.txD }}>屋上より高いと切り通し</span></Row>
      </>}
      {sel.type === "building" && <BuildingPanel key={sel.id} f={sel} update={update} carveIdx={carveIdx} setCarveIdx={setCarveIdx} onDrawCarve={(redo) => { carveRedraw.current = redo; setTool("carve"); setDraft([]); }}
        boards={{
          bi: boardIdx, setBi: setBoardIdx, next: boardNext, setNext: setBoardNext, hide3d, setHide3d, drawing: tool === "board",
          onDraw: () => { if (tool === "board") { setTool("select"); setDraft([]); } else { setTool("board"); setDraft([]); camera(0); } },
        }} />}
      {sel.type === "road" && <>
        <Row label="車道の幅 (m)"><Num value={sel.width} min={2} max={40} step={0.5} onChange={(v) => update({ width: v }, "width")} /><span style={{ fontSize: 10, color: T.txD }}>歩道は含まない</span></Row>
        <Row label="車線の数"><Num value={sel.lanes} min={1} max={8} step={1} onChange={(v) => update({ lanes: v }, "lanes")} /><span style={{ fontSize: 10, color: T.txD }}>1 は線なし。偶数ならまん中が中央線</span></Row>
        <Row label="中央線">
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {Object.entries(CENTER_KINDS).map(([k, v]) => <Btn key={k} active={sel.center === k} col={TYPE_COL.road} disabled={sel.lanes % 2 !== 0} onClick={() => update({ center: k })}>{v}</Btn>)}
          </div>
        </Row>
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: T.tx, margin: "6px 0", cursor: "pointer" }}>
          <input type="checkbox" checked={sel.edge} onChange={(e) => update({ edge: e.target.checked })} />外側線（車道のふちの内側の白線）
        </label>
        <Row label="歩道 左 (m)"><Num value={sel.walk[0]} min={0} max={15} step={0.5} onChange={(v) => update({ walk: [v, sel.walk[1]] }, "walkL")} /></Row>
        <Row label="歩道 右 (m)"><Num value={sel.walk[1]} min={0} max={15} step={0.5} onChange={(v) => update({ walk: [sel.walk[0], v] }, "walkR")} /><span style={{ fontSize: 10, color: T.txD }}>0 は歩道なし</span></Row>
        <Row label="角の丸み 左 (m)"><Num value={sel.radius?.[0] ?? null} min={0.5} max={20} step={0.5} nullable placeholder={String(CORNER_R)} onChange={(v) => update({ radius: [v, sel.radius?.[1] ?? null] }, "radL")} /></Row>
        <Row label="角の丸み 右 (m)"><Num value={sel.radius?.[1] ?? null} min={0.5} max={20} step={0.5} nullable placeholder={String(CORNER_R)} onChange={(v) => update({ radius: [sel.radius?.[0] ?? null, v] }, "radR")} /><span style={{ fontSize: 10, color: T.txD }}>交差点の角の縁石の半径（空欄は {CORNER_R}m）</span></Row>
        <div style={{ fontSize: 10, color: T.txD, lineHeight: 1.6, marginTop: 4 }}>
          左右は点1から点2を見て。交差点は自動：車道は1つにつながり、角は半径 {CORNER_R}m で丸まり、歩道は相手の車道の手前で切れる。中央線や外側線は交わる道の手前と横断歩道の上で切れる（T字路の突き当たりでは、相手の中央線は通る）。停止線は「白線」で足す
        </div>
      </>}
      {sel.type === "surface" && <>
        <Row label="種類">
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {Object.entries(SURFACE_KINDS).map(([k, v]) => (
              <Btn key={k} active={sel.kind === k} col={TYPE_COL.surface} onClick={() => update({ kind: k })}>
                <span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 2, background: v.light, marginRight: 6, verticalAlign: -1, outline: `1px solid ${T.bdL}` }} />{v.label}
              </Btn>
            ))}
          </div>
        </Row>
        {sel.kind === "zebra" && <Row label="縞の向き (度)"><Num value={sel.angle ?? 45} min={0} max={180} step={5} onChange={(v) => update({ angle: v }, "angle")} /><span style={{ fontSize: 10, color: T.txD }}>45° おき 1.5m の白い縞と、ふちの白線</span></Row>}
        <div style={{ fontSize: 10, color: T.txD, lineHeight: 1.6, marginTop: 4 }}>重なったところは、車道 → 導流帯 → カラー舗装 → 広場 → 歩道 → 植え込みの順に上へ塗る（車道を大きく囲んでから、歩道を重ねて描くと楽）</div>
      </>}
      {sel.type === "marking" && <>
        <Row label="種類">
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {Object.entries(MARKING_KINDS).map(([k, v]) => <Btn key={k} active={sel.kind === k} col={TYPE_COL.marking} onClick={() => update({ kind: k })}>{v.label}</Btn>)}
          </div>
        </Row>
        <div style={{ fontSize: 10, color: T.txD, lineHeight: 1.6, marginTop: 4 }}>線の幅：白線・黄線 15cm、太い白線 30cm、停止線 45cm。破線は 5m 引いて 5m あける</div>
      </>}
      {sel.type === "crosswalk" && <>
        <Row label="幅 (m)"><Num value={sel.width} min={1} max={12} step={0.5} onChange={(v) => update({ width: v }, "width")} /><span style={{ fontSize: 10, color: T.txD }}>縞の長さ（ふつう 4m）</span></Row>
        <div style={{ fontSize: 10, color: T.txD, lineHeight: 1.6, marginTop: 4 }}>2点は渡る向き（歩道から歩道へ）。縞は幅 45cm・すき間 45cm で、まん中にそろえて並ぶ。点をドラッグして長さや向きを合わせる</div>
      </>}
      {(sel.type === "slope" || sel.type === "stairs" || sel.type === "bridge") && (
        <ShapeEditor key={sel.id} f={sel} demTick={demTick} selVertex={selVertex} setSelVertex={setSelVertex} update={update} lift={lift} onAlign={alignToWalk} />
      )}
      <div style={{ display: "flex", gap: 6, marginTop: 12, flexWrap: "wrap" }}>
        <Btn onClick={() => flyTo(sel.coords)}>ここへ移動</Btn>
        {selVertex != null && sel.coords.length > minPoints(sel.type) && <Btn col={T.red} onClick={() => removeVertex(sel.id, selVertex)}>点{selVertex + 1}を削除</Btn>}
        <Btn col={T.red} onClick={() => removeFeature(sel.id)}>この{TYPE_LABEL[sel.type]}を削除</Btn>
      </div>
    </div>
  );

  const candDetail = selCand && (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
        <span style={{ width: 10, height: 10, borderRadius: 3, background: CAND_COL }} />
        <b style={{ fontSize: 14 }}>OSM の候補：{TYPE_LABEL[selCand.type]}</b>
      </div>
      <div style={{ fontSize: 12, color: T.tx, lineHeight: 1.6 }}>
        {selCand.name && <div>{selCand.name}</div>}
        <div style={{ color: T.txD }}>{lengthOf(selCand.coords).toFixed(1)} m・{Object.entries(selCand.tags || {}).map(([k, v]) => `${k}=${v}`).join(" ")}</div>
        <a href={`https://www.openstreetmap.org/${selCand.osm}`} target="_blank" rel="noreferrer" style={{ color: CAND_COL, fontSize: 11 }}>OSM で見る</a>
      </div>
      <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
        <Btn col={T.green} active onClick={() => adopt(selCand)}>取り込む</Btn>
        <Btn onClick={() => setSelCand(null)}>閉じる</Btn>
      </div>
    </div>
  );

  const counts = useMemo(() => Object.fromEntries(FEATURE_TYPES.map((k) => [k, (features || []).filter((f) => f.type === k).length])), [features]);
  const usedOsm = useMemo(() => new Set((features || []).map((f) => f.osm).filter(Boolean)), [features]);
  const candLeft = cands.filter((c) => !usedOsm.has(c.osm)).length;

  if (!mapLibre.ready || !bmData || !features) {
    return <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", background: T.bg, color: T.txD, fontFamily: "'Inter',sans-serif" }}>{mapLibre.failed ? "この端末では 3D 地図を使えません（WebGL）" : "地図を読み込み中..."}</div>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", background: T.bg, fontFamily: "'Inter',sans-serif", color: T.txH }}>
      {/* ── 上：道具・保存 ── */}
      <header style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 14px", background: T.bg2, borderBottom: `1px solid ${T.bd}`, flexShrink: 0, flexWrap: "wrap" }}>
        <a href="/editor" style={{ fontSize: 11, color: T.txD, textDecoration: "none" }}>← 2D</a>
        <span style={{ fontSize: 15, fontWeight: 700, marginRight: 6 }}>3D 構造物エディタ</span>
        <nav style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
          {TOOLS.map((t) => (
            <Btn key={t.id} col={TYPE_COL[t.id] || T.txH} active={tool === t.id} onClick={() => { setTool(t.id); setDraft([]); }}>{t.label}</Btn>
          ))}
        </nav>
        {draft.length > 0 && <Btn col={T.green} active onClick={finishDraft} disabled={draft.length < 2}>確定（{draft.length}点）</Btn>}
        <span style={{ flex: 1 }} />
        <Btn onClick={undo} disabled={!hist.current.past.length} title="Ctrl+Z">元に戻す</Btn>
        <Btn onClick={redo} disabled={!hist.current.future.length} title="Ctrl+Shift+Z">やり直す</Btn>
        {canSave && <Btn col={T.accent} active={dirty} onClick={save} title="Ctrl+S">{dirty ? "保存 ●" : "保存済み"}</Btn>}
        <Btn onClick={download} title="public/map-3d/features.json に置く">書き出し</Btn>
        <Btn onClick={() => fileRef.current?.click()}>読み込み</Btn>
        <input ref={fileRef} type="file" accept="application/json,.json" style={{ display: "none" }} onChange={(e) => { const f = e.target.files?.[0]; if (f) importFile(f); e.target.value = ""; }} />
      </header>
      <div style={{ display: "flex", gap: 14, padding: "4px 14px", background: T.bg3, borderBottom: `1px solid ${T.bd}`, fontSize: 10, color: T.txD, flexShrink: 0, alignItems: "center", flexWrap: "wrap" }}>
        {FEATURE_TYPES.map((k) => <span key={k}>{TYPE_LABEL[k]}: <b style={{ color: T.txH }}>{counts[k]}</b></span>)}
        {canSave === false && <span style={{ color: T.yellow }}>保存は開発サーバーでだけ。ここでは「書き出し」た JSON を public/map-3d/features.json に置く</span>}
        <span style={{ marginLeft: "auto", color: TYPE_COL[tool] || T.txH, fontWeight: 500 }}>
          {HELP[tool]}
          {snapOn && tool !== "select" && <span style={{ color: SNAP_COL }}>　道の近くでは道に合わせる（Alt で外す）</span>}
        </span>
      </div>

      <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
        {/* ── 左：選んだもの・一覧 ── */}
        <aside style={{ width: 340, flexShrink: 0, overflowY: "auto", background: T.bg2, borderRight: `1px solid ${T.bd}`, padding: 14 }}>
          {restore && (
            <div style={{ padding: 10, borderRadius: 8, background: `${T.yellow}18`, border: `1px solid ${T.yellow}66`, fontSize: 12, marginBottom: 12 }}>
              保存していない編集があります（{new Date(restore.at).toLocaleString("ja-JP")}）
              <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                <Btn col={T.yellow} active onClick={() => { commit(parseFeatures(restore)); setRestore(null); }}>復元する</Btn>
                <Btn onClick={() => { setRestore(null); try { localStorage.removeItem(DRAFT_KEY); } catch { /* なくてよい */ } }}>捨てる</Btn>
              </div>
            </div>
          )}
          {detail || candDetail || (
            <div style={{ fontSize: 12, color: T.tx, lineHeight: 1.7 }}>
              <b style={{ color: T.txH }}>使い方</b>
              <ol style={{ paddingLeft: 18, margin: "6px 0" }}>
                <li>上の「平地・坂道・階段・壁・橋・通り抜け・建物・道路・横断歩道・白線・路面」を選び、地図をクリックして描く（建物・道路は地図の建物・道をクリックで取り込める）</li>
                <li>段差は「平地」で範囲を囲んでつくり、ふちをまたいで坂道か階段を描いてつなぐ</li>
                <li>ダブルクリックか Enter で確定。選ぶと左に設定が出る</li>
                <li>点はドラッグで動かす。辺の「＋」で点を足す</li>
                <li>道の近くに置いた点は、道の交差点・曲がり角・線の上に吸い付く（Alt で外す）</li>
                <li>紫の点線は OSM の候補。クリックして「取り込む」</li>
              </ol>
              <div style={{ color: T.txD }}>描くときは「真上から」にすると点を置きやすい。</div>
            </div>
          )}

          <div style={{ marginTop: 18, borderTop: `1px solid ${T.bd}`, paddingTop: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
              <b style={{ fontSize: 12 }}>構造物（{features.length}）</b>
            </div>
            {!features.length && <div style={{ fontSize: 11, color: T.txD }}>まだありません</div>}
            {features.map((f) => (
              <div key={f.id} onClick={() => { select(f.id); flyTo(f.coords); }}
                style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 6px", borderRadius: 6, cursor: "pointer", background: f.id === selId ? T.bg4 : "transparent", fontSize: 12 }}>
                <span style={{ width: 8, height: 8, borderRadius: 2, background: TYPE_COL[f.type], flexShrink: 0 }} />
                <span style={{ color: T.txD, width: 52, flexShrink: 0 }}>{TYPE_LABEL[f.type]}</span>
                <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: f.name ? T.txH : T.txD }}>{f.name || "（名前なし）"}</span>
                <span style={{ color: T.txD, fontSize: 10 }}>{lengthOf(f.coords).toFixed(0)}m</span>
              </div>
            ))}
          </div>

          <div style={{ marginTop: 18, borderTop: `1px solid ${T.bd}`, paddingTop: 12, fontSize: 12 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
              <input type="checkbox" checked={snapOn} onChange={(e) => setSnapOn(e.target.checked)} />
              <span>点を道に合わせる（<span style={{ color: SNAP_COL }}>スナップ</span>）</span>
            </label>
            <div style={{ fontSize: 10, color: T.txD, margin: "2px 0 8px 22px", lineHeight: 1.5 }}>道・通路・線路の近くに点を置くと、交差点や曲がり角、線の上に吸い付く。Alt を押しているあいだは吸い付かない</div>
            <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
              <input type="checkbox" checked={showCands} onChange={(e) => setShowCands(e.target.checked)} />
              <span>OSM の候補を表示（<span style={{ color: CAND_COL }}>{candLeft}</span>件）</span>
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", marginTop: 6 }}>
              <input type="checkbox" checked={seeThrough} onChange={(e) => setSeeThrough(e.target.checked)} />
              <span>建物を半透明にする</span>
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", marginTop: 6 }}>
              <input type="checkbox" checked={photo} onChange={(e) => setPhoto(e.target.checked)} />
              <span>航空写真を下に敷く（なぞる用）</span>
            </label>
            {photo && <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "4px 0 0 22px", fontSize: 11, color: T.tx }}>
              濃さ <input type="range" min={0.2} max={1} step={0.05} value={photoOpacity} onChange={(e) => setPhotoOpacity(+e.target.value)} style={{ flex: 1 }} />
              <span style={{ width: 32, textAlign: "right", color: T.txD }}>{Math.round(photoOpacity * 100)}%</span>
            </div>}
            {photo && <div style={{ fontSize: 10, color: T.txD, margin: "2px 0 0 22px" }}>Imagery © Esri。「真上から」にすると、交差点の線や横断歩道をなぞりやすい</div>}
            {refs.length > 0 && <div style={{ marginTop: 10 }}>
              <div style={{ fontSize: 11, color: T.txH, marginBottom: 2 }}>下絵（なぞる用。開発サーバーの data/map-3d-ref）</div>
              {refs.map((r) => (
                <div key={r.id} style={{ marginTop: 4 }}>
                  <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
                    <input type="checkbox" checked={refShow[r.id] != null} onChange={(e) => setRefShow((v) => { const n = { ...v }; if (e.target.checked) n[r.id] = 0.9; else delete n[r.id]; return n; })} />
                    <span>{r.label}</span>
                  </label>
                  {refShow[r.id] != null && <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "2px 0 0 22px", fontSize: 11, color: T.tx }}>
                    濃さ <input type="range" min={0.1} max={1} step={0.05} value={refShow[r.id]} onChange={(e) => setRefShow((v) => ({ ...v, [r.id]: +e.target.value }))} style={{ flex: 1 }} />
                    <span style={{ width: 32, textAlign: "right", color: T.txD }}>{Math.round(refShow[r.id] * 100)}%</span>
                  </div>}
                  {r.note && refShow[r.id] != null && <div style={{ fontSize: 10, color: T.txD, margin: "2px 0 0 22px", lineHeight: 1.5 }}>{r.note}</div>}
                </div>
              ))}
            </div>}
            <div style={{ fontSize: 10, color: T.txD, marginTop: 8 }}>候補は scripts/gen-campus-3d-candidates.mjs で作り直せる</div>
          </div>
        </aside>

        {/* ── 右：地図 ── */}
        <main style={{ flex: 1, position: "relative", minWidth: 0 }}>
          <CampusMap3D
            ref={mapApi}
            data={bmData}
            dark={false}
            accent={T.accent}
            lookKey="cb3LookEditor"
            defaultLook="day"
            walkButton
            initialView={INITIAL_VIEW}
            features={mapFeatures}
            editable
            selectedFeatureId={selId}
            onLoad={() => setMapReady(true)}
          />
          <div style={{ position: "absolute", left: 12, top: 12, display: "flex", gap: 4, zIndex: 5 }}>
            <Btn onClick={() => camera(0)}>真上から</Btn>
            <Btn onClick={() => camera(55)}>斜めから</Btn>
          </div>
          {toast && (
            <div style={{ position: "absolute", left: "50%", bottom: 28, transform: "translateX(-50%)", padding: "8px 14px", borderRadius: 10, background: toast.err ? T.red : "rgba(14,32,48,.9)", color: "#fff", fontSize: 12, fontWeight: 700, zIndex: 6 }}>{toast.msg}</div>
          )}
        </main>
      </div>
    </div>
  );
}
