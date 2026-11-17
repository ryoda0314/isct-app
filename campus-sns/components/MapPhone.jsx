// 歩いて見るときのスマホ（2026-11-17、ユーザー「メタ的にこの世界の中でスマホを見て、ナビ機能を使うとこの世界の道に道案内表示が出るように」）。
// 持ち物の「スマホ」を持つと右上に小さく出て、使う（右クリック・Enter・「開く」）と大きく開く。中はこのアプリのキャンパスナビ：
// 現在地（この世界の GPS＝歩く人のいる所）・行き先を探す・ルートの下見（距離・分・階段）・案内（次の曲がり角・残り）。
// 経路を引く・案内を始める・やめるのは CampusMap3D（onPlan・onStart・onStop。帯は campus3dGuide が世界の道に描く）
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { t } from "../i18n.js";
import { toXY } from "../campus3dFeatures.js";
import { worldNow } from "../campus3dClock.js";
import { SPOT_CATS } from "../hooks/useNavigation.js";
import { mapGeom } from "./MapInventory.jsx";

const CSS = `
.cb3-phone{position:absolute;right:calc(28px + env(safe-area-inset-right));top:50%;transform:translateY(-50%);width:min(300px,calc(100% - 32px));
  height:min(600px,calc(100% - 140px));min-height:300px;box-sizing:border-box;padding:8px;border-radius:34px;background:#15181c;
  box-shadow:0 0 0 1px #2c3238,0 18px 40px -12px rgba(0,0,0,.6);pointer-events:auto;z-index:6;font-family:inherit;touch-action:auto}
.cb3-phone.mini{top:calc(52px + env(safe-area-inset-top));right:calc(12px + env(safe-area-inset-right));transform:none;width:178px;height:auto;min-height:0;
  padding:6px;border-radius:24px;cursor:pointer;z-index:4}
.cb3-phone-scr{height:100%;border-radius:27px;background:#f3f5f7;color:#0e2030;overflow:hidden;display:flex;flex-direction:column}
.cb3-phone.mini .cb3-phone-scr{border-radius:19px}
.cb3-phone-st{flex:0 0 auto;display:flex;align-items:center;justify-content:space-between;height:24px;padding:0 18px;font-size:11px;font-weight:800;color:#0e2030}
.cb3-phone.mini .cb3-phone-st{height:18px;padding:0 13px;font-size:9.5px}
.cb3-phone-st span{display:flex;align-items:center;gap:4px}
.cb3-phone-st i{display:inline-block;width:17px;height:8px;border:1.4px solid #0e2030;border-radius:2.5px;position:relative;box-sizing:border-box}
.cb3-phone-st i:after{content:"";position:absolute;left:1px;top:1px;bottom:1px;width:70%;background:#0e2030;border-radius:1px}
.cb3-phone-bar{flex:0 0 auto;display:flex;align-items:center;gap:8px;padding:4px 12px 8px}
.cb3-phone-bar b{flex:1;font-size:15px;font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cb3-phone-bar button{width:30px;height:30px;border-radius:15px;border:1px solid #cfd6de;background:#fff;color:#0e2030;font-size:15px;line-height:1;cursor:pointer;
  padding:0;font-family:inherit;flex:0 0 auto;display:flex;align-items:center;justify-content:center}
.cb3-phone-body{flex:1;min-height:0;overflow:auto;padding:0 12px 12px;-webkit-overflow-scrolling:touch;overscroll-behavior:contain}
.cb3-phone-here{display:flex;align-items:center;gap:8px;padding:8px 10px;border:1px solid #d6dde4;border-radius:12px;background:#fff;font-size:12.5px;font-weight:700;margin-bottom:8px}
.cb3-phone-here svg{flex:0 0 auto;color:var(--cb3-accent,#1a8ef0)}
.cb3-phone-here small{display:block;font-size:10.5px;font-weight:700;color:#6a7a8a}
.cb3-phone-q{width:100%;box-sizing:border-box;height:36px;border:1px solid #cfd6de;border-radius:12px;padding:0 12px;font-size:14px;font-family:inherit;background:#fff;color:#0e2030;outline:none}
.cb3-phone-q:focus{border-color:var(--cb3-accent,#1a8ef0)}
.cb3-phone-chips{display:flex;gap:6px;overflow-x:auto;padding:8px 0;scrollbar-width:none}
.cb3-phone-chips::-webkit-scrollbar{display:none}
.cb3-phone-chips button{flex:0 0 auto;height:28px;padding:0 11px;border-radius:14px;border:1px solid #cfd6de;background:#fff;color:#0e2030;font-size:12px;font-weight:700;
  font-family:inherit;cursor:pointer;white-space:nowrap}
.cb3-phone-chips button.on{background:#0e2030;border-color:#0e2030;color:#fff}
.cb3-phone-list{display:flex;flex-direction:column;border:1px solid #d6dde4;border-radius:12px;background:#fff;overflow:hidden}
.cb3-phone-list button{display:flex;align-items:center;gap:8px;width:100%;padding:9px 11px;border:none;border-top:1px solid #e6eaee;background:none;color:#0e2030;
  text-align:left;font-family:inherit;cursor:pointer}
.cb3-phone-list button:first-child{border-top:none}
.cb3-phone-list button:hover{background:#f3f6f9}
.cb3-phone-list .nm{flex:1;min-width:0}
.cb3-phone-list .nm b{display:block;font-size:13.5px;font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cb3-phone-list .nm small{display:block;font-size:11px;color:#6a7a8a;font-weight:600}
.cb3-phone-list .d{flex:0 0 auto;font-size:12px;font-weight:800;color:#4a5866}
.cb3-phone-empty{padding:16px;text-align:center;font-size:12.5px;color:#6a7a8a;font-weight:700}
.cb3-phone-card{border:1px solid #d6dde4;border-radius:14px;background:#fff;padding:12px;margin-bottom:8px}
.cb3-phone-card h4{margin:0;font-size:16px;font-weight:800;line-height:1.3}
.cb3-phone-card .sub{font-size:11.5px;color:#6a7a8a;font-weight:700;margin-top:2px}
.cb3-phone-card .sum{display:flex;align-items:baseline;gap:8px;margin-top:10px;flex-wrap:wrap}
.cb3-phone-card .sum b{font-size:22px;font-weight:800}
.cb3-phone-card .sum span{font-size:13px;font-weight:700;color:#4a5866}
.cb3-phone-tag{display:inline-block;padding:2px 8px;border-radius:7px;border:1px solid #e3b37a;color:#a35a12;background:#fff7ee;font-size:11px;font-weight:800}
.cb3-phone-map{display:block;width:100%;border-radius:12px;border:1px solid #d6dde4;margin-bottom:8px;background:#eef1f4}
.cb3-phone-acts{display:flex;gap:8px;margin-top:4px}
.cb3-phone-acts button{flex:1;height:40px;border-radius:20px;border:1px solid #cfd6de;background:#fff;color:#0e2030;font-size:13.5px;font-weight:800;font-family:inherit;cursor:pointer}
.cb3-phone-acts button.pri{background:var(--cb3-accent,#1a8ef0);border-color:var(--cb3-accent,#1a8ef0);color:#fff}
.cb3-phone-next{display:flex;align-items:center;gap:12px}
.cb3-phone-next svg{flex:0 0 auto;width:44px;height:44px;color:var(--cb3-accent,#1a8ef0)}
.cb3-phone-next .tx{min-width:0}
.cb3-phone-next .tx b{display:block;font-size:24px;font-weight:800;line-height:1.1}
.cb3-phone-next .tx span{display:block;font-size:14px;font-weight:800;margin-top:2px}
.cb3-phone-then{margin-top:8px;padding-top:8px;border-top:1px solid #e6eaee;font-size:12px;font-weight:700;color:#4a5866;display:flex;align-items:center;gap:6px}
.cb3-phone-then svg{width:18px;height:18px;color:#4a5866}
.cb3-phone-left{font-size:12.5px;font-weight:800;color:#4a5866;margin-top:8px}
.cb3-phone.mini .cb3-phone-body{padding:2px 8px 9px;overflow:hidden}
.cb3-phone.mini .cb3-phone-next{gap:8px}
.cb3-phone.mini .cb3-phone-next svg{width:30px;height:30px}
.cb3-phone.mini .cb3-phone-next .tx b{font-size:17px}
.cb3-phone.mini .cb3-phone-next .tx span{font-size:11.5px}
.cb3-phone.mini .cb3-phone-left{font-size:10.5px;margin-top:5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cb3-phone-app{display:flex;align-items:center;gap:8px;font-size:12.5px;font-weight:800}
.cb3-phone-app i{width:26px;height:26px;border-radius:8px;background:var(--cb3-accent,#1a8ef0);display:flex;align-items:center;justify-content:center;color:#fff;flex:0 0 auto}
.cb3-phone-hint{font-size:10.5px;font-weight:700;color:#6a7a8a;margin-top:6px;line-height:1.4}
.cb3-phone-ok{display:flex;flex-direction:column;align-items:center;text-align:center;padding:18px 8px 8px;gap:6px}
.cb3-phone-ok svg{width:46px;height:46px;color:#1f9d5c}
.cb3-phone-ok b{font-size:17px;font-weight:800}
.cb3-phone-ok span{font-size:13px;font-weight:700;color:#4a5866}
/* 目的地の名前の札（光の柱の上。位置は毎フレーム CampusMap3D が決める） */
.cb3-guide-tag{position:absolute;left:0;top:0;padding:4px 10px;border-radius:10px;background:rgba(14,32,48,.82);color:#fff;font-size:12px;font-weight:800;white-space:nowrap;
  pointer-events:none;z-index:3;display:none;box-shadow:0 4px 12px -6px rgba(0,0,0,.5)}
.cb3-guide-tag b{margin-left:6px;color:#9fd2ff}
`;

// 曲がり角などの絵（線の絵。色は文字の色）
const ARROW = {
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
function PhoneMap({ walkRef, geom, route, dest, fit, height, accent }) {
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
      const W = cv.clientWidth || 260;
      const H = height;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) {
        cv.width = Math.round(W * dpr);
        cv.height = Math.round(H * dpr);
      }
      const g = cv.getContext("2d");
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.fillStyle = "#eef1f4";
      g.fillRect(0, 0, W, H);
      const pts = typeof route === "function" ? route() : route;
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
        k = Math.min(3, (W - 36) / Math.max(20, x1 - x0), (H - 36) / Math.max(20, y1 - y0));
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
  }, [walkRef, geom, route, dest, fit, height, accent]);
  return <canvas ref={ref} className="cb3-phone-map" style={{ height }} />;
}

// 次の案内のカード（小さいスマホと大きいスマホ）
function NextCard({ guide, mini }) {
  const n = guide.next;
  return (
    <>
      <div className="cb3-phone-next">
        <Icon k={keyOf(n)} />
        <div className="tx">
          <b>{n ? fmtDist(n.dist) : ""}</b>
          <span>{textOf(n)}</span>
        </div>
      </div>
      {!mini && n?.then && (
        <div className="cb3-phone-then">
          {t("phone.then")}
          <Icon k={keyOf(n.then)} />
          {textOf(n.then)}
        </div>
      )}
      <div className="cb3-phone-left">{t("phone.to", { name: guide.dest.label })} {t("navi.remaining", { dist: fmtDist(guide.left), min: guide.minutes })}</div>
    </>
  );
}

/**
 * props：inv（持ち物。選んでいる物がスマホなら小さく出す）・open（大きく開いている）・guide（案内の値。null は案内していない）・
 * spots（行き先にできるスポット）・walkRef・data・features（小さな地図）・guideRef（案内の形。地図に経路を描く）・accent・touch・
 * onPlan(id) → 経路の下見 { coords, distance, minutes, hasStairs } か null・onStart(id)・onStop()・onOpen()・onClose()
 */
export function MapPhone({ inv, open, guide, spots, walkRef, data, features, guideRef, accent, touch, onPlan, onStart, onStop, onOpen, onClose }) {
  const held = inv?.slots[inv.sel]?.id === "phone";
  const [q, setQ] = useState("");
  const [cat, setCat] = useState(null);
  const [pick, setPick] = useState(null); // 下見している行き先 { spot, plan }
  const [browse, setBrowse] = useState(false); // 案内中に行き先を選び直している
  const [, setTick] = useState(0);
  const geom = useMemo(() => mapGeom(data, features), [data, features]);
  // 時計（世界の時計）と、開いているあいだの現在地・距離（2 秒ごと）
  useEffect(() => {
    if (!held && !open) return undefined;
    const id = setInterval(() => setTick((v) => v + 1), open ? 2000 : 15000);
    return () => clearInterval(id);
  }, [held, open]);
  // 閉じたら下見・探すのをやめる
  useEffect(() => {
    if (open) return;
    setPick(null);
    setBrowse(false);
  }, [open]);
  const w = walkRef.current;
  const here = w ? [w.x, w.y] : null;
  const withD = useMemo(() => (spots || []).map((s) => ({ s, xy: toXY([s.lng, s.lat]) })), [spots]);
  const near = here ? withD.reduce((b, o) => { const d = Math.hypot(o.xy[0] - here[0], o.xy[1] - here[1]); return !b || d < b.d ? { s: o.s, d } : b; }, null) : null;
  const cats = useMemo(() => SPOT_CATS.filter((c) => (spots || []).some((s) => s.cat === c.id)), [spots]);
  // 地図に描く経路：下見はその経路、案内中は帯の線（4 点に 1 点）
  const routeXY = useMemo(() => (pick?.plan ? pick.plan.coords.map((c) => toXY([c.lng, c.lat])) : null), [pick]);
  const guidePts = useCallback(() => {
    const G = guideRef.current?.G;
    if (!G) return null;
    const out = [];
    for (let i = 0; i < G.pts.length; i += 4) out.push(G.pts[i]);
    out.push(G.pts[G.pts.length - 1]);
    return out;
  }, [guideRef]);
  if (!inv) return null;
  if (!held && !open) return <style>{CSS}</style>; // 目的地の名前の札（cb3-guide-tag）の形は、スマホを持っていなくても

  // 小さいスマホ（持っているだけ）：案内中は次の曲がり角、でなければ「開いて行き先を選ぶ」
  if (!open) {
    return (
      <>
        <style>{CSS}</style>
        <div className="cb3-phone mini" role="button" tabIndex={-1} aria-label={t("nav.navigation")} onClick={onOpen}>
          <div className="cb3-phone-scr">
            <div className="cb3-phone-st"><span>{clock()}</span><span>GPS<i /></span></div>
            <div className="cb3-phone-body">
              {guide?.arrived ? (
                <div className="cb3-phone-next"><Icon k="arrive" /><div className="tx"><span>{t("navi.arrived")}</span><span style={{ fontWeight: 700, color: "#4a5866" }}>{guide.dest.label}</span></div></div>
              ) : guide ? (
                <NextCard guide={guide} mini />
              ) : (
                <>
                  <div className="cb3-phone-app"><i><Icon k="arrive" width="16" height="16" /></i>{t("nav.navigation")}</div>
                  <div className="cb3-phone-hint">{t("phone.hint")}{touch ? "" : `（${t("inv.useKey")}）`}</div>
                </>
              )}
            </div>
          </div>
        </div>
      </>
    );
  }

  // 探すとき：名前が打った字で始まるもの → 建物・施設（ベンチ・駐輪場・自販機などの屋外のスポットはあと）→ 近い順
  const ql = q.trim().toLowerCase();
  const rank = (s) => (!ql ? 0 : (s.label.toLowerCase().startsWith(ql) || (s.short || "").toLowerCase().startsWith(ql) ? 0 : 2) + (s.cat === "outdoor" || s.cat === "smoking" ? 1 : 0));
  const list = !here
    ? []
    : withD
        .filter(({ s }) => (!cat || s.cat === cat) && (!ql || `${s.label} ${s.short || ""} ${s.id}`.toLowerCase().includes(ql)))
        .map((o) => ({ ...o, d: Math.hypot(o.xy[0] - here[0], o.xy[1] - here[1]), r: rank(o.s) }))
        .sort((a, b) => a.r - b.r || a.d - b.d)
        .slice(0, 80);
  const choose = (s) => setPick({ spot: s, plan: onPlan(s.id) });
  const keyDown = (e) => {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      if (pick) setPick(null);
      else onClose();
    } else if (e.key === "Enter" && e.target?.tagName === "INPUT" && list[0]) {
      e.preventDefault();
      choose(list[0].s);
    }
  };
  const showGuide = guide && !pick && !browse;
  return (
    <>
      <style>{CSS}</style>
      <div className="cb3-phone" role="dialog" aria-label={t("nav.navigation")} onKeyDown={keyDown}>
        <div className="cb3-phone-scr">
          <div className="cb3-phone-st"><span>{clock()}</span><span>GPS<i /></span></div>
          <div className="cb3-phone-bar">
            {(pick || browse) && <button type="button" aria-label={t("phone.back")} onClick={() => (pick ? setPick(null) : setBrowse(false))}>‹</button>}
            <b>{t("nav.navigation")}</b>
            <button type="button" aria-label={t("inv.close")} onClick={onClose}>×</button>
          </div>
          <div className="cb3-phone-body">
            {showGuide ? (
              guide.arrived ? (
                <div className="cb3-phone-card">
                  <div className="cb3-phone-ok"><Icon k="arrive" /><b>{t("navi.arrived")}</b><span>{guide.dest.label}</span></div>
                  <div className="cb3-phone-acts"><button type="button" className="pri" onClick={onStop}>{t("phone.done")}</button></div>
                </div>
              ) : (
                <>
                  <div className="cb3-phone-card"><NextCard guide={guide} /></div>
                  <PhoneMap walkRef={walkRef} geom={geom} route={guidePts} dest={guideRef.current?.G?.end} height={150} accent={accent} />
                  <div className="cb3-phone-acts">
                    <button type="button" onClick={() => setBrowse(true)}>{t("phone.change")}</button>
                    <button type="button" className="pri" onClick={onStop}>{t("navi.stopGuiding")}</button>
                  </div>
                </>
              )
            ) : pick ? (
              <>
                <div className="cb3-phone-card">
                  <h4>{pick.spot.label}</h4>
                  <div className="sub">{SPOT_CATS.find((c) => c.id === pick.spot.cat)?.label || ""}</div>
                  {pick.plan ? (
                    <div className="sum">
                      <b>{t("navi.aboutMin", { n: pick.plan.minutes })}</b>
                      <span>{fmtDist(pick.plan.distance)}</span>
                      {pick.plan.hasStairs && <span className="cb3-phone-tag">{t("navi.hasStairs")}</span>}
                    </div>
                  ) : (
                    <div className="sub" style={{ marginTop: 10 }}>{t("navi.noRoute")}</div>
                  )}
                </div>
                {routeXY && <PhoneMap walkRef={walkRef} geom={geom} route={routeXY} dest={routeXY[routeXY.length - 1]} fit height={170} accent={accent} />}
                <div className="cb3-phone-acts">
                  <button type="button" onClick={() => setPick(null)}>{t("phone.back")}</button>
                  <button type="button" className="pri" disabled={!pick.plan} onClick={() => onStart(pick.spot.id)}>{t("navi.startGuiding")}</button>
                </div>
              </>
            ) : (
              <>
                <div className="cb3-phone-here">
                  {PIN}
                  <span>
                    {near && near.d < 60 ? t("phone.near", { name: near.s.label }) : t("phone.campus")}
                    <small>{t("navi.currentLocation")}・{t("phone.gps")}</small>
                  </span>
                </div>
                <input className="cb3-phone-q" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("navi.searchDest")} aria-label={t("navi.searchDest")} enterKeyHint="search" autoComplete="off" spellCheck={false} />
                <div className="cb3-phone-chips">
                  <button type="button" className={!cat ? "on" : ""} aria-pressed={!cat} onClick={() => setCat(null)}>{t("phone.all")}</button>
                  {cats.map((c) => (
                    <button type="button" key={c.id} className={cat === c.id ? "on" : ""} aria-pressed={cat === c.id} onClick={() => setCat(cat === c.id ? null : c.id)}>{c.label}</button>
                  ))}
                </div>
                {list.length ? (
                  <div className="cb3-phone-list">
                    {list.map(({ s, d }) => (
                      <button type="button" key={s.id} onClick={() => choose(s)}>
                        <span className="nm"><b>{s.label}</b><small>{SPOT_CATS.find((c) => c.id === s.cat)?.label || ""}</small></span>
                        <span className="d">{fmtDist(d)}</span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="cb3-phone-empty">{t("phone.none")}</div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
