import { useEffect, useRef } from "react";
import { t } from "../i18n.js";
import { VEHICLE_KINDS } from "../campus3dVehicles.js";
import { preloadCoupe } from "../campus3dCoupeRenderer.js";

const CSS = `
.cb3-veh-backdrop{position:absolute;inset:0;display:grid;place-items:center;padding:12px;box-sizing:border-box;z-index:12;pointer-events:auto;background:rgba(8,16,22,.54);font-family:inherit}
.cb3-veh-menu{width:min(634px,100%);max-height:100%;box-sizing:border-box;overflow:auto;border:1px solid #526069;border-radius:16px;padding:18px;background:#192329;color:#f6f4ee;box-shadow:0 24px 70px #051017a6;overscroll-behavior:contain}
.cb3-veh-menu header{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:0 0 13px}
.cb3-veh-menu h3{font-family:inherit;font-size:22px;line-height:1.2;font-weight:800;margin:0;color:inherit;letter-spacing:.025em}
.cb3-veh-credit{display:block;width:fit-content;margin:8px 1px 0 auto;font-size:10px;color:#b7c6cd;text-underline-offset:2px}
.cb3-veh-close{color:#eef3f3;border:1px solid #536068;background:transparent;cursor:pointer;width:34px;height:34px;border-radius:50%;font:22px/1 system-ui}
.cb3-veh-row{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
.cb3-veh-card{--ink:#ffc883;display:flex;position:relative;flex-direction:column;align-items:stretch;min-width:0;padding:0;overflow:hidden;color:#f7f4ee;background:#263238;border:1px solid #4b595f;border-radius:10px;text-align:left;font-family:inherit;cursor:pointer}
.cb3-veh-card[data-kind="jet"]{--ink:#8ddde5}
.cb3-veh-card:hover,.cb3-veh-card:focus-visible{border-color:var(--ink);box-shadow:inset 0 0 0 1px var(--ink);outline:none}
.cb3-veh-stage{position:relative;display:grid;grid-template:minmax(0,1fr)/minmax(0,1fr);place-items:center;height:112px;background:radial-gradient(ellipse at 50% 100%,#927156 0%,#554d47 41%,#3b3937 90%);overflow:hidden}
.cb3-veh-stage img{display:block;min-height:0;min-width:0;height:100%;width:100%;padding:3px;box-sizing:border-box;object-fit:contain;filter:drop-shadow(0 5px 4px #0e131875);transition:transform .18s ease}
.cb3-veh-card:hover img,.cb3-veh-card:focus-visible img{transform:scale(1.045)}
.cb3-veh-card[data-kind="jet"] .cb3-veh-stage{background:radial-gradient(ellipse at 50% 100%,#6d8d98,#455761 58%,#37434b)}
.cb3-veh-copy{display:grid;grid-template-columns:1fr auto;column-gap:6px;align-items:center;padding:10px 12px 11px}
.cb3-veh-copy b{font-size:16px;line-height:1.3;letter-spacing:.02em}
.cb3-veh-copy small,.cb3-veh-copy em{grid-column:1/-1;font:inherit;font-size:11.5px;line-height:1.45;color:#c0ccce;margin-top:3px}
.cb3-veh-copy em{color:var(--ink)}
.cb3-veh-arrow{color:var(--ink);font:21px/1 system-ui}
.cb3-veh-card.compact{--ink:#cbddd5;flex-direction:row;align-items:center}
.cb3-veh-card.compact .cb3-veh-stage{width:34%;min-width:68px;height:82px;align-self:stretch;background:radial-gradient(ellipse at bottom,#53655f,#303f41)}
.cb3-veh-card.compact .cb3-veh-copy{flex:1;min-width:0;padding:7px 9px}
.cb3-veh-card.compact b{font-size:14px}
.cb3-veh-card.compact small{font-size:10.5px}
.cb3-veh-hud{position:absolute;left:50%;transform:translateX(-50%);border-radius:12px;padding:6px 12px;background:rgba(14,32,48,.85);color:#fff;font:700 13px/1.3 system-ui;white-space:nowrap;pointer-events:none;font-variant-numeric:tabular-nums}
.cb3-veh-hud.low{background:#972d27}
.cb3-veh-meter{--tone:#ffae62;--engine-level:0%;position:absolute;left:18px;bottom:23px;padding:9px 12px 8px;width:170px;box-sizing:border-box;color:#f8faf8;border:1px solid #a9b8b650;border-radius:9px;background:linear-gradient(115deg,#111c22ed,#23333bec);box-shadow:0 6px 20px #0b141a3b;font-family:inherit;pointer-events:none;font-variant-numeric:tabular-nums}
.cb3-veh-meter.jet{--tone:#8ddde5}.cb3-veh-meter.impact{border-color:#ff7656}
.cb3-veh-speedline,.cb3-veh-meta{display:flex;align-items:baseline;justify-content:space-between;gap:6px}
.cb3-veh-speedline strong{font:800 31px/.96 system-ui;letter-spacing:-.055em;font-variant-numeric:tabular-nums}
.cb3-veh-speedline small{font:600 11px system-ui;color:#cad4d8;margin-left:5px}
.cb3-veh-drive{border:1px solid #9da9a74d;border-radius:4px;color:var(--tone);font:700 11px/1.4 system-ui;padding:1px 5px}
.cb3-veh-power{height:3px;margin:8px 0 5px;background:#637178;border-radius:2px;overflow:hidden}
.cb3-veh-power i{display:block;height:100%;width:var(--engine-level);background:var(--tone)}
.cb3-veh-meta{font-size:10px;font-weight:650;color:#dce3e3}
.cb3-full .cb3-veh-meter{left:50%;right:auto;transform:translateX(-50%);bottom:auto;top:calc(7px + var(--cb3-st,0px));width:156px;padding:6px 10px}
.cb3-full .cb3-veh-hud{top:calc(10px + var(--cb3-st,0px))!important}
.cb3-full .cb3-veh-speedline strong{font-size:24px}
.cb3-full .cb3-veh-power{margin:4px 0}
.cb3-motoring .cb3-inv{display:none}
.cb3-full .cb3-motoring .cb3-inv-toast{top:calc(108px + var(--cb3-st,0px))}
.cb3-full .cb3-motoring .cb3-jump{font-size:11px;white-space:normal;line-height:1.15}
.cb3-veh-backdrop:has(.cb3-veh-menu){container-type:size}
@container (max-height:440px){.cb3-veh-menu{padding:11px 13px}.cb3-veh-menu header{margin-bottom:7px}.cb3-veh-stage{height:77px}.cb3-veh-card.compact .cb3-veh-stage{height:64px}.cb3-veh-copy{padding:6px 9px}.cb3-veh-row{gap:6px}}
@container (max-width:440px){.cb3-veh-menu{padding:11px}.cb3-veh-stage{height:83px}.cb3-veh-card.compact{flex-direction:column;align-items:stretch}.cb3-veh-card.compact .cb3-veh-stage{width:auto;height:50px}.cb3-veh-copy b{font-size:14px}}
@media(prefers-reduced-motion:reduce){.cb3-veh-stage img{transition:none}.cb3-veh-card:hover img,.cb3-veh-card:focus-visible img{transform:none}}
`;

export function MapVehicles({ menu, parked, riding, hudRef, hint, onPick, onClose }) {
  const dialog = useRef(null);
  useEffect(() => {
    if (!menu) return;
    preloadCoupe().catch(()=>{});
    const before = document.activeElement;
    dialog.current?.querySelector(".cb3-veh-card")?.focus({ preventScroll: true });
    return () => { if (before?.isConnected) before.focus?.({ preventScroll: true }); };
  }, [menu]);
  const motor = riding === "car" || riding === "jet";
  return <>
    <style>{CSS}</style>
    {motor ? <div key={riding} ref={hudRef} data-vehicle={riding} className={`cb3-veh-meter ${riding}`} aria-label={t(`veh.${riding}`)}>
      <div className="cb3-veh-speedline"><span><strong data-speed>0</strong><small>km/h</small></span><span data-drive className="cb3-veh-drive" /></div>
      <div className="cb3-veh-power"><i /></div>
      <div className="cb3-veh-meta"><span data-status /><span data-power /></div>
    </div> : riding && <div key={riding} ref={hudRef} data-vehicle={riding} className="cb3-veh-hud" style={{ top: hint ? 74 : 14 }} />}
    {menu && <div className="cb3-veh-backdrop" onPointerDown={e => e.stopPropagation()} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <section className="cb3-veh-menu" ref={dialog} role="dialog" aria-modal="true" aria-label={t("veh.menuTitle")} onKeyDown={e => {
        if (e.key !== "Tab") return;
        const buttons=Array.from(e.currentTarget.querySelectorAll("button,a[href]")), end=e.shiftKey ? buttons[0] : buttons.at(-1);
        if (document.activeElement===end) { e.preventDefault(); (e.shiftKey ? buttons.at(-1) : buttons[0]).focus(); }
      }}>
        <header><h3>{t("veh.menuTitle")}</h3><button className="cb3-veh-close" type="button" aria-label={t("veh.close")} onClick={onClose}>×</button></header>
        <div className="cb3-veh-row">{VEHICLE_KINDS.map(k =>
          <button type="button" key={k} data-kind={k} className={`cb3-veh-card ${k === "bike" || k === "drone" ? "compact" : ""}`} onClick={() => onPick(k)}>
            <span className="cb3-veh-stage"><img alt="" draggable="false" src={`/map-3d/vehicles/${k}.webp`} /></span>
            <span className="cb3-veh-copy"><b>{t(`veh.${k}`)}</b><span className="cb3-veh-arrow" aria-hidden="true">↗</span>
              <small>{t(`veh.garage.${k}`)}</small>
              {parked?.[k] > 2 && <em>{t("veh.parked",{m: Math.round(parked[k])})}</em>}
            </span>
          </button>
        )}</div>
        <a className="cb3-veh-credit" href="/map-3d/vehicles/CREDITS.txt" target="_blank" rel="noreferrer">{t("veh.credits")}</a>
      </section>
    </div>}
  </>;
}
