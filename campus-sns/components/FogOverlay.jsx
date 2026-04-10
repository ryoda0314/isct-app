import { useRef, useEffect, useCallback } from "react";

/**
 * 水曇りオーバーレイ — 画面全体を曇りガラスのように覆い、
 * 指（マウス）でぬぐうと見えるようになる。
 * しばらく放置すると再び曇り始める。
 *
 * 2層構造:
 *  - 下: backdrop-filter blur で本物のすりガラス効果
 *  - 上: Canvas で alpha mask（ぬぐった所だけ穴を開ける）+ 水滴テクスチャ
 */

const BRUSH = 50;
const REFOG_DELAY = 3000;
const REFOG_SPEED = 0.8;
const FOG_ALPHA = 255;

// 水滴テクスチャ
function drawDroplets(ctx, w, h) {
  // 大きめの水滴
  const bigCount = Math.floor((w * h) / 12000);
  for (let i = 0; i < bigCount; i++) {
    const x = Math.random() * w;
    const y = Math.random() * h;
    const rx = 2 + Math.random() * 5;
    const ry = rx * (1.1 + Math.random() * 1.0);
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
    const grad = ctx.createRadialGradient(x - rx * 0.3, y - ry * 0.3, 0, x, y, Math.max(rx, ry));
    grad.addColorStop(0, "rgba(255,255,255,0.45)");
    grad.addColorStop(0.4, "rgba(240,244,250,0.25)");
    grad.addColorStop(1, "rgba(220,228,240,0.05)");
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.restore();
  }

  // 細かい霧粒
  const smallCount = Math.floor((w * h) / 500);
  for (let i = 0; i < smallCount; i++) {
    const x = Math.random() * w;
    const y = Math.random() * h;
    const r = 0.3 + Math.random() * 1.2;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255,255,255,${0.1 + Math.random() * 0.25})`;
    ctx.fill();
  }

  // 水が垂れた跡
  const streakCount = Math.floor(w / 40);
  for (let i = 0; i < streakCount; i++) {
    const x = Math.random() * w;
    const y0 = Math.random() * h * 0.15;
    const len = 80 + Math.random() * 400;
    const wobble = 1.5 + Math.random() * 3;
    ctx.beginPath();
    ctx.moveTo(x, y0);
    for (let dy = 0; dy < len; dy += 2) {
      ctx.lineTo(x + Math.sin(dy * 0.03) * wobble, y0 + dy);
    }
    ctx.strokeStyle = `rgba(255,255,255,${0.03 + Math.random() * 0.06})`;
    ctx.lineWidth = 0.8 + Math.random() * 2;
    ctx.stroke();
  }
}

// 垂れる水滴 — 窓を伝うようにつーっと流れる（軌跡のみ）
const DRIP_WOBBLE = 0.08;
export default function FogOverlay() {
  const maskRef = useRef(null);
  const texRef = useRef(null);
  const fogRef = useRef(null);
  const lastTouchRef = useRef(0);
  const rafRef = useRef(null);
  const sizeRef = useRef({ w: 0, h: 0 });
  const dropletsRef = useRef(null);
  const dripsRef = useRef([]);        // アクティブな垂れ水滴リスト

  const setupCanvas = useCallback(() => {
    const mask = maskRef.current;
    const tex = texRef.current;
    if (!mask || !tex) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.ceil(window.innerWidth * dpr);
    const h = Math.ceil(window.innerHeight * dpr);

    for (const cvs of [mask, tex]) {
      cvs.width = w;
      cvs.height = h;
      cvs.style.width = window.innerWidth + "px";
      cvs.style.height = window.innerHeight + "px";
    }
    sizeRef.current = { w, h };

    fogRef.current = new Uint8Array(w * h);
    fogRef.current.fill(FOG_ALPHA);

    const offscreen = document.createElement("canvas");
    offscreen.width = w;
    offscreen.height = h;
    drawDroplets(offscreen.getContext("2d"), w, h);
    dropletsRef.current = offscreen;

    lastTouchRef.current = 0;
  }, []);

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
          const t = 1 - Math.sqrt(d2) / r;
          const idx = y * w + x;
          fog[idx] = Math.max(0, fog[idx] - Math.round(t * 200));
        }
      }
    }
    lastTouchRef.current = performance.now();
  }, []);

  useEffect(() => {
    setupCanvas();
    window.addEventListener("resize", setupCanvas);

    const render = () => {
      const mask = maskRef.current;
      const tex = texRef.current;
      const fog = fogRef.current;
      if (!mask || !tex || !fog) { rafRef.current = requestAnimationFrame(render); return; }
      const mctx = mask.getContext("2d");
      const tctx = tex.getContext("2d");
      const { w, h } = sizeRef.current;

      // re-fog
      const now = performance.now();
      const sinceTouch = now - lastTouchRef.current;
      if (lastTouchRef.current > 0 && sinceTouch > REFOG_DELAY) {
        const speed = Math.min(REFOG_SPEED * (1 + (sinceTouch - REFOG_DELAY) / 4000), 3.5);
        for (let i = 0, len = fog.length; i < len; i++) {
          if (fog[i] < FOG_ALPHA) fog[i] = Math.min(FOG_ALPHA, fog[i] + speed);
        }
      }

      // mask canvas — 白一色で alpha だけ変える (blurレイヤーのマスクとして使う)
      const imgData = mctx.createImageData(w, h);
      const data = imgData.data;
      for (let i = 0, len = fog.length; i < len; i++) {
        const off = i * 4;
        data[off] = 255;
        data[off + 1] = 255;
        data[off + 2] = 255;
        data[off + 3] = fog[i];
      }
      mctx.putImageData(imgData, 0, 0);

      // 垂れる水滴を更新
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const drips = dripsRef.current;
      const trailR = Math.round(5 * dpr);
      for (let i = drips.length - 1; i >= 0; i--) {
        const d = drips[i];
        // 止まり→じわっと動く→ツーッと流れる→また止まる
        if (d.paused > 0) {
          d.paused--;
        } else {
          const dy = d.vel;
          d.y += dy;
          d.x += Math.sin(d.y * 0.06 + d.phase) * DRIP_WOBBLE;
          d.dist += dy;
          // 加速 — つーっと流れる
          d.vel = Math.min(d.vel + 0.01, 1.8);
          // たまに止まる（頻度低め）
          if (Math.random() < 0.003) {
            d.paused = 10 + Math.floor(Math.random() * 25);
            d.vel = 0.15 + Math.random() * 0.2;
          }
        }
        // 軌跡で霧を消す
        const px = Math.round(d.x * dpr);
        const py = Math.round(d.y * dpr);
        const tr2 = trailR * trailR;
        const tx0 = Math.max(0, px - trailR);
        const tx1 = Math.min(w - 1, px + trailR);
        const ty0 = Math.max(0, py - trailR);
        const ty1 = Math.min(h - 1, py + trailR);
        for (let yy = ty0; yy <= ty1; yy++) {
          for (let xx = tx0; xx <= tx1; xx++) {
            if ((xx - px) * (xx - px) + (yy - py) * (yy - py) < tr2) {
              fog[yy * w + xx] = 0;
            }
          }
        }
        // 一定距離で消える（画面全部消さない）
        if (d.dist > d.maxDist) drips.splice(i, 1);
        else if (d.y > window.innerHeight + 20) drips.splice(i, 1);
      }

      // texture canvas — 静的水滴 + 垂れる水滴を描画
      tctx.clearRect(0, 0, w, h);
      if (dropletsRef.current) {
        tctx.drawImage(dropletsRef.current, 0, 0);
        tctx.globalCompositeOperation = "destination-in";
        tctx.drawImage(mask, 0, 0);
        tctx.globalCompositeOperation = "source-over";
      }


      rafRef.current = requestAnimationFrame(render);
    };
    rafRef.current = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", setupCanvas);
    };
  }, [setupCanvas]);

  // 全レイヤー pointer-events: none にして、
  // window レベルでタッチ座標を拾ってぬぐうだけ。
  // UIの操作（スクロール、タップ、長押し等）は一切邪魔しない。
  useEffect(() => {
    const onMove = (e) => {
      if (e.touches) {
        for (const t of e.touches) wipe(t.clientX, t.clientY);
      } else if (e.buttons > 0) {
        wipe(e.clientX, e.clientY);
      }
    };
    const onDown = (e) => {
      const x = e.touches ? e.touches[0]?.clientX : e.clientX;
      const y = e.touches ? e.touches[0]?.clientY : e.clientY;
      if (x != null && y != null) wipe(x, y);
    };
    const onUp = (e) => {
      const x = e.changedTouches ? e.changedTouches[0]?.clientX : e.clientX;
      const y = e.changedTouches ? e.changedTouches[0]?.clientY : e.clientY;
      if (x == null || y == null) return;
      // 指を離した地点から 1〜3 滴生成
      const count = 1 + Math.floor(Math.random() * 3);
      for (let i = 0; i < count; i++) {
        dripsRef.current.push({
          x: x + (Math.random() - 0.5) * 16,
          y: y + Math.random() * 4,
          vel: 0.1 + Math.random() * 0.2,
          phase: Math.random() * Math.PI * 2,
          paused: 10 + Math.floor(Math.random() * 20), // 最初少し溜まる
          dist: 0,
          maxDist: 150 + Math.random() * 250,
        });
      }
    };
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("touchstart", onDown, { passive: true });
    window.addEventListener("touchmove", onMove, { passive: true });
    window.addEventListener("touchend", onUp, { passive: true });
    return () => {
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("touchstart", onDown);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onUp);
    };
  }, [wipe]);

  const fixed = { position: "fixed", inset: 0 };

  return (
    <>
      {/* Layer 1: 白い霧マスク — うっすら透ける。ぬぐった所は alpha=0 で完全クリア */}
      <canvas ref={maskRef} style={{
        ...fixed,
        zIndex: 99989,
        pointerEvents: "none",
        opacity: 0.93,
        userSelect: "none",
        WebkitTouchCallout: "none",
      }} />
      {/* Layer 2: 水滴テクスチャ */}
      <canvas ref={texRef} style={{
        ...fixed,
        zIndex: 99990,
        pointerEvents: "none",
        userSelect: "none",
        WebkitTouchCallout: "none",
      }} />
    </>
  );
}
