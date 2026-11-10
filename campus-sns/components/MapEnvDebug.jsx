"use client";
// 3D 地図の「時間・天気」デバッグ（CampusMap3D の中に出す。開発中・エディタ・localStorage の cb3Debug が "1" のとき）。2026-11-10
// - 時刻：日付・時刻・その日の中のスライダー・進む速さ（止める・×1・×60・×600・×3600）・今に戻す（世界の時計 campus3dClock）
// - 季節：その年の何日目のスライダーと、節目（サクラの開花・満開・新緑・紅葉・イチョウの黄葉・落ち葉…）へ跳ぶボタン
// - 天気：プリセット（快晴〜台風・霧・雪・強風）と、雲・暗さ・雨・雪・風・風向き・見通し・雷・濡れ・積雪（自動＝雨・雪から時間で）
// - 出どころ：太陽・月・星・木の季節・芝生・天気が、計算・推定・演出・手動（デバッグ）・不明のどれか
// 値は envRef（CampusMap3D の envAt の結果）と weatherRef（天気の状態）を 0.25 秒ごとに読む。変えたら onChange（すぐ測り直す）
import { useEffect, useState } from "react";
import { t } from "../i18n.js";
import { dayOfYear, jstParts, jstTime, setWorldClock, worldClock, worldLive } from "../campus3dClock.js";
import { SPECIES, WEATHER_ORDER, WEATHER_PRESETS, lightningForce, weatherCreate, weatherPreset, weatherSet } from "../campus3dEnv.js";

const OPEN_KEY = "cb3EnvDbg";
const CSS = `
/* ふだんは左下（上は検索欄が重なる）、歩いているときは左上 */
.cb3-env-btn{position:absolute;left:10px;bottom:24px;height:34px;padding:0 12px;border:none;border-radius:17px;background:var(--cb3-btn);color:var(--cb3-btn-tx);
  box-shadow:0 6px 16px -6px rgba(0,0,0,.4);cursor:pointer;font:inherit;font-size:12.5px;font-weight:800;z-index:4;pointer-events:auto}
.cb3-env-btn.on{background:#0e7490;color:#fff}
.cb3-env-btn.walk{top:10px;bottom:auto}
.cb3-env{position:absolute;left:10px;bottom:64px;width:min(360px,calc(100% - 80px));max-height:calc(100% - 150px);overflow-y:auto;border-radius:14px;
  background:var(--cb3-btn);color:var(--cb3-btn-tx);box-shadow:0 10px 28px -10px rgba(0,0,0,.55);z-index:4;font-size:12px;padding:8px 10px 10px;box-sizing:border-box;pointer-events:auto}
.cb3-env.walk{top:52px;bottom:auto}
.cb3-env h4{margin:8px 0 4px;font-size:12.5px;font-weight:800;display:flex;align-items:center;gap:6px}
.cb3-env h4 small{font-weight:600;opacity:.65}
.cb3-env .row{display:flex;flex-wrap:wrap;gap:5px;align-items:center;margin:3px 0}
.cb3-env button{border:none;border-radius:9px;padding:4px 8px;background:rgba(127,127,127,.16);color:inherit;font:inherit;font-weight:700;cursor:pointer}
.cb3-env button.on{background:#0e7490;color:#fff}
.cb3-env input[type=date],.cb3-env input[type=time]{font:inherit;padding:2px 4px;border-radius:7px;border:1px solid var(--cb3-btn-bd);background:transparent;color:inherit}
.cb3-env input[type=range]{width:100%;margin:2px 0}
.cb3-env .sl{display:grid;grid-template-columns:72px 1fr 62px;align-items:center;gap:6px}
.cb3-env .sl b{font-weight:700}
.cb3-env .sl span{text-align:right;font-variant-numeric:tabular-nums;opacity:.85}
.cb3-env .note{opacity:.75;font-size:11px;line-height:1.45}
.cb3-env .note.warn{opacity:1;color:#b45309;font-weight:700}
.cb3-env .prov{display:grid;grid-template-columns:70px 92px 1fr;gap:2px 6px;font-size:11px;line-height:1.4}
.cb3-env .prov i{font-style:normal;font-weight:800}
.cb3-env .k-計算{color:#0e7490}.cb3-env .k-推定{color:#b45309}.cb3-env .k-演出{color:#7c3aed}.cb3-env .k-観測{color:#15803d}.cb3-env .k-不明{color:#6b7280}
.cb3-env .k-手動（デバッグ）{color:#be123c}
`;
const SPEEDS = [0, 1, 60, 600, 3600];
// 季節の節目（日本時間の月・日）
const SEASONS = [
  ["winter", 1, 20], ["bloom", 3, 24], ["full", 3, 31], ["petals", 4, 9], ["fresh", 4, 28], ["summer", 7, 25],
  ["sakuraRed", 11, 5], ["ginkgo", 11, 23], ["litter", 12, 3], ["bare", 12, 25],
];
// 見え方ボタン（昼・夕方・夜）の名前
const LOOK_KEY = { day: "navi.lookDay", evening: "navi.lookEvening", night: "navi.lookNight" };
const pad = (n) => String(n).padStart(2, "0");
const fmt1 = (v) => (Number.isFinite(v) ? v.toFixed(1) : "–");
// 見通し（m）をスライダー（0〜1000）に：対数
const FOG_MIN = 50;
const FOG_MAX = 30000;
const fogToSl = (m) => Math.round((Math.log(Math.max(FOG_MIN, Math.min(FOG_MAX, m)) / FOG_MIN) / Math.log(FOG_MAX / FOG_MIN)) * 1000);
const slToFog = (v) => Math.round(FOG_MIN * (FOG_MAX / FOG_MIN) ** (v / 1000));

export function MapEnvDebug({ envRef, weatherRef, onChange, walking = false, lookMode = "auto" }) {
  const [open, setOpen] = useState(() => {
    try {
      return localStorage.getItem(OPEN_KEY) === "1";
    } catch {
      return false;
    }
  });
  const [snap, setSnap] = useState(null);
  useEffect(() => {
    if (!open) return undefined;
    const read = () => setSnap({ clock: worldClock(), env: envRef.current, W: { ...weatherRef.current } });
    read();
    const id = setInterval(read, 250);
    return () => clearInterval(id);
  }, [open, envRef, weatherRef]);
  // 確かめ用（headless のテスト）：window.__campusEnv から時刻・天気を決める
  useEffect(() => {
    const api = {
      setTime: (ms, speed) => { setWorldClock({ time: ms, speed }); onChange?.(true); },
      live: () => { worldLive(); onChange?.(true); },
      preset: (k) => { weatherPreset(weatherRef.current, k); onChange?.(true); },
      set: (patch) => { weatherSet(weatherRef.current, patch); if (weatherRef.current.src === "unknown") weatherRef.current.src = "manual"; onChange?.(true); },
      reset: () => { Object.assign(weatherRef.current, weatherCreate()); onChange?.(true); },
      env: () => envRef.current,
      weather: () => ({ ...weatherRef.current }),
      // 雷をいま光らせる（雷があるとき）。{ kind: "cg"|"ic", az, dist, hold }
      flash: (o) => {
        const L = envRef.current?.lightning;
        return L && weatherRef.current.thunder ? lightningForce(L, performance.now(), o || {}) : null;
      },
    };
    window.__campusEnv = api;
    return () => {
      if (window.__campusEnv === api) delete window.__campusEnv;
    };
  }, [envRef, weatherRef, onChange]);
  const toggle = () => {
    const v = !open;
    setOpen(v);
    try {
      localStorage.setItem(OPEN_KEY, v ? "1" : "0");
    } catch {
      /* 覚えられなくてもよい */
    }
  };
  const changed = () => {
    onChange?.(true);
    setSnap({ clock: worldClock(), env: envRef.current, W: { ...weatherRef.current } });
  };
  const setTime = (ms) => {
    if (!Number.isFinite(ms)) return;
    setWorldClock({ time: ms });
    changed();
  };
  // 天気の値を変える（観測なしのときに濡れ・積雪だけ動かしても、手で決めた天気にする）
  const setW = (patch) => {
    weatherSet(weatherRef.current, patch);
    if (weatherRef.current.src === "unknown") weatherRef.current.src = "manual";
    changed();
  };

  const style = <style>{CSS}</style>;
  if (!open) {
    return (
      <>
        {style}
        <button type="button" className={`cb3-env-btn${walking ? " walk" : ""}`} onClick={toggle} title={t("env.title")}>{t("env.btn")}</button>
      </>
    );
  }
  const c = snap?.clock || worldClock();
  const e = snap?.env;
  const W = snap?.W || weatherRef.current;
  const p = jstParts(c.time);
  const day = `${p.y}-${pad(p.mo)}-${pad(p.d)}`;
  const hm = `${pad(p.h)}:${pad(p.mi)}`;
  // 動いているときは秒も（×1 でも時刻が進んでいるのが見える）
  const running = c.mode === "live" || c.speed !== 0;
  const hmShow = running ? `${hm}:${pad(p.s)}` : hm;
  const minute = p.h * 60 + p.mi;
  const doy = Math.floor(dayOfYear(c.time));
  const keepTime = (y, mo, d) => jstTime(`${y}-${pad(mo)}-${pad(d)}`, hm);
  const setDoy = (k) => {
    const start = Date.UTC(p.y, 0, 1) - 9 * 3600000;
    setTime(start + k * 86400000 + minute * 60000);
  };
  const sl = (key, label, min, max, step, value, onIn, show) => (
    <label className="sl" key={key}>
      <b>{label}</b>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(ev) => onIn(Number(ev.target.value))} />
      <span>{show}</span>
    </label>
  );
  const prov = e?.prov || {};
  const PROV_ROWS = [["sun", "env.sun"], ["moon", "env.moon"], ["stars", "env.stars"], ["plants", "env.plants"], ["lawn", "env.lawn"], ["weather", "env.weather"], ["precip", "env.precip"], ["thunder", "env.thunder"]];
  return (
    <>
      {style}
      <button type="button" className={`cb3-env-btn on${walking ? " walk" : ""}`} onClick={toggle}>{t("env.btn")}</button>
      <div className={`cb3-env${walking ? " walk" : ""}`} role="group" aria-label={t("env.title")} onPointerDown={(ev) => ev.stopPropagation()} onKeyDown={(ev) => ev.stopPropagation()}>
        <h4>
          {t("env.time")}
          <small>{c.mode === "live" ? t("env.live") : `×${c.speed}`}</small>
        </h4>
        <div className="row">
          <input type="date" value={day} onChange={(ev) => ev.target.value && setTime(jstTime(ev.target.value, hm))} />
          <input type="time" value={hm} onChange={(ev) => ev.target.value && setTime(jstTime(day, ev.target.value))} />
          <button type="button" className={c.mode === "live" ? "on" : ""} onClick={() => { worldLive(); changed(); }}>{t("env.now")}</button>
        </div>
        {LOOK_KEY[lookMode] && (
          <div className="note warn">{t(c.mode === "set" ? "env.lookOver" : "env.lookFixed", { m: t(LOOK_KEY[lookMode]) })}</div>
        )}
        {sl("min", t("env.timeOfDay"), 0, 1439, 1, minute, (v) => setTime(jstTime(day, `${pad(Math.floor(v / 60))}:${pad(v % 60)}`)), hmShow)}
        <div className="row">
          {SPEEDS.map((k) => (
            <button type="button" key={k} className={c.mode === "set" && c.speed === k ? "on" : ""} onClick={() => { setWorldClock({ speed: k }); changed(); }}>
              {k === 0 ? t("env.stop") : `×${k}`}
            </button>
          ))}
        </div>
        {e && (
          <div className="note">
            {t("env.sun")} {fmt1(e.sun.elevation)}° / {Math.round(e.sun.azimuth)}°　{t("env.moon")} {fmt1(e.moon.elevation)}° / {Math.round(e.moon.azimuth)}°・{t("env.moonLit")} {Math.round(e.moon.lit * 100)}%（{e.moon.waxing ? t("env.waxing") : t("env.waning")}）
          </div>
        )}

        <h4>
          {t("env.season")}
          <small>{t("env.doy", { n: doy + 1 })}</small>
        </h4>
        {sl("doy", t("env.date"), 0, 364, 1, doy, setDoy, `${p.mo}/${p.d}`)}
        <div className="row">
          {SEASONS.map(([k, mo, d]) => (
            <button type="button" key={k} onClick={() => setTime(keepTime(p.y, mo, d))}>{t(`env.s.${k}`)}</button>
          ))}
        </div>
        {e && (
          <div className="note">
            {Object.entries(e.plants)
              .filter(([k]) => SPECIES[k]?.deciduous)
              .map(([k, st]) => `${SPECIES[k].name}：${t("env.leaf")} ${Math.round(st.leaf * 100)}%${st.autumn > 0.02 ? `・${t("env.autumn")} ${Math.round(st.autumn * 100)}%` : ""}${st.bloom > 0.02 ? `・${t("env.bloomN")} ${Math.round(st.bloom * 100)}%` : ""}${st.litter > 0.02 ? `・${t("env.litter")} ${Math.round(st.litter * 100)}%` : ""}`)
              .join("　")}
            {`　${t("env.lawn")} ${Math.round(e.lawn * 100)}%`}
          </div>
        )}

        <h4>
          {t("env.weather")}
          <small>{W.src === "unknown" ? t("env.unknown") : W.preset ? t(`env.w.${W.preset}`) : t("env.custom")}</small>
        </h4>
        <div className="row">
          {WEATHER_ORDER.map((k) => (
            <button type="button" key={k} className={W.preset === k ? "on" : ""} onClick={() => { weatherPreset(weatherRef.current, k); changed(); }} title={WEATHER_PRESETS[k].label}>
              {t(`env.w.${k}`)}
            </button>
          ))}
          <button type="button" className={W.src === "unknown" ? "on" : ""} onClick={() => { Object.assign(weatherRef.current, weatherCreate()); changed(); }}>{t("env.unknown")}</button>
        </div>
        {sl("cloud", t("env.cloud"), 0, 1, 0.01, W.cloud, (v) => setW({ cloud: v }), `${Math.round(W.cloud * 100)}%`)}
        {sl("dark", t("env.dark"), 0, 1, 0.01, W.dark, (v) => setW({ dark: v }), `${Math.round(W.dark * 100)}%`)}
        <div className="row">
          {["cumulus", "stratus", "cirrus", "cumulonimbus"].map((k) => (
            <button type="button" key={k} className={W.type === k ? "on" : ""} onClick={() => setW({ type: k })}>{t(`env.c.${k}`)}</button>
          ))}
        </div>
        {sl("rain", t("env.rain"), 0, 60, 0.5, W.rain, (v) => setW({ rain: v }), `${fmt1(W.rain)}mm/h`)}
        {sl("snow", t("env.snow"), 0, 6, 0.1, W.snow, (v) => setW({ snow: v }), `${fmt1(W.snow)}mm/h`)}
        {sl("wind", t("env.wind"), 0, 30, 0.5, W.wind, (v) => setW({ wind: v }), `${fmt1(W.wind)}m/s`)}
        {sl("windDir", t("env.windDir"), 0, 359, 1, W.windDir, (v) => setW({ windDir: v }), `${Math.round(W.windDir)}°`)}
        {sl("fog", t("env.fog"), 0, 1000, 1, fogToSl(W.fog), (v) => setW({ fog: slToFog(v) }), W.fog >= 1000 ? `${(W.fog / 1000).toFixed(1)}km` : `${W.fog}m`)}
        <div className="row">
          <label>
            <input type="checkbox" checked={!!W.thunder} onChange={(ev) => setW({ thunder: ev.target.checked })} /> {t("env.thunder")}
          </label>
          <label>
            <input type="checkbox" checked={!!W.wetAuto} onChange={(ev) => setW({ wetAuto: ev.target.checked })} /> {t("env.wetAuto")}
          </label>
          <label>
            <input type="checkbox" checked={!!W.snowAuto} onChange={(ev) => setW({ snowAuto: ev.target.checked })} /> {t("env.snowAuto")}
          </label>
        </div>
        {W.thunder && W.src !== "unknown" && (
          <div className="note">
            <button type="button" onClick={() => { const L = envRef.current?.lightning; if (L) lightningForce(L, performance.now()); onChange?.(true); }}>{t("env.flashNow")}</button>{" "}
            {e?.lightning?.last
              ? t("env.strike", { n: e.lightning.last.n, az: Math.round(e.lightning.last.az), d: e.lightning.last.dist.toFixed(1), k: t(e.lightning.last.kind === "cg" ? "env.strikeCG" : "env.strikeIC") })
              : t("env.strikeWait")}
          </div>
        )}
        {sl("wet", t("env.wet"), 0, 1, 0.01, W.wet, (v) => setW({ wet: v, wetAuto: false }), `${Math.round(W.wet * 100)}%`)}
        {sl("snowCover", t("env.snowCover"), 0, 1, 0.01, W.snowCover, (v) => setW({ snowCover: v, snowAuto: false }), `${Math.round(W.snowCover * 100)}%`)}

        <h4>{t("env.source")}</h4>
        <div className="prov">
          {PROV_ROWS.map(([k, label]) => (prov[k] ? [
            <span key={`${k}a`}>{t(label)}</span>,
            <i key={`${k}b`} className={`k-${prov[k].kind}`}>{prov[k].kind}</i>,
            <span key={`${k}c`}>{prov[k].note}</span>,
          ] : null))}
        </div>
      </div>
    </>
  );
}
