"use client";

import { useEffect, useId, useRef, useState } from "react";
import { getLang, t } from "../i18n.js";
import { TAKI_CUT_Y, TAKI_FLOOR_Y } from "../takiPlazaSection.js";
import { bindModelGestures } from "./takiModelGestures.js";
import styles from "./TakiPlazaModel.module.css";

// Model-local metres. B2 quadrants follow the university reservation plan:
// https://kyomu0.gakumu.titech.ac.jp/fr/Common/FacilityReservation/TakiPlazaB2F.pdf
// Reconciled with taki-int-b2.rooms and stairs in public/map-3d/features.json.
const ROOMS = {
  B2F: [
    {en:"Event space(Library Side)",ja:"イベントスペース（図書館側）",pos:[-3.4,1.0,-3.9]},
    {en:"Event space(Dry Garden Side)",ja:"イベントスペース（ドライガーデン側）",pos:[7.1,1.0,-2.9]},
    {en:"Event space (Kitchen)",ja:"キッチンエリア",pos:[22.2,1.1,-2]},
    {en:"Grand Staircase",ja:"大階段エリア",pos:[-.45,1.85,-15.7]},
    {en:"Workshop Room 1",ja:"ワークショップルーム1",pos:[9.6,1.0,11.7]},
    {en:"Workshop Room 2",ja:"ワークショップルーム2",pos:[8.8,1.0,18.7]},
  ],
  // The published university guide places the interview booths within Career
  // Information. The public model records this area, not the individual booths.
  B1F: ["A","B"].map(id=>({en:"WORK POD "+id,ja:"WORK POD "+id,pos:[4.1,1.0,-7.9],booth:id})),
};
const levels = ["all", "3F", "2F", "1F", "B1F", "B2F"];
const highest = TAKI_CUT_Y.all, lowest = TAKI_CUT_Y.B2F;
const pins = Object.entries(ROOMS).flatMap(([floor, rooms]) => rooms.map(room => ({
  ...room, floor, position: [room.pos[0], TAKI_FLOOR_Y[floor] + room.pos[1], room.pos[2]],
})));

function exposedFloor(height) {
  if (height >= highest) return "all";
  return levels.slice(1).find(floor => height > TAKI_FLOOR_Y[floor] + 0.12) || "B2F";
}

export default function TakiPlazaModel({ focus, onSpaceSelect }) {
  const stage = useRef(null), viewport = useRef(null), engine = useRef(null);
  const cut = useRef(highest), animation = useRef(0);
  const [height, setHeight] = useState(highest);
  const [status, setStatus] = useState("loading"), [attempt, setAttempt] = useState(0);
  const railId = useId();
  const floor = exposedFloor(height);
  const description = floor === "all" ? t("taki.wholeModel") : t("taki.floorSection", { floor });
  const english = getLang() !== "ja";

  function applyCut(value) {
    cut.current = value;
    setHeight(value);
    engine.current?.setCut(value >= highest ? Infinity : value);
  }

  useEffect(() => {
    let alive = true, controller, unbind;
    async function start() {
      try {
        const { createTakiPreview } = await import("../takiPlazaPreview.js");
        if (!alive) return;
        controller = createTakiPreview(stage.current, project => {
          for (const pin of viewport.current?.querySelectorAll("[data-pos]") || []) {
            const position = pin.dataset.pos.split(",").map(Number);
            // Anchor the stairs to their visible portion as the cut crosses the flight.
            position[1] = Math.min(position[1], cut.current - 0.02);
            const [x,y] = project(position);
            pin.style.left = x + "px";
            pin.style.top = y + "px";
          }
        });
        engine.current = controller;
        controller.setCut(cut.current >= highest ? Infinity : cut.current);
        await controller.load();
        if (!alive) return;
        unbind = bindModelGestures(viewport.current, controller);
        setStatus("ready");
      } catch {
        if (alive) setStatus("error");
      }
    }
    start();
    return () => { alive = false; unbind?.(); controller?.dispose(); engine.current = null; };
  }, [attempt]);

  useEffect(() => {
    cancelAnimationFrame(animation.current);
    if (focus?.retainCut) return;
    const target = TAKI_CUT_Y[focus?.floor] ?? highest;
    const start = cut.current;
    if (start === target) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || !engine.current) {
      applyCut(target);
      return;
    }
    const started = performance.now();
    function advance(now) {
      const fraction = Math.min(1, (now - started) / 450);
      const eased = fraction * fraction * (3 - 2 * fraction);
      applyCut(fraction >= 1 ? target : start + (target - start) * eased);
      if (fraction < 1) animation.current = requestAnimationFrame(advance);
    }
    animation.current = requestAnimationFrame(advance);
    return () => cancelAnimationFrame(animation.current);
  }, [focus]);

  function sliderMoved(event) {
    cancelAnimationFrame(animation.current);
    applyCut(event.currentTarget.valueAsNumber);
  }
  return <section className={styles.viewer} aria-label={t("taki.floorGuide")}>
    <div ref={viewport} className={styles.viewport} tabIndex={status === "ready" ? 0 : -1}
      role="group" aria-label={t("taki.directControls")} data-ready={status === "ready"}>
      <div ref={stage} className={styles.canvas} />
      {pins.map(room => {
        const label = english ? room.en : room.ja;
        const active = room.en === focus?.space || room.ja === focus?.space;
        return <button key={room.en} type="button" data-pos={room.position.join(",")} data-booth={room.booth}
          data-active={active} className={styles.pin} hidden={status !== "ready" || floor !== room.floor || height < TAKI_FLOOR_Y[room.floor] + 0.7}
          aria-label={label} title={label} aria-pressed={active} onClick={() => onSpaceSelect?.(room.en, room.floor)}>
          <span className={styles.dot}>{room.booth}</span>
          {(!room.booth || active) && <span className={styles.pinLabel}>{label}</span>}
        </button>;
      })}
    </div>
    <span className={styles.caption}>{description}</span>
    <div className={styles.rail}>
      <label htmlFor={railId}>{t("taki.cutLabel")}</label>
      <div className={styles.scale} style={{ "--cut-thumb": (highest - height) / (highest - lowest) * 100 + "%" }}>
        <div className={styles.ticks} aria-hidden="true">
          {levels.map(level => <span key={level} data-selected={level === floor}
            style={{ top: (highest - TAKI_CUT_Y[level]) / (highest - lowest) * 100 + "%" }}>
            {level === "all" ? t("taki.whole") : level}
          </span>)}
        </div>
        <input id={railId} type="range" aria-label={t("taki.cutHeight")} aria-orientation="vertical"
          aria-valuetext={description} min={lowest} max={highest} step="0.1" value={height} onChange={sliderMoved} />
      </div>
    </div>
    {status !== "ready" && <div className={styles.status} role="status">
      {status === "loading" ? t("taki.modelLoading") : <button type="button"
        onClick={() => { setStatus("loading"); setAttempt(v => v + 1); }}>{t("taki.retryModel")}</button>}
    </div>}
    <div className={styles.hint}>
      {floor === "B1F" && <span>{t("taki.podArea")} · </span>}
      <span className={styles.mouseHint}>{t("taki.orbitMouse")}</span>
      <span className={styles.touchHint}>{t("taki.orbitTouch")}</span>
    </div>
  </section>;
}
