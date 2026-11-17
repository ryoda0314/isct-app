// 歩いて見るときの乗り物（2026-11-17、campus3dVehicles.js）：乗り物のメニュー（自転車・車・ドローン。画面のまん中）と、乗っているあいだの
// 表示（速さ・ドローンの高さ・距離・電池。上のまん中）。右上はスマホ（isct-9b）、左上は地図（持ち物）なので使わない。
// 乗り物はゲームの中のもの（構想書 v0.3：現実と仮想の演出を区別する）とメニューにも書く
import { t } from "../i18n.js";

const CSS = `
.cb3-veh-menu{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:min(560px,calc(100% - 32px));max-height:calc(100% - 32px);overflow:auto;box-sizing:border-box;
  padding:14px;border-radius:16px;background:#fff;color:#14202c;border:1px solid #d5dce3;box-shadow:0 18px 40px -16px rgba(0,0,0,.55);pointer-events:auto;font-family:inherit;z-index:5}
.cb3-veh-menu h3{margin:0 0 4px;font-size:15px;font-weight:800}
.cb3-veh-menu .note{margin:0 0 12px;font-size:11.5px;line-height:1.5;color:#5a6876}
.cb3-veh-row{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}
@media (max-width:520px){.cb3-veh-row{grid-template-columns:1fr}}
.cb3-veh-card{display:flex;flex-direction:column;align-items:flex-start;gap:6px;padding:10px 11px 11px;border-radius:12px;border:1px solid #cfd7df;background:#fff;color:inherit;
  text-align:left;cursor:pointer;font-family:inherit}
.cb3-veh-card:hover{border-color:var(--cb3-accent,#2b6cb0)}
.cb3-veh-card:focus-visible{outline:2px solid var(--cb3-accent,#2b6cb0);outline-offset:2px}
.cb3-veh-card svg{width:64px;height:40px;color:#26343f}
.cb3-veh-card b{font-size:14px;font-weight:800}
.cb3-veh-card span{font-size:11px;line-height:1.5;color:#5a6876}
.cb3-veh-card em{font-style:normal;font-size:11px;font-weight:700;color:#2b5a85}
.cb3-veh-menu .row2{display:flex;justify-content:flex-end;margin-top:12px}
.cb3-veh-menu .row2 button{height:36px;padding:0 16px;border-radius:18px;border:1px solid #cfd7df;background:#fff;color:#14202c;font-size:13px;font-weight:800;cursor:pointer;font-family:inherit}
.cb3-veh-hud{position:absolute;left:50%;transform:translateX(-50%);padding:6px 12px;border-radius:12px;background:rgba(14,32,48,.82);color:#fff;font-size:13px;font-weight:800;
  white-space:nowrap;pointer-events:none;box-shadow:0 6px 16px -6px rgba(0,0,0,.5);font-variant-numeric:tabular-nums;font-family:inherit}
.cb3-veh-hud.low{background:rgba(150,40,30,.9)}
/* 細い画面（スマホ）：上はボタン・スマホでいっぱいなので、左下のスティックの上・まん中に */
@media (max-width:600px){.cb3-veh-hud{top:auto!important;bottom:calc(212px + var(--cb3-sb,env(safe-area-inset-bottom,0px)));font-size:12px;padding:5px 10px}}
/* 横にしたスマホと、縦に持って回して描くとき（.cb3-rot。幅の @media は本当の縦の幅で効く）：使い方の案内は下のまん中・ボタンは右上なので、
   表示は上のまん中（スティックの上だと画面のまん中＝照準と乗り物に重なる）。メニューは 3 枚を横に並べる（縦に積むと低い画面からはみ出す） */
@media (orientation:landscape) and (max-height:540px){.cb3-full .cb3-veh-hud{top:calc(12px + var(--cb3-st,env(safe-area-inset-top,0px)))!important;bottom:auto!important}}
.cb3-full.cb3-rot .cb3-veh-hud{top:calc(12px + var(--cb3-st,env(safe-area-inset-top,0px)))!important;bottom:auto!important}
.cb3-full.cb3-rot .cb3-veh-row{grid-template-columns:repeat(3,1fr)}
`;

// 線の絵（色は currentColor）
const ICONS = {
  bike: (
    <svg viewBox="0 0 64 40" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="14" cy="27" r="10" />
      <circle cx="50" cy="27" r="10" />
      <path d="M14 27 L26 27 L38 13 M26 27 L22 15 M19 15 L26 15 M38 13 L50 27 M38 13 L36 8 L42 8" />
      <path d="M42 12 h9 v7 h-9 z" strokeWidth="1.6" />
    </svg>
  ),
  car: (
    <svg viewBox="0 0 64 40" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 28 V21 L12 19 L20 10 H40 L50 19 L59 21 V28 Z" />
      <path d="M22 12 L17 19 H33 V12 Z M36 12 V19 H46 L40 12 Z" strokeWidth="1.6" />
      <circle cx="17" cy="29" r="5" fill="#fff" />
      <circle cx="47" cy="29" r="5" fill="#fff" />
    </svg>
  ),
  drone: (
    <svg viewBox="0 0 64 40" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="25" y="16" width="14" height="9" rx="2" />
      <path d="M25 18 L13 11 M39 18 L51 11 M25 23 L13 30 M39 23 L51 30" />
      <ellipse cx="13" cy="10" rx="9" ry="2.2" strokeWidth="1.6" />
      <ellipse cx="51" cy="10" rx="9" ry="2.2" strokeWidth="1.6" />
      <ellipse cx="13" cy="31" rx="9" ry="2.2" strokeWidth="1.6" />
      <ellipse cx="51" cy="31" rx="9" ry="2.2" strokeWidth="1.6" />
    </svg>
  ),
};

/**
 * @param menu    メニューを出しているか
 * @param parked  { bike: 距離 m | null, car: 距離 m | null }（置いてある乗り物までの距離）
 * @param riding  乗っている乗り物（"bike" | "car" | "drone" | null）
 * @param hudRef  乗っているあいだの表示（DOM。CampusMap3D が速さを書く）
 * @param hint    上に説明が出ているか（出ていれば表示をその下に）
 */
export function MapVehicles({ menu, parked, riding, hudRef, hint, onPick, onClose }) {
  return (
    <>
      <style>{CSS}</style>
      {riding && <div ref={hudRef} className="cb3-veh-hud" style={{ top: hint ? 74 : 14 }} />}
      {menu && (
        <div className="cb3-veh-menu" role="dialog" aria-label={t("veh.menuTitle")} onPointerDown={(e) => e.stopPropagation()}>
          <h3>{t("veh.menuTitle")}</h3>
          <p className="note">{t("veh.menuNote")}</p>
          <div className="cb3-veh-row">
            {["bike", "car", "drone"].map((k) => (
              <button type="button" key={k} className="cb3-veh-card" onClick={() => onPick(k)}>
                {ICONS[k]}
                <b>{t(`veh.${k}`)}</b>
                <span>{t(`veh.${k}Desc`)}</span>
                {parked?.[k] != null && parked[k] > 2 && <em>{t("veh.parked", { m: Math.round(parked[k]) })}</em>}
              </button>
            ))}
          </div>
          <div className="row2">
            <button type="button" onClick={onClose}>{t("veh.close")}</button>
          </div>
        </div>
      )}
    </>
  );
}
