import { useRef, useEffect, useCallback } from "react";

/**
 * 水曇りオーバーレイ — 画面全体を曇りガラスのように覆い、
 * 指（マウス）でぬぐうと見えるようになる。
 * しばらく放置すると再び曇り始める。
 */

const BRUSH = 48;           // ぬぐうブラシ半径 (px)
const REFOG_DELAY = 4000;   // 最後のタッチから再曇り開始までの ms
const REFOG_SPEED = 0.4;    // 1フレームあたりの曇り復帰量 (0-255)
const FOG_ALPHA = 180;      // 曇りの最大不透明度 (0-255)
const CLEAR_THRESH = 60;    // これ以下ならタップを通す閾値

// 水滴テクスチャ — 小さなドロップレットをランダムに描く
function drawDroplets(ctx, w, h) {
  const count = Math.floor((w * h) / 800);
  for (let i = 0; i < count; i++) {
    const x = Math.random() * w;
    const y = Math.random() * h;
    const r = 0.5 + Math.random() * 2.5;
    const alpha = 0.08 + Math.random() * 0.18;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255,255,255,${alpha})`;
    ctx.fill();
  }
}

export default function FogOverlay() {
  const canvasRef = useRef(null);
  const fogRef = useRef(null);        // Uint8Array — per-pixel fog density
  const lastTouchRef = useRef(0);
  const rafRef = useRef(null);
  const sizeRef = useRef({ w: 0, h: 0 });
  const dropletsRef = useRef(null);    // offscreen canvas for droplets

  // --- resize handler ---
  const setupCanvas = useCallback(() => {
    const cvs = canvasRef.current;
    if (!cvs) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.ceil(window.innerWidth * dpr);
    const h = Math.ceil(window.innerHeight * dpr);
    cvs.width = w;
    cvs.height = h;
    cvs.style.width = window.innerWidth + "px";
    cvs.style.height = window.innerHeight + "px";
    sizeRef.current = { w, h };

    // fog density map (1 byte per pixel in a reduced-res grid for perf)
    fogRef.current = new Uint8Array(w * h);
    fogRef.current.fill(FOG_ALPHA);

    // regenerate droplets
    const offscreen = document.createElement("canvas");
    offscreen.width = w;
    offscreen.height = h;
    const octx = offscreen.getContext("2d");
    drawDroplets(octx, w, h);
    dropletsRef.current = offscreen;

    lastTouchRef.current = 0; // reset so fog doesn't immediately re-fog
  }, []);

  // --- wipe brush ---
  const wipe = useCallback((clientX, clientY) => {
    const fog = fogRef.current;
    if (!fog) return;
    const { w, h } = sizeRef.current;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cx = Math.round(clientX * dpr);
    const cy = Math.round(clientY * dpr);
    const r = Math.round(BRUSH * dpr);
    const r2 = r * r;

    const x0 = Math.max(0, cx - r);
    const x1 = Math.min(w - 1, cx + r);
    const y0 = Math.max(0, cy - r);
    const y1 = Math.min(h - 1, cy + r);

    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const dx = x - cx;
        const dy = y - cy;
        const d2 = dx * dx + dy * dy;
        if (d2 < r2) {
          // soft edge — more clearing at center
          const t = 1 - Math.sqrt(d2) / r;
          const idx = y * w + x;
          fog[idx] = Math.max(0, fog[idx] - Math.round(t * 80));
        }
      }
    }
    lastTouchRef.current = performance.now();
  }, []);

  // --- check if a point is fogged ---
  const isFogged = useCallback((clientX, clientY) => {
    const fog = fogRef.current;
    if (!fog) return true;
    const { w } = sizeRef.current;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const px = Math.round(clientX * dpr);
    const py = Math.round(clientY * dpr);
    const idx = py * w + px;
    return (fog[idx] || 0) > CLEAR_THRESH;
  }, []);

  // --- render loop ---
  useEffect(() => {
    setupCanvas();
    window.addEventListener("resize", setupCanvas);

    const render = () => {
      const cvs = canvasRef.current;
      const fog = fogRef.current;
      if (!cvs || !fog) { rafRef.current = requestAnimationFrame(render); return; }
      const ctx = cvs.getContext("2d");
      const { w, h } = sizeRef.current;

      // re-fog over time
      const now = performance.now();
      const sinceTouch = now - lastTouchRef.current;
      if (lastTouchRef.current > 0 && sinceTouch > REFOG_DELAY) {
        const speed = Math.min(REFOG_SPEED * (1 + (sinceTouch - REFOG_DELAY) / 8000), 2);
        for (let i = 0, len = fog.length; i < len; i++) {
          if (fog[i] < FOG_ALPHA) {
            fog[i] = Math.min(FOG_ALPHA, fog[i] + speed);
          }
        }
      }

      // draw fog via ImageData
      const imgData = ctx.createImageData(w, h);
      const data = imgData.data;
      for (let i = 0, len = fog.length; i < len; i++) {
        const a = fog[i];
        const off = i * 4;
        // milky white-blue fog
        data[off] = 210;      // R
        data[off + 1] = 218;  // G
        data[off + 2] = 228;  // B
        data[off + 3] = a;    // A
      }
      ctx.putImageData(imgData, 0, 0);

      // overlay droplets
      if (dropletsRef.current) {
        ctx.globalAlpha = 0.7;
        ctx.drawImage(dropletsRef.current, 0, 0);
        ctx.globalAlpha = 1;
      }

      rafRef.current = requestAnimationFrame(render);
    };
    rafRef.current = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", setupCanvas);
    };
  }, [setupCanvas]);

  // --- pointer handlers ---
  const onPointerDown = useCallback((e) => {
    // if clear at this point, forward the event
    if (!isFogged(e.clientX, e.clientY)) {
      forwardEvent(e);
      return;
    }
    wipe(e.clientX, e.clientY);
    e.preventDefault();
  }, [wipe, isFogged]);

  const onPointerMove = useCallback((e) => {
    if (e.buttons > 0 || e.pointerType === "touch") {
      wipe(e.clientX, e.clientY);
      e.preventDefault();
    }
  }, [wipe]);

  const onTouchMove = useCallback((e) => {
    for (const t of e.touches) {
      wipe(t.clientX, t.clientY);
    }
    e.preventDefault();
  }, [wipe]);

  // forward click to element beneath the canvas
  const forwardEvent = useCallback((e) => {
    const cvs = canvasRef.current;
    if (!cvs) return;
    cvs.style.pointerEvents = "none";
    const el = document.elementFromPoint(e.clientX, e.clientY);
    if (el) {
      el.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, clientX: e.clientX, clientY: e.clientY }));
      el.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, clientX: e.clientX, clientY: e.clientY }));
      el.click();
      el.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, clientX: e.clientX, clientY: e.clientY }));
      el.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, clientX: e.clientX, clientY: e.clientY }));
    }
    cvs.style.pointerEvents = "auto";
  }, []);

  return (
    <canvas
      ref={canvasRef}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onTouchMove={onTouchMove}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 99990,
        touchAction: "none",
        cursor: "grab",
      }}
    />
  );
}
