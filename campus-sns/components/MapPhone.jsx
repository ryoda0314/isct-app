// 歩いて見るときのスマホ（2026-11-17、ユーザー「メタ的にこの世界の中でスマホを見て、ナビ機能を使うとこの世界の道に道案内表示が出るように」）。
// 持ち物のスマホをタップするか P キーで開く。案内中はほかの物を持っても次の曲がり角を表示する。
// 現在地（この世界の GPS＝歩く人のいる所）・行き先を探す・ルートの下見（距離・分・階段）・案内（次の曲がり角・残り）。
// 経路を引く・案内を始める・やめるのは CampusMap3D（onPlan・onStart・onStop。帯は campus3dGuide が世界の道に描く）
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { t } from "../i18n.js";
import { toXY } from "../campus3dFeatures.js";
import { worldNow } from "../campus3dClock.js";
import { SPOT_CATS } from "../hooks/useNavigation.js";
import { destinationRoom, destinationScore, getRecentDestinations, normalizeDestination, rememberDestination } from "../navDestinations.js";
import { mapGeom } from "./MapInventory.jsx";

const CSS = `
.cb3-phone-overlay{position:absolute;inset:0;z-index:12;display:grid;justify-items:end;align-items:center;container:phone-space / size;
  padding:calc(10px + var(--cb3-st,env(safe-area-inset-top,0px))) calc(16px + var(--cb3-sr,env(safe-area-inset-right,0px))) calc(10px + var(--cb3-sb,env(safe-area-inset-bottom,0px))) calc(16px + var(--cb3-sl,env(safe-area-inset-left,0px)));
  box-sizing:border-box;pointer-events:auto;background:rgba(9,24,31,.36);touch-action:auto}
.cb3-walk-ui[data-phone-open]{z-index:12}
.cb3-walk-ui[data-phone-open]>:not(.cb3-phone-overlay):not(style){visibility:hidden}
.cb3-phone{--ink:#152e32;--muted:#52686b;--line:#d2dedb;--paper:#f5f8f6;--tint:#e1f1eb;--action:#09654f;
  color:var(--ink);font-family:inherit;line-height:1.35;text-align:left;box-sizing:border-box}
.cb3-phone *, .cb3-phone *::before, .cb3-phone *::after{box-sizing:border-box}
.cb3-phone button,.cb3-phone input,.cb3-phone select{font-family:inherit;color:inherit}
.cb3-phone button,.cb3-phone select{cursor:pointer}
.cb3-phone button:focus-visible,.cb3-phone select:focus-visible,.cb3-phone input:focus-visible,.cb3-phone.mini:focus-visible{outline:3px solid #2379aa;outline-offset:-3px}
.cb3-phone svg{flex:none;width:20px;height:20px}
.cb3-phone [hidden]{display:none!important}
.cb3-phone-panel{width:min(365px,100%);height:min(614px,100%);min-height:0;display:flex;flex-direction:column;overflow:hidden;outline:0;
  background:var(--paper);border:5px solid #202e30;border-radius:28px;box-shadow:0 14px 45px #081a2260,0 0 0 1px #ffffff60}
.cb3-phone-st{display:flex;flex:none;align-items:center;justify-content:space-between;height:23px;padding:2px 19px 0;font-size:11px;font-weight:750;letter-spacing:.025em;background:#fff}
.cb3-phone-st span{display:flex;align-items:center;gap:5px}
.cb3-phone-st i{width:16px;height:8px;display:inline-block;border:1px solid currentColor;border-radius:2px;padding:1px;background:linear-gradient(to right,currentColor 75%,transparent 75%) content-box}
.cb3-phone-bar{display:flex;flex:none;align-items:center;gap:4px;min-height:48px;padding:0 6px 3px 14px;background:#fff;border-bottom:1px solid var(--line)}
.cb3-phone-bar h2{flex:1;margin:0;font-size:18px;font-weight:800;line-height:1.2;color:var(--ink);letter-spacing:0}
.cb3-phone-bar button,.cb3-phone-search button{width:44px;height:44px;display:grid;place-items:center;border:0;border-radius:12px;padding:0;background:transparent}
.cb3-phone-bar button:first-child{margin-left:-8px}
.cb3-phone-bar button:hover,.cb3-phone-search button:hover{background:var(--tint)}
.cb3-phone-home,.cb3-phone-route{flex:1;min-height:0;display:flex;flex-direction:column}
.cb3-phone-tools{flex:none;display:grid;gap:8px;padding:13px 14px 10px;border-bottom:1px solid var(--line)}
.cb3-phone-here{display:flex;align-items:center;gap:7px;min-width:0;font-size:12px;font-weight:700;color:var(--muted)}
.cb3-phone-here svg{width:16px;height:16px;color:var(--action)}
.cb3-phone-here span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.cb3-phone-search{display:flex;align-items:center;gap:6px;padding-left:11px;border:1px solid #a8bcb7;border-radius:13px;background:#fff}
.cb3-phone-search:focus-within{border-color:var(--action);box-shadow:0 0 0 1px var(--action)}
.cb3-phone-search>svg{color:var(--action);width:18px;height:18px}
.cb3-phone-q{width:100%;min-width:0;min-height:44px;padding:0 5px;border:0;border-radius:10px;background:transparent;font-size:16px;color:var(--ink)}
.cb3-phone .cb3-phone-q:focus-visible{outline:none}
.cb3-phone-search button{flex:none;color:var(--muted)}
.cb3-phone-category{display:flex;align-items:center;position:relative;align-self:start;width:fit-content;max-width:100%}
.cb3-phone-category>svg{position:absolute;left:10px;width:16px;height:16px;color:var(--action);pointer-events:none}
.cb3-phone-category::after{content:"";position:absolute;right:12px;top:calc(50% - 4px);width:7px;height:7px;border:solid var(--muted);border-width:0 1.5px 1.5px 0;transform:rotate(45deg);pointer-events:none}
.cb3-phone-category select{appearance:none;min-height:44px;max-width:100%;padding:0 28px 0 32px;border:1px solid var(--line);border-radius:11px;background:#fff;font-size:13px;font-weight:700}
.cb3-phone-results{flex:1;min-height:0;overflow:auto;overscroll-behavior:contain;padding:12px 14px 16px;scrollbar-width:thin;scrollbar-color:#bac9c5 transparent}
.cb3-phone-section{margin:0 0 7px;font-size:12px;font-weight:750;color:var(--muted)}
.cb3-phone-shortcuts{display:grid;grid-template-columns:1fr 1fr;gap:5px;margin:0 0 14px}
.cb3-phone-shortcuts button{display:flex;align-items:center;gap:6px;min-height:44px;min-width:0;padding:5px 9px;text-align:left;background:#e7f2ed;border:1px solid #c8dfd5;border-radius:11px;font-size:13px;font-weight:750}
.cb3-phone-shortcuts svg{width:16px;height:16px;color:var(--action)}
.cb3-phone-shortcuts span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.cb3-phone-list{display:flex;flex-direction:column;border:1px solid var(--line);border-radius:14px;background:#fff;overflow:hidden}
.cb3-phone-list button{display:flex;align-items:center;gap:9px;width:100%;min-height:52px;padding:7px 10px;border:0;background:transparent;text-align:left}
.cb3-phone-list button+button{border-top:1px solid #e3eae7}
.cb3-phone-list button:hover,.cb3-phone-shortcuts button:hover{background:var(--tint)}
.cb3-phone-badge{width:31px;height:31px;border-radius:9px;display:grid;place-items:center;background:#edf2ef;color:#466561}
.cb3-phone-badge svg{width:17px;height:17px}
.cb3-phone-list .nm{flex:1;min-width:0}
.cb3-phone-list .nm b{display:block;font-size:14px;line-height:1.35;overflow-wrap:anywhere}
.cb3-phone-list .nm small{font-size:11px;font-weight:600;color:var(--muted)}
.cb3-phone-list .d{flex:none;font-size:12px;font-weight:750;color:var(--muted);font-variant-numeric:tabular-nums}
.cb3-phone-empty{padding:12px 0;text-align:center;font-size:14px}
.cb3-phone-empty button,.cb3-phone-stop{display:inline-flex;align-items:center;min-height:44px;border:0;background:transparent;text-decoration:underline;text-underline-offset:3px;color:var(--action);font-size:13px;font-weight:700}
.cb3-phone-route-main{flex:1;min-height:0;overflow:auto;overscroll-behavior:contain;display:flex;flex-direction:column;gap:10px;padding:12px 14px}
.cb3-phone-card{padding:12px;background:white;border:1px solid var(--line);border-radius:14px}
.cb3-phone-card h3{margin:0;font-size:18px;line-height:1.3;overflow-wrap:anywhere}
.cb3-phone-card .sub{margin:4px 0;color:var(--muted);font-size:12px;font-weight:650}
.cb3-phone-card .sum{display:flex;align-items:baseline;gap:8px;flex-wrap:wrap;margin-top:8px}
.cb3-phone-card .sum b{font-size:23px;color:var(--action)}
.cb3-phone-card .sum span{font-size:14px;font-weight:700}
.cb3-phone-card .sum .cb3-phone-tag{padding:2px 6px;border-radius:5px;background:#fff1db;color:#855015;font-size:11px}
.cb3-phone-map-panel{display:flex;flex:1;flex-direction:column;min-height:125px;overflow:hidden;border:1px solid var(--line);border-radius:14px;background:#eef1f4}
.cb3-phone-map{width:100%;min-height:0;flex:1;display:block}
.cb3-phone-map-modes{flex:none;display:flex;margin:0;background:#fff;border-top:1px solid var(--line)}
.cb3-phone-map-modes button{flex:1;min-height:44px;border:0;background:transparent;display:flex;align-items:center;justify-content:center;gap:5px;font-size:12px;font-weight:700;color:var(--muted)}
.cb3-phone-map-modes button[aria-pressed=true]{background:var(--tint);color:var(--action);box-shadow:inset 0 -3px var(--action)}
.cb3-phone-map-modes svg{width:16px;height:16px}
.cb3-phone-actions{flex:none;display:flex;gap:8px;padding:8px 14px 10px;border-top:1px solid var(--line);background:#fff}
.cb3-phone-actions button{flex:1;min-height:46px;border:1px solid #c3d2cd;border-radius:12px;background:#fff;font-size:14px;font-weight:750}
.cb3-phone-actions button.pri{background:var(--action);color:#fff;border-color:var(--action)}
.cb3-phone-actions button:disabled{opacity:.45;cursor:default}
.cb3-phone-next{display:flex;align-items:center;gap:10px}
.cb3-phone-next>svg{width:36px;height:36px;color:var(--action)}
.cb3-phone-next .tx{min-width:0}
.cb3-phone-next .tx b{display:block;font-size:22px;line-height:1.15}
.cb3-phone-next .tx span{display:block;font-size:14px;font-weight:750}
.cb3-phone-then,.cb3-phone-left{display:block;margin-top:8px;font-size:12px;font-weight:650;color:var(--muted)}
.cb3-phone-then{display:flex;align-items:center;gap:5px}
.cb3-phone-then svg{width:15px;height:15px}
.cb3-phone-ok{display:grid;justify-items:center;gap:6px;margin:auto;text-align:center}
.cb3-phone-ok svg{width:38px;height:38px;color:var(--action)}
.cb3-phone-stop{padding:0;color:#90463a}
.cb3-phone.mini{position:absolute;right:calc(12px + var(--cb3-sr,0px));top:calc(52px + var(--cb3-st,0px));z-index:4;pointer-events:auto;
  display:flex;align-items:center;gap:8px;min-height:44px;max-width:196px;padding:6px 10px;border:1px solid #d4e2dc;border-radius:14px;background:#fffffff5;
  box-shadow:0 2px 12px #142e3436;font-size:13px;font-weight:750;cursor:pointer}
.cb3-phone.mini>svg{color:var(--action)}
.cb3-phone.mini kbd{margin-left:2px;padding:1px 5px;border:1px solid #cdd9d4;border-radius:4px;color:var(--muted);font:700 10px/1.5 monospace}
.cb3-phone.mini .cb3-phone-next>svg{width:25px;height:25px}
.cb3-phone.mini .cb3-phone-next .tx b{font-size:15px}
.cb3-phone.mini .cb3-phone-next .tx span,.cb3-phone.mini .cb3-phone-left{font-size:11px}
.cb3-phone.mini .cb3-phone-left{margin-top:4px}
@media (orientation:landscape) and (max-height:540px){
  .cb3-phone.mini{left:calc(10px + var(--cb3-sl,0px));right:auto;top:calc(52px + var(--cb3-st,0px));max-width:175px}
  .cb3-phone.mini[data-with-map]{left:auto;right:calc(122px + var(--cb3-sr,0px));top:auto;bottom:calc(78px + var(--cb3-sb,0px))}
}
.cb3-rot .cb3-phone.mini{left:calc(10px + var(--cb3-sl,0px));right:auto;top:calc(52px + var(--cb3-st,0px));max-width:175px}
.cb3-rot .cb3-phone.mini[data-with-map]{left:auto;right:calc(122px + var(--cb3-sr,0px));top:auto;bottom:calc(78px + var(--cb3-sb,0px))}
@container phone-space (min-width:490px) and (max-height:490px){
  .cb3-phone-panel{justify-self:center;width:min(710px,100%);height:100%;border-width:4px;border-radius:21px}
  .cb3-phone-st{height:17px}
  .cb3-phone-bar{min-height:44px;padding-bottom:0}
  .cb3-phone-home{display:grid;grid-template-columns:minmax(190px,.8fr) minmax(0,1.2fr)}
  .cb3-phone-tools{align-content:start;border-bottom:0;border-right:1px solid var(--line);padding:12px;overflow:auto}
  .cb3-phone-results{padding:10px 12px}
  .cb3-phone-route-main{display:grid;grid-template-columns:minmax(180px,.8fr) minmax(0,1.2fr);padding:8px 12px;gap:9px}
  .cb3-phone-card{align-self:start}
  .cb3-phone-map-panel{min-height:95px}
  .cb3-phone-actions{padding:6px 12px}
  .cb3-phone-actions button{min-height:44px}
  .cb3-phone-ok{grid-column:1/-1}
}
@container phone-space (min-width:490px) and (min-height:295px) and (max-height:490px){
  .cb3-phone-home{grid-template-rows:auto minmax(0,1fr)}
  .cb3-phone-tools{grid-area:1/1;padding-bottom:8px}
  .cb3-phone-here span{white-space:normal}
  .cb3-phone-results{display:contents}
  .cb3-phone-landmarks{grid-area:2/1;min-height:0;overflow:auto;padding:2px 12px 8px;border-right:1px solid var(--line);overscroll-behavior:contain}
  .cb3-phone-landmarks .cb3-phone-shortcuts{margin:0}
  .cb3-phone-places{grid-area:1/2/3/3;min-height:0;overflow:auto;padding:10px 12px;overscroll-behavior:contain;scrollbar-width:thin}
}
@container phone-space (max-width:489px){
  .cb3-phone-panel{justify-self:center}
}
@container phone-space (max-height:270px){
  .cb3-phone-st,.cb3-phone-here{display:none}
  .cb3-phone-tools,.cb3-phone-results{padding:5px 9px}
}
.cb3-guide-tag{position:absolute;left:0;top:0;padding:4px 10px;border-radius:10px;background:rgba(14,32,48,.82);color:#fff;font-size:12px;font-weight:800;white-space:nowrap;
  pointer-events:none;z-index:3;display:none;box-shadow:0 4px 12px -6px rgba(0,0,0,.5)}
.cb3-guide-tag b{margin-left:6px;color:#9fd2ff}
`;

// 曲がり角などの絵（線の絵。色は文字の色）
const ARROW = {
  phone: <><rect x="6" y="2" width="12" height="20" rx="3" /><path d="M10 5h4m-4 14h4" /></>,
  close: <path d="m6 6 12 12M18 6 6 18" />,
  back: <path d="m14 5-7 7 7 7" />,
  search: <><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 5 5" /></>,
  filter: <path d="M3 6h18M6 12h12m-9 6h6" />,
  route: <><circle cx="5" cy="18" r="2" /><circle cx="19" cy="6" r="2" /><path d="M7 18h8a3 3 0 0 0 0-6H9a3 3 0 0 1 0-6h8" /></>,
  train: <><rect x="5" y="3" width="14" height="15" rx="4" /><path d="M5 10h14m-10 4h1m4 0h1M8 18l-3 3m11-3 3 3" /></>,
  shop: <><path d="m3 9 2-5h14l2 5v2a3 3 0 0 1-4.5 2 3 3 0 0 1-4.5 0 3 3 0 0 1-4.5 0A3 3 0 0 1 3 11V9Zm2.5 5v6h13v-6" /></>,
  book: <path d="M3 4.5Q8 3 12 6q4-3 9-1.5v14Q16 17 12 20q-4-3-9-1.5v-14ZM12 6v14" />,
  food: <path d="M5 3v5m3-5v5m3-5v5a3 3 0 0 1-6 0m3 3v10m11 0V3c-4 2-4 8-4 10h4" />,
  straight: <path d="M12 20V5M6.5 10.5 12 5l5.5 5.5" />,
  left: <path d="M17 20v-7a3 3 0 0 0-3-3H6M10 6 6 10l4 4" />,
  right: <path d="M7 20v-7a3 3 0 0 1 3-3h8M14 6l4 4-4 4" />,
  slightLeft: <path d="M15 20v-5.5a4 4 0 0 0-1.2-2.8L7.5 5.5M7 11V5h6" />,
  slightRight: <path d="M9 20v-5.5a4 4 0 0 1 1.2-2.8l6.3-6.2M17 11V5h-6" />,
  uturn: <path d="M8 20V9a4 4 0 0 1 8 0v6M12.5 12 16 15.5 19.5 12" />,
  stairsUp: <path d="M4 19h4v-4h4v-4h4V7h4M14 4h6v6" />,
  stairsDown: <path d="M4 7h4v4h4v4h4v4h4M20 13v6h-6" />,
  arrive: <path d="M12 21s-6.5-6-6.5-11a6.5 6.5 0 0 1 13 0c0 5-6.5 11-6.5 11zM12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z" />,
};
const Icon = ({ k, ...p }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...p}>
    {ARROW[k] || ARROW.straight}
  </svg>
);
const PIN = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="3.2" fill="currentColor" stroke="none" />
    <circle cx="12" cy="12" r="7.5" />
    <path d="M12 1.8v3M12 19.2v3M1.8 12h3M19.2 12h3" />
  </svg>
);

// 案内の絵の種類と文（曲がり角・階段・目的地）
const keyOf = (m) => (!m ? "straight" : m.kind === "turn" ? m.dir : m.kind === "stairs" ? (m.up === false ? "stairsDown" : "stairsUp") : m.kind === "arrive" ? "arrive" : "straight");
const textOf = (m) => {
  if (!m) return t("phone.straight");
  if (m.kind === "turn") return t(`phone.${m.dir}`);
  if (m.kind === "stairs") return t(m.up === false ? "phone.stairsDown" : m.up === true ? "phone.stairsUp" : "phone.stairs");
  return t("phone.arriveAt");
};
// 距離の書き方（20m までは 1m、100m までは 5m、それより上は 10m きざみ。1km からは km）
export const fmtDist = (m) => {
  if (!Number.isFinite(m)) return "";
  if (m >= 1000) return `${(m / 1000).toFixed(1)} km`;
  const r = m < 20 ? Math.round(m) : m < 100 ? Math.round(m / 5) * 5 : Math.round(m / 10) * 10;
  return `${r} m`;
};
const clock = () => {
  const d = new Date(worldNow());
  return `${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`;
};

// スマホの中の小さな地図：経路（青い線）・自分（向きの三角）・目的地。fit は経路全体を見せる（下見）、でなければ自分を中心に
function PhoneMap({ walkRef, geom, route, dest, fit, accent }) {
  const ref = useRef(null);
  useEffect(() => {
    let raf = 0;
    let last = 0;
    const draw = (now) => {
      raf = requestAnimationFrame(draw);
      if (now - last < 100) return;
      last = now;
      const cv = ref.current;
      const w = walkRef.current;
      if (!cv || !w) return;
      const W = cv.clientWidth;
      const H = cv.clientHeight;
      if (!W || !H) return;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) {
        cv.width = Math.round(W * dpr);
        cv.height = Math.round(H * dpr);
      }
      const g = cv.getContext("2d");
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.fillStyle = "#eef1f4";
      g.fillRect(0, 0, W, H);
      const pts = route;
      // 見せる範囲：経路全体（と自分）か、自分のまわり
      let cx = w.x;
      let cy = w.y;
      let k = 0.9;
      if (fit && pts?.length) {
        let x0 = w.x, x1 = w.x, y0 = w.y, y1 = w.y;
        for (const p of pts) {
          x0 = Math.min(x0, p[0]);
          x1 = Math.max(x1, p[0]);
          y0 = Math.min(y0, p[1]);
          y1 = Math.max(y1, p[1]);
        }
        cx = (x0 + x1) / 2;
        cy = (y0 + y1) / 2;
        k = Math.max(.02, Math.min(3, (W - 36) / Math.max(20, x1 - x0), (H - 36) / Math.max(20, y1 - y0)));
      }
      const X = (p) => W / 2 + (p[0] - cx) * k;
      const Y = (p) => H / 2 - (p[1] - cy) * k;
      const R = Math.max(W, H) / k;
      const near = (q) => q.some((p) => Math.abs(p[0] - cx) < R && Math.abs(p[1] - cy) < R);
      const poly = (q, fill) => {
        if (!near(q)) return;
        g.beginPath();
        q.forEach((p, i) => (i ? g.lineTo(X(p), Y(p)) : g.moveTo(X(p), Y(p))));
        g.closePath();
        g.fillStyle = fill;
        g.fill();
      };
      const line = (q, width, color) => {
        if (!near(q)) return;
        g.beginPath();
        q.forEach((p, i) => (i ? g.lineTo(X(p), Y(p)) : g.moveTo(X(p), Y(p))));
        g.lineWidth = width;
        g.strokeStyle = color;
        g.lineJoin = "round";
        g.lineCap = "round";
        g.stroke();
      };
      geom.green.forEach((q) => poly(q, "#d3e6c8"));
      geom.water.forEach((q) => poly(q, "#c5dcec"));
      geom.streets.forEach((s) => line(s.p, Math.max(1.5, s.w * k), "#ffffff"));
      geom.rail.forEach((q) => line(q, 1.5, "#8a9098"));
      geom.buildings.forEach((q) => poly(q, "#c3c9d0"));
      geom.own.forEach((q) => poly(q, "#aeb6bf"));
      if (pts?.length > 1) {
        line(pts, 7, "#ffffff");
        line(pts, 4, "#1a8ef0");
      }
      if (dest) {
        const [dx, dy] = dest;
        g.beginPath();
        g.arc(X([dx, dy]), Y([dx, dy]), 6, 0, Math.PI * 2);
        g.fillStyle = "#d2453b";
        g.fill();
        g.lineWidth = 2;
        g.strokeStyle = "#fff";
        g.stroke();
      }
      const b = ((w.yaw || 0) * Math.PI) / 180;
      g.save();
      g.translate(X([w.x, w.y]), Y([w.x, w.y]));
      g.rotate(b);
      g.beginPath();
      g.moveTo(0, -8);
      g.lineTo(5.5, 5.5);
      g.lineTo(0, 2.5);
      g.lineTo(-5.5, 5.5);
      g.closePath();
      g.fillStyle = accent || "#28c868";
      g.strokeStyle = "#fff";
      g.lineWidth = 1.5;
      g.fill();
      g.stroke();
      g.restore();
      g.fillStyle = "#0e2030";
      g.font = "800 10px sans-serif";
      g.textAlign = "center";
      g.fillText("N", W - 12, 14);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [walkRef, geom, route, dest, fit, accent]);
  return <canvas ref={ref} className="cb3-phone-map" role="img" aria-label={t(fit ? "phone.fullRoute" : "phone.aroundMe")} />;
}

function RouteMap({ overview, ...props }) {
  const [fit, setFit] = useState(overview);
  return (
    <div className="cb3-phone-map-panel">
      <PhoneMap {...props} fit={fit} />
      <div className="cb3-phone-map-modes" role="group" aria-label={t("nav.navigation")}>
        <button type="button" aria-pressed={!fit} onClick={() => setFit(false)}>{PIN}{t("phone.aroundMe")}</button>
        <button type="button" aria-pressed={fit} onClick={() => setFit(true)}><Icon k="route" />{t("phone.fullRoute")}</button>
      </div>
    </div>
  );
}

// 次の案内のカード（小さいスマホと大きいスマホ）
function NextCard({ guide, mini }) {
  const n = guide.next;
  return (
    <>
      <span className="cb3-phone-next">
        <Icon k={keyOf(n)} />
        <span className="tx">
          <b>{n ? fmtDist(n.dist) : ""}</b>
          <span>{textOf(n)}</span>
        </span>
      </span>
      {!mini && n?.then && (
        <span className="cb3-phone-then">
          {t("phone.then")}
          <Icon k={keyOf(n.then)} />
          {textOf(n.then)}
        </span>
      )}
      <span className="cb3-phone-left">{t("phone.to", { name: guide.dest.label })} {t("navi.remaining", { dist: fmtDist(guide.left), min: guide.minutes })}</span>
    </>
  );
}

const shortcuts = ["eki", "tokyu_store", "ookayama_kitaguchi", "lib"];
const placeIcon = s => ({ eki: "train", tokyu_store: "shop", ookayama_kitaguchi: "shop", lib: "book" }[s.id] || (s.cat === "restaurant" ? "food" : "arrive"));
const catName = id => SPOT_CATS.find(c => c.id === id)?.label || "";
const quickName = s => s.id === "ookayama_kitaguchi" ? s.short : s.id === "tokyu_store" ? s.label.split(" ")[0] : s.label;

function PhoneDialog({ guide, spots, walkRef, data, features, guideRef, accent, touch, onPlan, onStart, onStop, onClose }) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [pick, setPick] = useState(null);
  const [changing, setChanging] = useState(false);
  const [recentIds] = useState(getRecentDestinations);
  const [, tick] = useState(0);
  const overlay = useRef(null);
  const panel = useRef(null);
  const search = useRef(null);
  const results = useRef(null);
  const places = useRef(null);
  const lastChoice = useRef(null);
  const primary = useRef(null);
  const page = pick ? "preview" : guide && !changing ? (guide.arrived ? "arrived" : "guide") : "search";
  useEffect(() => {
    const timer = setInterval(() => tick(value => value + 1), 2000);
    return () => clearInterval(timer);
  }, []);
  // ソフトキーボードが覆う分だけスマホを縮める。探索を CSS で横向きにしているときは四辺も回す。
  useLayoutEffect(() => {
    const el = overlay.current;
    const viewport = window.visualViewport;
    if (!touch || !viewport || !el.closest(".cb3-full")) return;
    const fitViewport = () => {
      const bounds = el.parentElement.getBoundingClientRect();
      const top = viewport.offsetTop - bounds.top;
      const left = viewport.offsetLeft - bounds.left;
      const right = bounds.right - viewport.offsetLeft - viewport.width;
      const bottom = bounds.bottom - viewport.offsetTop - viewport.height;
      const insets = el.closest(".cb3-rot") ? [right, bottom, left, top] : [top, right, bottom, left];
      el.style.inset = insets.map(n => Math.max(0, n) + "px").join(" ");
    };
    fitViewport();
    const observer = new ResizeObserver(fitViewport);
    observer.observe(el.parentElement);
    viewport.addEventListener("resize", fitViewport);
    viewport.addEventListener("scroll", fitViewport);
    return () => {
      observer.disconnect();
      viewport.removeEventListener("resize", fitViewport);
      viewport.removeEventListener("scroll", fitViewport);
    };
  }, [touch]);
  useLayoutEffect(() => {
    const target = page === "search" ? lastChoice.current || (touch ? panel.current : search.current) : primary.current;
    (target?.isConnected && !target.disabled ? target : panel.current)?.focus({ preventScroll: true });
  }, [page, touch]);
  useEffect(() => {
    const keepFocus = event => {
      if (panel.current && !panel.current.contains(event.target)) panel.current.focus({ preventScroll: true });
    };
    document.addEventListener("focusin", keepFocus);
    return () => document.removeEventListener("focusin", keepFocus);
  }, []);

  const geom = useMemo(() => mapGeom(data, features), [data, features]);
  const indexed = useMemo(() => spots.map(s => ({ s, xy: toXY([s.lng, s.lat]) })), [spots]);
  const cats = useMemo(() => SPOT_CATS.filter(c => spots.some(s => s.cat === c.id)), [spots]);
  const x = walkRef.current?.x, y = walkRef.current?.y;
  const nearby = useMemo(() => indexed.map(({ s, xy }) => ({ s, d: Math.hypot(xy[0] - x, xy[1] - y) }))
    .sort((a, b) => a.d - b.d), [indexed, x, y]);
  const filtered = useMemo(() => {
    const needle = normalizeDestination(query);
    const room = destinationRoom(query);
    return nearby.filter(({ s }) => !category || category === s.cat)
      .map(row => ({ ...row, score: room && row.s.id === room.id ? 110 : destinationScore(row.s, needle) }))
      .filter(row => row.score >= 0).sort((a, b) => b.score - a.score || a.d - b.d);
  }, [nearby, query, category]);
  const recent = useMemo(() => recentIds.map(id => spots.find(s => s.id === id)).filter(Boolean), [recentIds, spots]);
  const quick = useMemo(() => shortcuts.map(id => spots.find(s => s.id === id)).filter(Boolean), [spots]);
  const near = nearby[0];
  const searching = !!(query.trim() || category);
  useLayoutEffect(() => {
    results.current.scrollTop = 0;
    places.current.scrollTop = 0;
  }, [query, category]);

  const guideShape = guideRef.current?.G;
  const points = useMemo(() => {
    if (pick) return pick.plan?.coords.map(c => toXY([c.lng, c.lat]));
    if (!guideShape) return null;
    const path = guideShape.pts.filter((_, i) => i % 4 === 0);
    path.push(guideShape.end);
    return path;
  }, [pick, guideShape]);

  const choose = (s, target) => {
    lastChoice.current = target;
    setPick({ spot: s, plan: onPlan(s.id) });
  };
  const back = () => {
    if (pick) setPick(null);
    else if (changing && guide) setChanging(false);
    else onClose();
  };
  const clear = () => {
    setQuery("");
    setCategory("");
    search.current?.focus({ preventScroll: true });
  };
  const keyDown = e => {
    e.stopPropagation();
    if (e.nativeEvent.isComposing || e.keyCode === 229) return;
    if (e.key === "Escape") {
      e.preventDefault();
      back();
    } else if (e.key === "Tab") {
      const items = Array.from(panel.current.querySelectorAll("button:not(:disabled),input,select")).filter(el => el.getClientRects().length);
      const first = items[0], last = items[items.length - 1];
      if (e.shiftKey && (e.target === first || e.target === panel.current)) {
        e.preventDefault();
        last?.focus();
      } else if (!e.shiftKey && e.target === last) {
        e.preventDefault();
        first?.focus();
      }
    } else if (e.target === search.current && e.key === "Enter" && filtered[0]) {
      e.preventDefault();
      choose(filtered[0].s, e.target);
    } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      const rows = Array.from(results.current?.querySelectorAll(".cb3-phone-list button") || []);
      const index = rows.indexOf(e.target);
      if (e.target === search.current && e.key === "ArrowDown" && rows[0]) {
        e.preventDefault();
        rows[0].focus();
      } else if (index !== -1) {
        e.preventDefault();
        const next = e.key === "ArrowDown" ? rows[Math.min(index + 1, rows.length - 1)] : rows[index - 1] || search.current;
        next.focus();
      }
    }
  };
  const shortList = (places, label) => places.length > 0 && (
    <>
      <h3 className="cb3-phone-section">{label}</h3>
      <div className="cb3-phone-shortcuts">
        {places.map(s => <button type="button" key={s.id} title={s.label} aria-label={s.label} onClick={e => choose(s, e.currentTarget)}>
          <Icon k={placeIcon(s)} /><span>{quickName(s)}</span>
        </button>)}
      </div>
    </>
  );

  return (
    <div ref={overlay} className="cb3-phone-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <section ref={panel} className="cb3-phone cb3-phone-panel" role="dialog" aria-modal="true" aria-label={t("nav.navigation")} tabIndex={-1} onKeyDown={keyDown}>
        <div className="cb3-phone-st"><span>{clock()}</span><span>GPS<i aria-hidden="true" /></span></div>
        <header className="cb3-phone-bar">
          {(pick || (changing && guide)) && <button type="button" aria-label={t("phone.back")} onClick={back}><Icon k="back" /></button>}
          <h2>{t(page === "preview" ? "phone.preview" : "nav.navigation")}</h2>
          <button type="button" aria-label={t("inv.close")} onClick={onClose}><Icon k="close" /></button>
        </header>
        <div className="cb3-phone-home" hidden={page !== "search"}>
          <div className="cb3-phone-tools">
            <div className="cb3-phone-here" title={t("phone.gps")}>{PIN}
              <span>{near && near.d < 60 ? t("phone.near", { name: near.s.label }) : t("navi.currentLocation")}</span>
            </div>
            <div className="cb3-phone-search">
              <Icon k="search" />
              <input ref={search} className="cb3-phone-q" value={query} onChange={e => setQuery(e.target.value)}
                aria-label={t("navi.searchDest")} placeholder={t("phone.searchHint")} enterKeyHint="search" autoComplete="off" spellCheck={false} />
              {query && <button type="button" aria-label={t("phone.clearQuery")} onClick={() => { setQuery(""); search.current?.focus(); }}><Icon k="close" /></button>}
            </div>
            <label className="cb3-phone-category"><Icon k="filter" />
              <select aria-label={t("phone.category")} value={category} onChange={e => setCategory(e.target.value)}>
                <option value="">{t("phone.allCategories")}</option>
                {cats.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
              </select>
            </label>
          </div>
          <div className="cb3-phone-results" ref={results}>
            <div className="cb3-phone-landmarks">
              {!searching && shortList(quick, t("phone.landmarks"))}
            </div>
            <div className="cb3-phone-places" ref={places}>
              {!searching && shortList(recent, t("phone.recent"))}
              <h3 className="cb3-phone-section" aria-live="polite">{searching ? t("phone.matches", { n: filtered.length }) : t("phone.nearby")}</h3>
              {filtered.length ? <div className="cb3-phone-list">
                {filtered.map(({ s, d }) => <button type="button" key={s.id} onClick={e => choose(s, e.currentTarget)}>
                  <span className="cb3-phone-badge"><Icon k={placeIcon(s)} /></span>
                  <span className="nm"><b>{s.label}</b><small>{catName(s.cat)}</small></span>
                  <span className="d">{fmtDist(d)}</span>
                </button>)}
              </div> : <div className="cb3-phone-empty">
                <div>{t("phone.none")}</div>
                {searching && <button type="button" onClick={clear}>{t("phone.resetSearch")}</button>}
              </div>}
            </div>
          </div>
        </div>
        {page !== "search" && <div className="cb3-phone-route">
          <div className="cb3-phone-route-main">
            {page === "arrived" ? <div className="cb3-phone-ok">
              <Icon k="arrive" /><b>{t("navi.arrived")}</b><span>{guide.dest.label}</span>
            </div> : <>
              <div className="cb3-phone-card">
                {pick ? <>
                  <h3>{pick.spot.label}</h3>
                  <div className="sub">{catName(pick.spot.cat)}</div>
                  {pick.plan ? <div className="sum">
                    <b>{t("navi.aboutMin", { n: pick.plan.minutes })}</b>
                    <span>{fmtDist(pick.plan.distance)}</span>
                    {pick.plan.hasStairs && <span className="cb3-phone-tag">{t("navi.hasStairs")}</span>}
                  </div> : <div className="sub" role="status">{t("navi.noRoute")}</div>}
                </> : <>
                  <NextCard guide={guide} />
                  <button type="button" className="cb3-phone-stop" onClick={onStop}>{t("navi.stopGuiding")}</button>
                </>}
              </div>
              {!!points?.length && <RouteMap key={page} walkRef={walkRef} geom={geom} route={points} dest={points[points.length - 1]} overview={!!pick} accent={accent} />}
            </>}
          </div>
          <footer className="cb3-phone-actions">
            {pick ? <>
              <button type="button" onClick={back}>{t("phone.back")}</button>
              <button ref={primary} type="button" className="pri" disabled={!pick.plan}
                onClick={() => { if (onStart(pick.spot.id)) rememberDestination(pick.spot.id); }}>{t("navi.startGuiding")}</button>
            </> : page === "guide" ? <>
              <button type="button" onClick={() => { lastChoice.current = null; setChanging(true); }}>{t("phone.change")}</button>
              <button ref={primary} type="button" className="pri" onClick={onClose}>{t("phone.resumeWalk")}</button>
            </> : <button ref={primary} type="button" className="pri" onClick={() => { onStop(); onClose(); }}>{t("phone.done")}</button>}
          </footer>
        </div>}
      </section>
    </div>
  );
}

// always：持っていなくても右上に出す（2026-11-25 整理：歩く画面からキャンパスナビへの入口。持ち物はふだんしまうので）。
// kit：持ち物を出しているか（しまっているときは、手に持った地図をよけない）
export function MapPhone({ inv, open, guide, onOpen, always = false, kit = true, ...props }) {
  if (!inv) return null;
  const held = inv.slots[inv.sel]?.id === "phone";
  return <>
    <style>{CSS}</style>
    {open ? <PhoneDialog {...props} guide={guide} /> : (held || guide || always) && (
      <button type="button" className="cb3-phone mini" data-with-map={(kit && inv.slots[inv.sel]?.id === "map") || undefined}
        aria-haspopup="dialog" aria-label={guide ? undefined : t("phone.open")} title={t("phone.open")} onClick={onOpen}>
        {guide ? <span>{guide.arrived ? <span>{t("navi.arrived")} · {guide.dest.label}</span> : <NextCard guide={guide} mini />}</span> : <>
          <Icon k="phone" /><span>{t("phone.launcher")}</span>{!props.touch && <kbd>P</kbd>}
        </>}
      </button>
    )}
  </>;
}
