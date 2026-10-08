import { useRef, useEffect } from "react";
import { createFogSim } from "../fogSim.js";
import { createFogRenderer, createFogRenderer2D } from "../fogGL.js";

/**
 * 水曇りオーバーレイ（テーマ「水曇り」）— 画面全体が結露したガラスになる。
 * 指（マウスはドラッグ）でなぞると拭ける。拭き取った水は縁に寄って水滴になり、
 * 端末の傾きの向きへ垂れて、ほかの粒を集めながら通り道を晴らす。しばらくすると拭いた所から曇り直す。
 *
 * 層（どれも pointer-events:none。UI の操作は一切じゃましない）:
 *  - すりガラス: backdrop-filter のぼかし。曇りの濃さを mask-image にして、拭いた所だけ澄ませる。
 *    マスクの差し替えで一瞬ぼかしが消えないよう、2 枚を交互に使う（新しい方を上に重ねてから古い方を隠す）
 *  - 曇りと水滴: WebGL（fogGL.js）。ガラスの状態は fogSim.js
 * 変化がない間は描画を止める。
 */

const BLUR = "blur(10px) saturate(1.25)";
const MASK_MS = 80;          // ぼかしのマスクを作り直す間隔の下限
const R_TOUCH = 24, R_MOUSE = 22, R_PEN = 9;
const D2R = Math.PI / 180;

const layer = { position: "absolute", inset: 0, pointerEvents: "none" };

export default function FogOverlay() {
  const root = useRef(null);
  const blurA = useRef(null);
  const blurB = useRef(null);
  useEffect(() => startFog(root.current, [blurA.current, blurB.current]), []);
  return (
    <div ref={root} aria-hidden="true" style={{ position: "fixed", inset: 0, zIndex: 99989, pointerEvents: "none", userSelect: "none", WebkitTouchCallout: "none" }}>
      <div ref={blurA} style={{ ...layer, visibility: "hidden" }} />
      <div ref={blurB} style={{ ...layer, visibility: "hidden" }} />
    </div>
  );
}

const supports = (prop, val) => typeof CSS !== "undefined" && CSS.supports?.(prop, val);

// 直前に外したオーバーレイのガラス。スマホ⇔PC のレイアウト切り替え（App が別の場所に付け直す）や
// StrictMode の付け直しでは、曇り直しの演出をやり直さず、拭いた跡ごと引き継ぐ
let kept = null;
const KEEP_MS = 2000;

function startFog(root, blurEls) {
  const reduced = !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const sim = kept && performance.now() - kept.at < KEEP_MS ? kept.sim : createFogSim(window.innerWidth, window.innerHeight, { reduced });
  kept = null;
  sim.resize(window.innerWidth, window.innerHeight);
  // canvas はマウントごとに作る（StrictMode の再マウントで、捨てた WebGL コンテキストを掴まないように）。
  // WebGL が使えなければ別の canvas で 2D に切り替える
  const makeCanvas = () => {
    const c = document.createElement("canvas");
    Object.assign(c.style, { ...layer, width: "100%", height: "100%", zIndex: "2" });
    root.appendChild(c);
    return c;
  };
  let canvas = makeCanvas();
  let gfx = createFogRenderer(canvas, { onRestore: () => { lightDirty = true; wake(); } });
  if (!gfx) { canvas.remove(); canvas = makeCanvas(); gfx = createFogRenderer2D(canvas); }
  if (!gfx) { canvas.remove(); return () => {}; }
  const canBlur = (supports("backdrop-filter", "blur(2px)") || supports("-webkit-backdrop-filter", "blur(2px)"))
    && (supports("mask-image", "none") || supports("-webkit-mask-image", "none"));
  const opacity = canBlur ? 0.6 : 1.3;   // ぼかせないときは、白い膜だけで文字が読めない濃さにする（描くときに 0.97 で頭打ち）

  let raf = 0, timer = 0, last = performance.now(), destroyed = false;
  let maskDirty = true, lastMask = -1e9, swapping = false, lightDirty = true;
  let [front, back] = blurEls;
  const mask = document.createElement("canvas");
  const mctx = mask.getContext("2d");
  let mimg = null;

  // ── 光と重力（傾きセンサーがあれば使う。許可の確認はしない） ──
  let gvx = 0, gvy = 0.85;
  const light = { x: 0, y: 0 }, grav = { x: 0, y: 1 };
  const aim = () => {
    const m = Math.hypot(gvx, gvy);
    grav.x = m > 1e-3 ? gvx / m : 0;
    grav.y = m > 1e-3 ? gvy / m : 1;
    // 光は「上」から少し左。傾けると映り込みが動く
    const k = 0.35 + 0.6 * Math.min(1, m), c = Math.cos(-0.5), s = Math.sin(-0.5);
    light.x = (-grav.x * c + grav.y * s) * k;
    light.y = (-grav.x * s - grav.y * c) * k;
  };
  aim();

  const setSize = () => {
    const g = sim.grid, scale = Math.min(window.devicePixelRatio || 1, 1.75);
    gfx.resize(window.innerWidth, window.innerHeight, scale, g.gw, g.gh, g.cell);
    gfx.upload(g.bytes);
    mask.width = g.gw;
    mask.height = g.gh;
    mimg = mctx.createImageData(g.gw, g.gh);
    const sz = `${g.gw * g.cell}px ${g.gh * g.cell}px`;
    for (const el of blurEls) {
      el.style.setProperty("mask-size", sz);
      el.style.setProperty("-webkit-mask-size", sz);
    }
    maskDirty = lightDirty = true;
  };
  if (canBlur) {
    for (const el of blurEls) {
      for (const [k, v] of [["backdrop-filter", BLUR], ["mask-repeat", "no-repeat"], ["mask-position", "0 0"]]) {
        el.style.setProperty(k, v);
        el.style.setProperty("-webkit-" + k, v);
      }
    }
  }
  setSize();

  const nextFrame = () => new Promise((r) => requestAnimationFrame(r));
  const refreshMask = async (now) => {
    swapping = true;
    maskDirty = false;
    lastMask = now;
    sim.buildMask(mimg.data);
    mctx.putImageData(mimg, 0, 0);
    const url = mask.toDataURL();
    // 読み込みを済ませてから差し替える（WebKit は data URL も非同期に読む）
    try { const im = new Image(); im.src = url; await im.decode(); } catch {}
    if (destroyed) return;
    back.style.setProperty("mask-image", `url("${url}")`);
    back.style.setProperty("-webkit-mask-image", `url("${url}")`);
    back.style.zIndex = "1";
    front.style.zIndex = "0";
    back.style.visibility = "visible";
    await nextFrame();
    await nextFrame();
    if (destroyed) return;
    front.style.visibility = "hidden";
    [front, back] = [back, front];
    swapping = false;
    if (maskDirty) wake();
  };

  const frame = (now) => {
    raf = 0;
    const r = sim.step((now - last) / 1000);
    last = now;
    if (r.changed) { gfx.upload(sim.grid.bytes); maskDirty = true; }
    if (r.changed || r.dropsChanged || lightDirty) {
      gfx.render(sim.drops, light, grav, opacity);
      lightDirty = false;
    }
    let next = r.next;
    if (canBlur && maskDirty) {
      if (!swapping && now - lastMask >= MASK_MS) refreshMask(now);
      else next = Math.min(next, Math.max(0, (MASK_MS - (now - lastMask)) / 1000));
    }
    schedule(next);
  };
  const schedule = (sec) => {
    if (destroyed || raf || timer) return;
    if (sec <= 0.017) raf = requestAnimationFrame(frame);
    else if (sec !== Infinity) timer = setTimeout(() => { timer = 0; raf = requestAnimationFrame(frame); }, Math.min(sec, 10) * 1000);
  };
  const wake = () => {
    if (destroyed) return;
    if (timer) { clearTimeout(timer); timer = 0; }
    if (!raf) raf = requestAnimationFrame(frame);
  };

  // ── 入力（window で拾うだけ。preventDefault はしない） ──
  // 指はタッチイベントで拾う（スクロールが始まると pointer イベントは pointercancel で止まるため）
  const hasTouch = "ontouchstart" in window;
  const touchR = (t) => {
    const m = Math.max(t.radiusX || 0, t.radiusY || 0);
    return m > 4 ? Math.min(34, Math.max(16, m * 1.15)) : R_TOUCH;
  };
  const onTouchStart = (e) => { for (const t of e.changedTouches) sim.begin("t" + t.identifier, t.clientX, t.clientY, touchR(t)); wake(); };
  const onTouchMove = (e) => { for (const t of e.changedTouches) sim.move("t" + t.identifier, t.clientX, t.clientY); wake(); };
  const onTouchEnd = (e) => { for (const t of e.changedTouches) sim.end("t" + t.identifier); wake(); };
  const isTouch = (e) => e.pointerType === "touch" && hasTouch;
  const penR = (e) => (e.pointerType === "pen" ? R_PEN : e.pointerType === "touch" ? R_TOUCH : R_MOUSE);
  const onPointerDown = (e) => { if (isTouch(e)) return; sim.begin("p" + e.pointerId, e.clientX, e.clientY, penR(e)); wake(); };
  const onPointerMove = (e) => {
    if (isTouch(e) || !e.buttons) return;
    const id = "p" + e.pointerId;
    if (sim.has(id)) sim.move(id, e.clientX, e.clientY);
    else sim.begin(id, e.clientX, e.clientY, penR(e));
    wake();
  };
  const onPointerUp = (e) => { if (isTouch(e)) return; sim.end("p" + e.pointerId); wake(); };

  const onOrient = (e) => {
    if (e.beta == null || e.gamma == null) return;
    const b = e.beta * D2R, g = e.gamma * D2R;
    const sx = Math.sin(g) * Math.cos(b), sy = Math.sin(b);
    // 画面の向き（window.orientation は screen.orientation のない古い iOS 用）
    const a = ((screen.orientation && screen.orientation.angle) ?? window.orientation ?? 0) * D2R;
    const tx = sx * Math.cos(a) + sy * Math.sin(a), ty = -sx * Math.sin(a) + sy * Math.cos(a);
    gvx += (tx - gvx) * 0.12;
    gvy += (ty - gvy) * 0.12;
    sim.setGravity(gvx, gvy);
    const ox = light.x, oy = light.y;
    aim();
    if (Math.abs(light.x - ox) + Math.abs(light.y - oy) > 0.015) { lightDirty = true; wake(); }
  };
  const onResize = () => { if (sim.resize(window.innerWidth, window.innerHeight)) setSize(); wake(); };
  const onVisible = () => { if (document.visibilityState === "visible") wake(); };

  const cap = { passive: true, capture: true };
  const listeners = [
    [window, "touchstart", onTouchStart], [window, "touchmove", onTouchMove],
    [window, "touchend", onTouchEnd], [window, "touchcancel", onTouchEnd],
    [window, "pointerdown", onPointerDown], [window, "pointermove", onPointerMove],
    [window, "pointerup", onPointerUp], [window, "pointercancel", onPointerUp],
    [window, "resize", onResize], [document, "visibilitychange", onVisible],
  ];
  if (!reduced) listeners.push([window, "deviceorientation", onOrient]);
  for (const [t, ev, fn] of listeners) t.addEventListener(ev, fn, cap);
  wake();

  return () => {
    destroyed = true;
    cancelAnimationFrame(raf);
    clearTimeout(timer);
    for (const [t, ev, fn] of listeners) t.removeEventListener(ev, fn, cap);
    gfx.destroy();
    canvas.remove();
    kept = { sim, at: performance.now() };
    setTimeout(() => { if (kept?.sim === sim) kept = null; }, KEEP_MS);
  };
}
