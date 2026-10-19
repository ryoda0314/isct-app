"use client";
// 3D表示に手で足す構造物（壁・坂・橋・建物の通り抜け）のエディタ（/editor/3d）。
// 地図をクリックして点を置き、ダブルクリックか Enter で確定。選んだ構造物の点はドラッグで動かし、＋で点を足す。
// 保存は開発サーバー（next dev）でだけ public/map-3d/features.json へ。本番では「書き出し」た JSON をそこに置く
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMapLibre } from "../../campus-sns/shared.jsx";
import { CampusMap3D } from "../../campus-sns/components/CampusMap3D.jsx";
import { CAMPUS_CENTER } from "../../campus-sns/hooks/useLocationSharing.js";
import {
  CANDIDATES_URL, FEATURES_URL, FEATURE_TYPES, SURFACE_LABEL, TYPE_LABEL,
  baseWidth, candidateToFeature, createFeature, cumulative, featuresBounds, isArea, lerpAlong, normalizeFeature, offsetLine, vertexShifts, vertexWidths,
  ROUTE_ON_BRIDGE, parseFeatures, pathProfile, prepareBridge, prepareTerrace, serializeFeatures, splitByBridges, stairFlights, stairSteps, toLngLat, toXY, withLandings, withSegmentLength,
} from "../../campus-sns/campus3dFeatures.js";
import { dem } from "../../campus-sns/campusDem.js";
import { streetLines } from "../../campus-sns/campusMap3d.js";
import { alignToLines, buildSnapIndex, nearestOnRoads } from "../../campus-sns/campus3dSnap.js";

/* ── 見た目（2D のマップエディタと同じ暗い配色）── */
const T = { bg: "#1a1a1f", bg2: "#222228", bg3: "#2a2a32", bg4: "#32323c", tx: "#b0b0b8", txH: "#e8e8f0", txD: "#68687a", bd: "#2e2e38", bdL: "#3a3a48", accent: "#6375f0", green: "#4db88a", red: "#e5534b", yellow: "#f0c040" };
const TYPE_COL = { terrace: "#b48cff", slope: "#f0c040", stairs: "#ff7eb6", wall: "#e5534b", bridge: "#4db88a", passage: "#60a0ff" };
const LIFT_COL = "#1a8ef0"; // ルートが橋の上に浮くところ
const CAND_COL = "#c070f0";
// 道に合わせる（スナップ）：線の頂点（交差点・曲がり角・端）はこの px 以内、線の上はこの px 以内なら吸い付く
const SNAP_COL = "#ff9f1c";
const SNAP_VERTEX_PX = 14;
const SNAP_EDGE_PX = 10;
const TOOLS = [{ id: "select", label: "選択" }, ...FEATURE_TYPES.map((id) => ({ id, label: TYPE_LABEL[id] }))];
const HELP = {
  select: "構造物をクリックで選択。点はドラッグで移動、＋で点を足す。Delete で削除、Ctrl+Z で元に戻す",
  terrace: "平らにする範囲をクリックで囲む（3点以上）→ ダブルクリックか Enter で確定。中の傾斜を消して、ふちを垂直に切る",
  wall: "壁の線をクリックで描く → ダブルクリックか Enter で確定（Esc で取り消し）。高さは高いほうの地面から",
  slope: "坂道の中心線を、平地の段差をまたいで描く → 両端は自動で地面（平地）の高さ。左の図で途中の高さや両わきを決める",
  stairs: "階段の中心線を、平地の段差をまたいで描く → 両端の高さの差を一段の高さで割って段ができる",
  bridge: "橋の中心線を岸から岸へ描く → 両端は地面の高さ。途中の点に高さを入れると、そこが持ち上がる",
  passage: "建物の外から外へ、くぐる道の中心線を描く → 幅と天井の高さの穴が建物にあく",
};
const DRAFT_KEY = "map3dEditorDraft";
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
  if (f.type === "wall" || f.coords.length < 2) return null;
  const xy = f.coords.map(toXY);
  // 坂道・階段は点ごとの横幅（だんだん広がる）に土台のぶんを足す
  const path = f.type === "slope" || f.type === "stairs";
  const hw = path ? vertexWidths(f).map((w) => (w + baseWidth(f) - f.width) / 2) : xy.map(() => f.width / 2);
  const cv = path ? vertexShifts(f) : xy.map(() => 0); // 帯の中心のずれ（左へ m）
  const L = offsetLine(xy, hw.map((h, i) => cv[i] + h));
  const R = offsetLine(xy, hw.map((h, i) => cv[i] - h)).reverse();
  return [[...L, ...R, L[0]].map(toLngLat)];
};
function overlayFC(features, selId) {
  const out = [];
  features.forEach((f) => {
    const p = { id: f.id, col: TYPE_COL[f.type], sel: f.id === selId ? 1 : 0 };
    const fp = footprint(f);
    if (fp) out.push({ type: "Feature", properties: { ...p, fill: 1 }, geometry: { type: "Polygon", coordinates: fp } });
    out.push({ type: "Feature", properties: { ...p, fill: 0 }, geometry: { type: "LineString", coordinates: isArea(f.type) ? [...f.coords, f.coords[0]] : f.coords } });
  });
  return { type: "FeatureCollection", features: out };
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
        {f.side === 0 && f.walls !== false && (
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
  const [selVertex, setSelVertex] = useState(null);
  const [cands, setCands] = useState([]);
  const [showCands, setShowCands] = useState(true);
  const [selCand, setSelCand] = useState(null);
  const [seeThrough, setSeeThrough] = useState(true);
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
  const finishDraft = useCallback(() => {
    const { draft: d, tool: tl } = S.current;
    const pts = d.filter((p, i) => i === 0 || !near(p, d[i - 1])); // ダブルクリックで重なった点は1つに
    setDraft([]);
    if (tl === "select" || pts.length < (isArea(tl) ? 3 : 2)) return;
    const f = createFeature(tl, pts);
    if (!f) return;
    commit((list) => [...list, f]);
    setTool("select");
    setSelId(f.id);
    setSelVertex(null);
    setSelCand(null);
  }, [commit]);

  const removeVertex = useCallback((id, v) => {
    updateFeature(id, (g) => {
      // 消した点の前後の区間は1つになる（どちらも踊り場なら踊り場のまま）
      const fl = g.flat;
      const flat = !fl ? fl : v === 0 ? fl.slice(1) : v === g.coords.length - 1 ? fl.slice(0, -1) : [...fl.slice(0, v - 1), fl[v - 1] && fl[v], ...fl.slice(v + 1)];
      // 段数を手で決めているときは、つないだ区間の段数を足す
      const st = g.steps;
      const steps = !st ? st : v === 0 ? st.slice(1) : v === g.coords.length - 1 ? st.slice(0, -1) : [...st.slice(0, v - 1), (st[v - 1] || 0) + (st[v] || 0) || null, ...st.slice(v + 1)];
      return { coords: g.coords.filter((_, i) => i !== v), z: g.z ? g.z.filter((_, i) => i !== v) : g.z, flat, steps, widths: g.widths ? g.widths.filter((_, i) => i !== v) : g.widths, shifts: g.shifts ? g.shifts.filter((_, i) => i !== v) : g.shifts };
    });
    setSelVertex(null);
  }, [updateFeature]);
  const removeFeature = useCallback((id) => {
    commit((list) => list.filter((g) => g.id !== id));
    setSelId(null);
    setSelVertex(null);
  }, [commit]);
  // Delete キー：点を選んでいればその点（2点より多いとき）、でなければ構造物ごと
  const removeSelected = useCallback(() => {
    const { sel: f, selVertex: v } = S.current;
    if (!f) return;
    if (v != null && f.coords.length > (isArea(f.type) ? 3 : 2)) removeVertex(f.id, v);
    else removeFeature(f.id);
  }, [removeVertex, removeFeature]);

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

  S.current = { features, draft, tool, sel, selVertex, showCands, cands, dirty, snapOn, snapIndex, finishDraft, removeSelected, undo, redo, save };

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
    const sel = ["==", ["get", "sel"], 1];
    [
      { id: "ed-fill", type: "fill", source: "ed-feat", filter: ["==", ["get", "fill"], 1], paint: { "fill-color": ["get", "col"], "fill-opacity": ["case", sel, 0.38, 0.18] } },
      { id: "ed-cand-line", type: "line", source: "ed-cands", layout: { "line-cap": "round" }, paint: { "line-color": CAND_COL, "line-width": 3, "line-dasharray": [1.5, 1.5], "line-opacity": 0.85 } },
      { id: "ed-cand-hit", type: "line", source: "ed-cands", paint: { "line-color": "rgba(0,0,0,0)", "line-width": 16 } },
      { id: "ed-line", type: "line", source: "ed-feat", filter: ["==", ["get", "fill"], 0], layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": ["get", "col"], "line-width": ["case", sel, 4.5, 2.5] } },
      { id: "ed-hit", type: "line", source: "ed-feat", filter: ["==", ["get", "fill"], 0], paint: { "line-color": "rgba(0,0,0,0)", "line-width": 18 } },
      { id: "ed-draft-line", type: "line", source: "ed-draft", filter: ["==", ["geometry-type"], "LineString"], layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": ["get", "col"], "line-width": 3, "line-dasharray": [2, 1.2] } },
      { id: "ed-draft-pt", type: "circle", source: "ed-draft", filter: ["==", ["geometry-type"], "Point"], paint: { "circle-radius": 5, "circle-color": ["get", "col"], "circle-stroke-color": "#ffffff", "circle-stroke-width": 2, "circle-pitch-alignment": "map" } },
      // 選んだ橋の上を通る経路の線（ルートが浮くところ）
      { id: "ed-lift", type: "line", source: "ed-lift", layout: { "line-cap": "round" }, paint: { "line-color": LIFT_COL, "line-width": 6, "line-opacity": 0.8, "line-dasharray": [1.2, 0.8] } },
      // 道に合わせたときの目印：合わせた線と、点（頂点なら大きい輪、線の上なら小さい輪）
      { id: "ed-snap-seg", type: "line", source: "ed-snap", filter: ["==", ["geometry-type"], "LineString"], layout: { "line-cap": "round" }, paint: { "line-color": SNAP_COL, "line-width": 5, "line-opacity": 0.55 } },
      { id: "ed-snap-pt", type: "circle", source: "ed-snap", filter: ["==", ["geometry-type"], "Point"], paint: { "circle-radius": ["case", ["==", ["get", "v"], 1], 8, 5.5], "circle-color": "#ffffff", "circle-stroke-color": SNAP_COL, "circle-stroke-width": 3, "circle-pitch-alignment": "map" } },
    ].forEach((l) => map.addLayer(l, before));

    // 画面上の点 pt（マウスの位置）の近くに道があれば、そこへ合わせた点。なければ null
    const snapAt = (pt, ll, alt = false) => {
      const s = S.current;
      if (!s.snapOn || !s.snapIndex || alt || altRef.current) return null;
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
    snapFns.current = { snapAt, showSnap };

    const onClick = (ev) => {
      const s = S.current;
      if (s.tool !== "select") {
        const snap = snapAt(ev.point, ev.lngLat, ev.originalEvent?.altKey);
        setDraft((d) => [...d, snap ? snap.ll : [ev.lngLat.lng, ev.lngLat.lat]]);
        return;
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
      if (S.current.tool === "select") return;
      ev.preventDefault();
      S.current.finishDraft();
    };
    // 描く道具のときは、道に合う位置を示す。描いている途中は、最後の点からそこまでの線も出す
    const onMove = (ev) => {
      const s = S.current;
      if (s.tool === "select") return;
      const snap = snapAt(ev.point, ev.lngLat, ev.originalEvent?.altKey);
      showSnap(snap);
      if (!s.draft.length) return;
      const col = TYPE_COL[s.tool];
      const pts = [...s.draft, snap ? snap.ll : [ev.lngLat.lng, ev.lngLat.lat], ...(isArea(s.tool) ? [s.draft[0]] : [])];
      map.getSource("ed-draft")?.setData({ type: "FeatureCollection", features: [
        { type: "Feature", properties: { col }, geometry: { type: "LineString", coordinates: pts } },
        ...s.draft.map((p) => ({ type: "Feature", properties: { col }, geometry: { type: "Point", coordinates: p } })),
      ] });
    };
    const onOut = () => showSnap(null);
    map.on("click", onClick);
    map.on("dblclick", onDbl);
    map.on("mousemove", onMove);
    map.on("mouseout", onOut);
    return () => {
      map.off("click", onClick);
      map.off("dblclick", onDbl);
      map.off("mousemove", onMove);
      map.off("mouseout", onOut);
      snapFns.current = {};
    };
  }, [mapReady]);

  // 線の表示を最新に
  useEffect(() => {
    const map = mapReady ? mapApi.current?.getMap() : null;
    if (!map || !features) return;
    map.getSource("ed-feat")?.setData(overlayFC(features, selId));
  }, [mapReady, features, selId]);
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
      ...(draft.length > 1 ? [{ type: "Feature", properties: { col }, geometry: { type: "LineString", coordinates: isArea(tool) ? [...draft, draft[0]] : draft } }] : []),
      ...draft.map((p) => ({ type: "Feature", properties: { col }, geometry: { type: "Point", coordinates: p } })),
    ] } : EMPTY);
    map.getCanvas().style.cursor = tool === "select" ? "" : "crosshair";
    if (tool === "select") snapFns.current.showSnap?.(null);
  }, [mapReady, draft, tool]);
  // 建物を半透明にして、下の線や穴を見やすく。半透明の建物は奥行きを書くので、あとから描く構造物（壁・階段）は建物の裏で消え、
  // 先に描いた地形（段差）だけが透けて見えてしまう → 半透明のあいだは構造物を建物より先に描く
  useEffect(() => {
    const map = mapReady ? mapApi.current?.getMap() : null;
    if (!map?.getLayer("cb-buildings")) return;
    map.setPaintProperty("cb-buildings", "fill-extrusion-opacity", seeThrough ? 0.5 : 0.97);
    if (map.getLayer("cb-extras")) map.moveLayer("cb-extras", seeThrough ? "cb-buildings" : map.getLayer("nav-route-passed") ? "nav-route-passed" : undefined);
  }, [mapReady, seeThrough]);
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
    const dot = (i) => {
      const d = document.createElement("div");
      const on = i === selVertex;
      d.style.cssText = `width:${on ? 16 : 13}px;height:${on ? 16 : 13}px;border-radius:50%;background:${on ? col : "#fff"};border:3px solid ${col};box-sizing:border-box;cursor:grab;box-shadow:0 1px 4px rgba(0,0,0,.5)`;
      d.title = `点${i + 1}`;
      return d;
    };
    sel.coords.forEach((c, i) => {
      const m = new ml.Marker({ element: dot(i), draggable: true, opacityWhenCovered: "1" }).setLngLat(c).addTo(map);
      m.getElement().addEventListener("click", (e) => { e.stopPropagation(); setSelVertex(i); });
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
    for (let i = 0; i < sel.coords.length - (isArea(sel.type) ? 0 : 1); i++) {
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
          // 段数を手で決めているときは、半分ずつに分ける
          steps: g.steps ? [...g.steps.slice(0, i), ...(g.steps[i] ? [Math.max(1, Math.round(g.steps[i] / 2)), Math.max(1, g.steps[i] - Math.round(g.steps[i] / 2))] : [null, null]), ...g.steps.slice(i + 1)] : g.steps,
        }));
        setSelVertex(i + 1);
      });
      markers.current.push(new ml.Marker({ element: d, opacityWhenCovered: "1" }).setLngLat([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]).addTo(map));
    }
    // 坂道・階段：各点の左右のふちのつまみ。ドラッグで、反対側のふちはそのままで横幅とずれを変える（その点の横の線の上だけ動く）
    if (sel.type === "slope" || sel.type === "stairs") {
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
  }, [mapReady, sel, selVertex, updateFeature]);

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
        <Row label="高さ (m)"><Num value={sel.height} min={0.1} max={40} onChange={(v) => update({ height: v }, "height")} /><span style={{ fontSize: 10, color: T.txD }}>高いほうの地面から</span></Row>
        <Row label="厚さ (m)"><Num value={sel.thickness} min={0.05} max={5} step={0.05} onChange={(v) => update({ thickness: v }, "thickness")} /></Row>
      </>}
      {sel.type === "terrace" && <TerracePanel f={sel} demTick={demTick} update={update} />}
      {sel.type === "passage" && <>
        <Row label="幅 (m)"><Num value={sel.width} min={0.5} max={60} onChange={(v) => update({ width: v }, "width")} /></Row>
        <Row label="天井の高さ (m)"><Num value={sel.height} min={0.1} max={40} onChange={(v) => update({ height: v }, "height")} /><span style={{ fontSize: 10, color: T.txD }}>屋上より高いと切り通し</span></Row>
      </>}
      {(sel.type === "slope" || sel.type === "stairs" || sel.type === "bridge") && (
        <ShapeEditor key={sel.id} f={sel} demTick={demTick} selVertex={selVertex} setSelVertex={setSelVertex} update={update} lift={lift} onAlign={alignToWalk} />
      )}
      <div style={{ display: "flex", gap: 6, marginTop: 12, flexWrap: "wrap" }}>
        <Btn onClick={() => flyTo(sel.coords)}>ここへ移動</Btn>
        {selVertex != null && sel.coords.length > (isArea(sel.type) ? 3 : 2) && <Btn col={T.red} onClick={() => removeVertex(sel.id, selVertex)}>点{selVertex + 1}を削除</Btn>}
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
                <li>上の「平地・坂道・階段・壁・橋・通り抜け」を選び、地図をクリックして描く</li>
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
