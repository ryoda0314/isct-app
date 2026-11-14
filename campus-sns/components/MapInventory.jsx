// 歩いて見るときの持ち物の画面（2026-11-15、campus3dInventory.js）：下の欄（9 マス）・財布（ゲーム内のお金・IC の残高）・使うボタン・
// 自販機と券売機のメニュー・カード（学生証・IC。ゲーム内）・撮った写真・地図（持っているあいだ左上に小さな地図）・お知らせ。
// お金・カードはゲームの中のものだと画面にも書く（構想書 v0.3：現実と仮想の演出を区別する）
import { useEffect, useMemo, useRef, useState } from "react";
import { t } from "../i18n.js";
import { toXY } from "../campus3dFeatures.js";
import { CHARGES, DRINKS, IC_FARE, ITEMS, yen } from "../campus3dInventory.js";

const CSS = `
.cb3-sid{position:relative;width:100%;aspect-ratio:1.586;border-radius:12px;border:1px solid #cfd6de;background:#fff;box-sizing:border-box;margin-bottom:8px;overflow:hidden;color:#1b1f24;
  box-shadow:0 2px 6px -2px rgba(0,0,0,.18)}
.cb3-sid .hd{position:absolute;left:4%;right:4%;top:5%;display:flex;justify-content:space-between;align-items:flex-start}
.cb3-sid .mk{display:flex;align-items:center;gap:5px}
.cb3-sid .mk i{width:20px;height:20px;border-radius:5px;background:#2347a3;position:relative;display:block}
.cb3-sid .mk i:after{content:"";position:absolute;left:5px;right:5px;top:9px;bottom:4px;border-radius:2px 2px 0 0;background:#fff}
.cb3-sid .mk b{display:block;font-size:12px;letter-spacing:.02em;color:#2347a3;line-height:1}
.cb3-sid .mk small{display:block;font-size:8.5px;color:#5c6b7d;font-weight:700;margin-top:2px}
.cb3-sid .tt{text-align:right;line-height:1.1}
.cb3-sid .tt small{display:block;font-size:9px;font-weight:700;color:#1b1f24}
.cb3-sid .tt b{display:block;font-size:17px;color:#2347a3;letter-spacing:.08em}
.cb3-sid .face{position:absolute;left:4%;top:26%;width:27%;height:40%;border-radius:4px;background:#e9eef5;display:flex;align-items:flex-end;justify-content:center;overflow:hidden}
.cb3-sid .face svg{width:88%;height:96%}
.cb3-sid dl{position:absolute;left:36%;right:4%;top:25%;margin:0}
.cb3-sid dt{font-size:8.5px;font-weight:700;color:#5c6b7d;margin-top:3px}
.cb3-sid dt em{font-style:normal;font-weight:600;margin-left:3px}
.cb3-sid dd{margin:0;font-size:11.5px;font-weight:800}
.cb3-sid dd.nm{font-size:17px;margin-top:4px;letter-spacing:.06em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cb3-sid .dates{position:absolute;left:4%;top:69%;display:flex;flex-direction:column;font-size:8.5px;color:#5c6b7d;font-weight:700;line-height:1.35}
.cb3-sid .dates b{color:#1b1f24;margin-left:4px}
.cb3-sid .note{position:absolute;left:4%;right:24%;bottom:4%;font-size:8px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-weight:700;color:#5c6b7d;line-height:1.35}
.cb3-sid .stamp{position:absolute;right:5%;bottom:5%;width:44px;height:44px;border-radius:50%;border:2px solid #d2453b;color:#d2453b;display:flex;align-items:center;justify-content:center;
  font-size:10px;font-weight:800;transform:rotate(-12deg);background:rgba(255,255,255,.6)}
.cb3-card{position:relative;width:100%;aspect-ratio:1.586;border-radius:14px;overflow:hidden;border:1px solid #c9d2db;background:#fff;box-sizing:border-box;margin-bottom:8px;font-family:inherit}
.cb3-card .top{display:flex;align-items:center;justify-content:space-between;padding:9px 12px 0}
.cb3-card .mark{display:flex;align-items:center;gap:6px;font-size:11px;font-weight:800;color:#2b4a9b}
.cb3-card .mark i{width:18px;height:18px;border-radius:5px;background:#2b4a9b;display:block;position:relative}
.cb3-card .mark i:after{content:"";position:absolute;left:4px;right:4px;top:8px;bottom:4px;border-radius:2px 2px 0 0;background:#fff}
.cb3-card .ttl{text-align:right;line-height:1.15}
.cb3-card .ttl b{display:block;font-size:18px;letter-spacing:.1em;color:#2b4a9b}
.cb3-card .ttl small{font-size:9.5px;font-weight:700;color:#6a7a8a}
.cb3-card .body{display:flex;gap:12px;padding:8px 12px 0}
.cb3-card .face{flex:0 0 27%;aspect-ratio:.82;border-radius:10px;background:#e8eef6;display:flex;align-items:center;justify-content:center}
.cb3-card .face svg{width:82%;height:82%}
.cb3-card dl{margin:0;display:grid;grid-template-columns:auto 1fr;gap:2px 10px;font-size:11px;align-content:start}
.cb3-card dt{color:#6a7a8a;font-weight:700}
.cb3-card dd{margin:0;font-weight:800;color:#0e2030}
.cb3-card dd.nm{font-size:16px}
.cb3-card .foot{position:absolute;left:0;right:0;bottom:0;padding:5px 12px;background:#2b4a9b;color:#fff;font-size:10.5px;font-weight:800;text-align:center}
.cb3-card.ic{background:#e9f5ef;border-color:#b9d9c8}
.cb3-card.ic .chip{position:absolute;left:14px;top:46%;width:40px;height:30px;border-radius:6px;background:#e3c56f;border:1px solid #c7a957}
.cb3-card.ic .chip:after{content:"";position:absolute;left:12px;right:12px;top:4px;bottom:4px;border:1px solid #c7a957;border-radius:3px}
.cb3-card.ic .bal{position:absolute;right:14px;top:42%;text-align:right}
.cb3-card.ic .bal small{display:block;font-size:10.5px;font-weight:700;color:#4d6b5c}
.cb3-card.ic .bal b{font-size:26px;color:#0e2030}
.cb3-card.ic .foot{background:#2f7a57}
.cb3-inv{position:absolute;left:50%;bottom:calc(10px + env(safe-area-inset-bottom));transform:translateX(-50%);display:flex;flex-direction:column;align-items:center;gap:5px;pointer-events:none;z-index:4}
.cb3-inv-wallet{padding:3px 10px;border-radius:10px;background:rgba(14,32,48,.78);color:#fff;font-size:11.5px;font-weight:700;white-space:nowrap}
.cb3-inv-wallet small{opacity:.75;font-weight:600;margin-left:4px}
.cb3-inv-bar{display:flex;gap:3px;padding:3px;border-radius:12px;background:rgba(14,32,48,.55);pointer-events:auto}
.cb3-inv-slot{position:relative;width:36px;height:36px;border:2px solid transparent;border-radius:9px;background:rgba(255,255,255,.14);padding:0;cursor:pointer;
  display:flex;align-items:center;justify-content:center;color:#fff;touch-action:manipulation}
.cb3-inv-slot.on{border-color:#fff;background:rgba(255,255,255,.3)}
.cb3-inv-slot svg{width:24px;height:24px}
@media (min-width:600px){.cb3-inv-slot{width:42px;height:42px}.cb3-inv-slot svg{width:27px;height:27px}}
.cb3-inv-n{position:absolute;right:2px;bottom:0;font-size:10.5px;font-weight:800;color:#fff;text-shadow:0 1px 2px rgba(0,0,0,.7)}
.cb3-inv-k{position:absolute;left:3px;top:1px;font-size:9px;font-weight:700;color:rgba(255,255,255,.7)}
/* スマホの縦：欄は画面の下いっぱい、スティックとボタンはその上へ */
.cb3-full .cb3-inv-on .cb3-joy{bottom:calc(84px + env(safe-area-inset-bottom))}
.cb3-full .cb3-inv-on .cb3-walk-btns{bottom:calc(84px + env(safe-area-inset-bottom))}
@media (orientation:landscape) and (max-height:540px){
  .cb3-full .cb3-inv-on .cb3-joy{bottom:calc(24px + env(safe-area-inset-bottom))}
  .cb3-full .cb3-inv-on .cb3-walk-btns{bottom:auto}
  .cb3-full .cb3-inv-slot{width:38px;height:38px}
}
.cb3-inv-modal{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.35);pointer-events:auto;z-index:6;padding:16px;box-sizing:border-box}
.cb3-inv-box{width:min(340px,100%);max-height:100%;overflow:auto;border-radius:14px;background:#fff;color:#0e2030;padding:14px;box-sizing:border-box;border:1px solid #d6dde4;
  box-shadow:0 10px 30px -10px rgba(0,0,0,.5);font-family:inherit}
.cb3-inv-box h3{margin:0 0 4px;font-size:15px}
.cb3-inv-box p{margin:0 0 10px;font-size:12px;line-height:1.5;color:#4a5866}
.cb3-inv-row{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:8px 0;border-top:1px solid #e6eaee;font-size:13.5px;font-weight:700}
.cb3-inv-row span{display:flex;align-items:center;gap:8px}
.cb3-inv-row svg{width:22px;height:22px;color:#0e2030}
.cb3-inv-box button{height:36px;padding:0 14px;border:1px solid #c9d2db;border-radius:18px;background:#fff;color:#0e2030;font-size:13px;font-weight:800;font-family:inherit;cursor:pointer}
.cb3-inv-box button.pri{background:#0e2030;color:#fff;border-color:#0e2030}
.cb3-inv-box button:disabled{opacity:.4;cursor:default}
.cb3-inv-acts{display:flex;justify-content:flex-end;gap:8px;margin-top:10px;flex-wrap:wrap}
.cb3-inv-card{border-radius:12px;border:1px solid #c9d2db;padding:12px;margin:2px 0 8px;background:#f7f9fb}
.cb3-inv-card .hd{display:flex;justify-content:space-between;align-items:center;font-size:12px;font-weight:800;color:#4a5866}
.cb3-inv-card .big{font-size:22px;font-weight:800;margin:14px 0 4px}
.cb3-inv-card .tag{display:inline-block;padding:1px 7px;border-radius:7px;border:1px solid #c9d2db;font-size:10.5px;font-weight:700;color:#4a5866;background:#fff}
.cb3-inv-photo{width:100%;border-radius:10px;border:1px solid #d6dde4;display:block}
.cb3-inv-toast{position:absolute;left:50%;top:calc(58px + env(safe-area-inset-top));transform:translateX(-50%);padding:7px 14px;border-radius:14px;background:rgba(14,32,48,.86);color:#fff;
  font-size:12.5px;font-weight:700;white-space:nowrap;max-width:calc(100% - 32px);overflow:hidden;text-overflow:ellipsis;pointer-events:none;z-index:5}
.cb3-inv-map{position:absolute;left:calc(10px + env(safe-area-inset-left));top:calc(52px + env(safe-area-inset-top));border-radius:12px;border:1px solid rgba(14,32,48,.35);
  background:#eef1f4;overflow:hidden;pointer-events:auto;cursor:pointer;z-index:4;box-shadow:0 6px 16px -8px rgba(0,0,0,.5)}
.cb3-inv-map canvas{display:block}
`;

// 物の絵（線の絵。色は文字の色）
const ICONS = {
  camera: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"><path d="M4 8h3.5l1.5-2.2h6L16.5 8H20v11H4z" /><circle cx="12" cy="13.2" r="3.6" /></svg>,
  map: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"><path d="M3.5 6.5 9 4.5l6 2 5.5-2v13L15 19.5l-6-2-5.5 2z" /><path d="M9 4.5v13M15 6.5v13" /></svg>,
  student: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"><rect x="3" y="5.5" width="18" height="13" rx="2" /><circle cx="8.5" cy="11" r="2" /><path d="M5.8 16c.5-1.6 1.5-2.3 2.7-2.3s2.2.7 2.7 2.3M13.5 10h5M13.5 13h4" /></svg>,
  ic: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"><rect x="3" y="5.5" width="18" height="13" rx="2" /><rect x="6" y="9" width="4.5" height="3.8" rx=".6" /><path d="M14 9.5c1.2 1 1.2 3 0 4M16.4 8.2c2 1.8 2 4.8 0 6.6" /></svg>,
  tea: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"><path d="M10 3h4v2.5l1.5 2V20a1 1 0 0 1-1 1h-5a1 1 0 0 1-1-1V7.5l1.5-2z" /><path d="M8.5 11h7M8.5 16h7" /></svg>,
  water: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"><path d="M10.2 3h3.6v2l1.8 2.5V20a1 1 0 0 1-1 1H9.4a1 1 0 0 1-1-1V7.5L10.2 5z" /><path d="M10.5 14.5c.4 1.1 1.4 1.6 2.4 1.3" /></svg>,
  coffee: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"><path d="M6 8h10l-1.2 12H7.2z" /><path d="M5 5.5h12V8H5zM16 11h1.6a2 2 0 0 1 0 4H15.6" /></svg>,
};


// デフォルメの顔（丸い頭・点の目・にこにこ）
const FACE = (
  <svg viewBox="0 0 64 78" aria-hidden="true">
    <path d="M10 78c0-14 10-22 22-22s22 8 22 22z" fill="#2b4a9b" />
    <circle cx="32" cy="32" r="21" fill="#ffe0c2" />
    <path d="M12 28c2-13 11-19 20-19s19 6 21 19c-6-6-13-8-21-8s-14 2-20 8z" fill="#3a3330" />
    <circle cx="24.5" cy="34" r="2.6" fill="#3a3330" />
    <circle cx="39.5" cy="34" r="2.6" fill="#3a3330" />
    <path d="M26 42.5c3.6 3.2 8.4 3.2 12 0" fill="none" stroke="#3a3330" strokeWidth="2.2" strokeLinecap="round" />
    <circle cx="19.5" cy="40" r="3" fill="#ffb3a6" opacity=".7" />
    <circle cx="44.5" cy="40" r="3" fill="#ffb3a6" opacity=".7" />
  </svg>
);

// 学生証（ゲーム内のデフォルメ。2026-11-15 ユーザー「デフォルメして似せる」「色合いとか配置とか」）：今の学生証の色合い（白い面・青い字）と
// 配置（左上にマーク・右上に二段の見出し・左に顔・右に項目・左下に発行日と有効期限・右下の印の位置）に寄せる。大学のマーク・ロゴ・学長印・
// 証明の文・大学名の発行者表示は入れない（偽の学生証にならないように）。マークはオリジナル、右下は丸い「ゲーム内」のはんこと注意書き。
// 名前は自分で入れられる（端末の中だけ）
function StudentCard({ inv, onRename }) {
  const [edit, setEdit] = useState(false);
  const [name, setName] = useState(inv.name || "");
  return (
    <>
      <div className="cb3-sid" role="img" aria-label={t("inv.student")}>
        <div className="hd">
          <span className="mk"><i /><span><b>3D CAMPUS</b><small>{t("inv.inGame")}</small></span></span>
          <span className="tt"><small>Student ID Card</small><b>{t("inv.cardTitle")}</b></span>
        </div>
        <div className="face">{FACE}</div>
        <dl>
          <dt>{t("inv.cardNo")} <em>Student ID</em></dt><dd>{inv.sid}</dd>
          <dt>{t("inv.cardCourse")} <em>Course</em></dt><dd>{t("inv.cardCourseVal")}</dd>
          <dd className="nm">{inv.name || t("inv.cardName")}</dd>
        </dl>
        <div className="dates">
          <span>Date of Issue <b>{inv.issued}</b></span>
          <span>Exp. Date <b>{t("inv.cardExpVal")}</b></span>
        </div>
        <div className="note">{t("inv.cardFoot")}</div>
        <div className="stamp">{t("inv.inGame")}</div>
      </div>
      {edit ? (
        <div className="cb3-inv-acts">
          <input value={name} maxLength={16} onChange={(e) => setName(e.target.value)} placeholder={t("inv.cardName")} aria-label={t("inv.cardNameLabel")}
            style={{ flex: 1, minWidth: 0, height: 34, border: "1px solid #c9d2db", borderRadius: 10, padding: "0 10px", fontSize: 14, fontFamily: "inherit" }} />
          <button type="button" className="pri" onClick={() => { onRename?.(name.trim().slice(0, 16)); setEdit(false); }}>{t("inv.save")}</button>
        </div>
      ) : (
        <div className="cb3-inv-acts"><button type="button" onClick={() => setEdit(true)}>{t("inv.rename")}</button></div>
      )}
      <p>{t("inv.notReal")}</p>
    </>
  );
}

// IC カード（ゲーム内。駅のカードの会社のマークは入れない）
function IcCard({ inv }) {
  return (
    <>
      <div className="cb3-card ic" role="img" aria-label={t("inv.ic")}>
        <div className="top">
          <span className="mark" style={{ color: "#2f7a57" }}>{t("inv.ic")}</span>
          <span className="ttl"><small>{t("inv.inGame")}</small></span>
        </div>
        <div className="chip" />
        <div className="bal"><small>{t("inv.icBalance")}</small><b>{yen(inv.ic)}</b> {t("inv.yen")}</div>
        <div className="foot">{t("inv.cardFoot")}</div>
      </div>
      <p>{t("inv.icNote", { fare: IC_FARE })}</p>
    </>
  );
}

// 小さな地図の形（地図の建物・緑・道・線路と、手で足した建物。平面 m）
function mapGeom(data, features) {
  const ring = (p) => p.map(([lat, lng]) => toXY([lng, lat]));
  const line = (p) => p.map(([lat, lng]) => toXY([lng, lat]));
  const streets = [];
  for (const k of Object.keys(data?.streets || {})) for (const l of data.streets[k] || []) streets.push({ w: k === "major" ? 6 : 3.5, p: line(l) });
  const rail = [];
  for (const k of Object.keys(data?.rail || {})) for (const l of data.rail[k] || []) rail.push(line(l));
  return {
    green: (data?.green || []).map((g) => ring(g.p || g)),
    water: (data?.water || []).map(ring),
    buildings: (data?.buildings || []).map((b) => ring(b.p || b)),
    own: (features || []).filter((f) => f.type === "building" && f.coords?.length >= 3 && !(f.base > 0 && f.height < 3)).map((f) => f.coords.map(toXY)),
    streets,
    rail,
  };
}

function MiniMap({ walkRef, data, features, accent }) {
  const ref = useRef(null);
  const [big, setBig] = useState(false);
  const geom = useMemo(() => mapGeom(data, features), [data, features]);
  const S = big ? 260 : 150;
  useEffect(() => {
    let raf = 0;
    let last = 0;
    const draw = (now) => {
      raf = requestAnimationFrame(draw);
      if (now - last < 90) return;
      last = now;
      const cv = ref.current;
      const w = walkRef.current;
      if (!cv || !w) return;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      if (cv.width !== S * dpr) {
        cv.width = S * dpr;
        cv.height = S * dpr;
      }
      const g = cv.getContext("2d");
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.fillStyle = "#eef1f4";
      g.fillRect(0, 0, S, S);
      const k = big ? 1.1 : 1.0; // 1m が何 px か（北が上）
      const X = (p) => S / 2 + (p[0] - w.x) * k;
      const Y = (p) => S / 2 - (p[1] - w.y) * k;
      const R = (S / 2 / k) * 1.5;
      const near = (pts) => pts.some((p) => Math.abs(p[0] - w.x) < R && Math.abs(p[1] - w.y) < R);
      const poly = (pts, fill) => {
        if (!near(pts)) return;
        g.beginPath();
        pts.forEach((p, i) => (i ? g.lineTo(X(p), Y(p)) : g.moveTo(X(p), Y(p))));
        g.closePath();
        g.fillStyle = fill;
        g.fill();
      };
      const path = (pts, width, color) => {
        if (!near(pts)) return;
        g.beginPath();
        pts.forEach((p, i) => (i ? g.lineTo(X(p), Y(p)) : g.moveTo(X(p), Y(p))));
        g.lineWidth = width;
        g.strokeStyle = color;
        g.lineJoin = "round";
        g.lineCap = "round";
        g.stroke();
      };
      geom.green.forEach((p) => poly(p, "#d3e6c8"));
      geom.water.forEach((p) => poly(p, "#c5dcec"));
      geom.streets.forEach((s) => path(s.p, s.w * k, "#ffffff"));
      geom.rail.forEach((p) => path(p, 2, "#8a9098"));
      geom.buildings.forEach((p) => poly(p, "#c3c9d0"));
      geom.own.forEach((p) => poly(p, "#aeb6bf"));
      // 自分（向きの三角）と北
      const b = ((w.yaw || 0) * Math.PI) / 180;
      g.save();
      g.translate(S / 2, S / 2);
      g.rotate(b);
      g.beginPath();
      g.moveTo(0, -9);
      g.lineTo(6, 6);
      g.lineTo(0, 3);
      g.lineTo(-6, 6);
      g.closePath();
      g.fillStyle = accent || "#28c868";
      g.strokeStyle = "#fff";
      g.lineWidth = 1.5;
      g.fill();
      g.stroke();
      g.restore();
      g.fillStyle = "#0e2030";
      g.font = "800 11px sans-serif";
      g.textAlign = "center";
      g.fillText("N", S / 2, 13);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [walkRef, geom, S, big, accent]);
  return (
    <div className="cb3-inv-map" style={{ width: S, height: S }} onClick={() => setBig((v) => !v)} title={t("inv.mapHint")}>
      <canvas ref={ref} style={{ width: S, height: S }} />
    </div>
  );
}

export function MapInventory({ inv, touch, menu, toast, walkRef, data, features, accent, onSelect, onUse, onCloseMenu, onBuy, onCharge, onRename }) {
  if (!inv) return null;
  const sel = inv.slots[inv.sel];
  return (
    <>
      <style>{CSS}</style>
      {sel?.id === "map" && <MiniMap walkRef={walkRef} data={data} features={features} accent={accent} />}
      <div className="cb3-inv">
        <div className="cb3-inv-wallet">
          {t("inv.money")} {yen(inv.money)}{t("inv.yen")} ・ IC {yen(inv.ic)}{t("inv.yen")}
          <small>{t("inv.inGame")}</small>
        </div>
        <div className="cb3-inv-bar" role="toolbar" aria-label={t("inv.title")}>
          {inv.slots.map((s, i) => (
            <button key={i} type="button" className={`cb3-inv-slot${i === inv.sel ? " on" : ""}`} aria-label={s ? t(ITEMS[s.id].name) : t("inv.empty")} aria-pressed={i === inv.sel} onClick={() => onSelect(i)}>
              {!touch && <span className="cb3-inv-k">{i + 1}</span>}
              {s && ICONS[s.id]}
              {s && s.n > 1 && <span className="cb3-inv-n">{s.n}</span>}
            </button>
          ))}
        </div>
      </div>
      {toast && <div className="cb3-inv-toast">{toast}</div>}
      {menu && (
        <div className="cb3-inv-modal" onClick={(e) => e.target === e.currentTarget && onCloseMenu()}>
          <div className="cb3-inv-box" role="dialog" aria-modal="true">
            {menu.kind === "vend" && (
              <>
                <h3>{t("inv.vendTitle")}</h3>
                <p>{t("inv.vendNote")}</p>
                {DRINKS.map((id) => (
                  <div className="cb3-inv-row" key={id}>
                    <span>{ICONS[id]}{t(ITEMS[id].name)}</span>
                    <button type="button" className="pri" disabled={inv.money < ITEMS[id].price} onClick={() => onBuy(id)}>{yen(ITEMS[id].price)}{t("inv.yen")}</button>
                  </div>
                ))}
                <div className="cb3-inv-row"><span>{t("inv.money")}</span><span>{yen(inv.money)}{t("inv.yen")}</span></div>
              </>
            )}
            {menu.kind === "tvm" && (
              <>
                <h3>{t("inv.tvmTitle")}</h3>
                <p>{t("inv.tvmNote", { fare: IC_FARE })}</p>
                <div className="cb3-inv-row"><span>{ICONS.ic}{t("inv.icBalance")}</span><span>{yen(inv.ic)}{t("inv.yen")}</span></div>
                <div className="cb3-inv-row"><span>{t("inv.money")}</span><span>{yen(inv.money)}{t("inv.yen")}</span></div>
                <div className="cb3-inv-acts">
                  {CHARGES.map((a) => (
                    <button key={a} type="button" className="pri" disabled={inv.money < a || !inv.slots.some((s) => s?.id === "ic")} onClick={() => onCharge(a)}>{t("inv.charge", { a: yen(a) })}</button>
                  ))}
                </div>
              </>
            )}
            {menu.kind === "card" && (menu.id === "ic" ? <IcCard inv={inv} /> : <StudentCard inv={inv} onRename={onRename} />)}
            {menu.kind === "photo" && (
              <>
                <h3>{t("inv.photoTitle")}</h3>
                <img className="cb3-inv-photo" src={menu.url} alt={t("inv.photoTitle")} />
                <div className="cb3-inv-acts">
                  {menu.file && typeof navigator !== "undefined" && navigator.canShare?.({ files: [menu.file] }) && (
                    <button type="button" onClick={() => navigator.share({ files: [menu.file] }).catch(() => {})}>{t("inv.share")}</button>
                  )}
                  <a href={menu.url} download={menu.name}><button type="button" className="pri">{t("inv.save")}</button></a>
                </div>
              </>
            )}
            <div className="cb3-inv-acts">
              <button type="button" onClick={onCloseMenu}>{t("inv.close")}</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// 使うボタンの名前（選んでいる物。なければ null）
export function itemUseLabel(inv) {
  const s = inv?.slots[inv.sel];
  const u = s ? ITEMS[s.id]?.use : null;
  return u ? t(u) : null;
}
