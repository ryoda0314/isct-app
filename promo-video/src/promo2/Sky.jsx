import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { BAR, EASE_IN_OUT, ease } from './theme2.js';
import { SKY, T2 } from './theme2.js';

// 時間帯で色が変わる空（夜明け → 朝 → 昼 → 夕方 → 工大祭の夜 → 夜 → 朝）。全編で共通の背景。
const hexRgb = (h) => {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const lerp = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
const rgb = (c) => `rgb(${c[0]},${c[1]},${c[2]})`;

export const skyAt = (f) => {
  // キーごとに blend フレーム前から混ぜ始め、キーの 6 フレーム後に混ぜ終える
  const start = (k) => k.at - (k.blend ?? 30);
  let i = 0;
  while (i < SKY.length - 1 && f >= start(SKY[i + 1])) i++;
  const cur = SKY[i];
  const prev = SKY[i - 1];
  if (!prev) return cur.c.map(hexRgb);
  const t = ease(f, [start(cur), cur.at + 6], [0, 1], EASE_IN_OUT);
  return cur.c.map((c, k) => lerp(hexRgb(prev.c[k]), hexRgb(c), t));
};

// 空の明るさ（0 = 夜, 1 = 昼）。文字色や星の出方に使う
export const skyLight = (f) => {
  const [top] = skyAt(f);
  return Math.max(0, Math.min(1, (0.299 * top[0] + 0.587 * top[1] + 0.114 * top[2] - 30) / 150));
};

const rnd = (seed) => {
  let s = seed;
  return () => ((s = (s * 9301 + 49297) % 233280) / 233280);
};
const STARS = (() => {
  const r = rnd(11);
  return Array.from({ length: 90 }, () => ({ x: r() * 1920, y: r() * 700, s: 1 + r() * 2.2, p: r() * 6.28, sp: 0.04 + r() * 0.08 }));
})();
const BOKEH = (() => {
  const r = rnd(29);
  return Array.from({ length: 26 }, () => ({ x: r() * 1920, y: 300 + r() * 900, s: 30 + r() * 110, p: r() * 6.28, v: 0.25 + r() * 0.6, h: r() }));
})();

// 工大祭の提灯（画面上部に弧を描いて並ぶ）
const Lanterns = ({ f, k }) => {
  if (k <= 0) return null;
  const n = 9;
  return (
    <svg width="1920" height="330" style={{ position: 'absolute', left: 0, top: 0, opacity: k }}>
      <defs>
        <radialGradient id="lanternGlow"><stop offset="0" stopColor="#ffb070" stopOpacity="0.55" /><stop offset="1" stopColor="#ffb070" stopOpacity="0" /></radialGradient>
      </defs>
      <path d={`M 520 -10 Q 1240 ${190 + 6 * Math.sin(f / 30)} 1960 20`} fill="none" stroke="rgba(40,20,30,0.55)" strokeWidth="3" />
      {Array.from({ length: n }).map((_, i) => {
        const u = (i + 0.5) / n;
        const x = 520 + 1440 * u;
        // 2次ベジェ（520,-10）→（1240,190）→（1960,20）の上の点
        const y = (1 - u) ** 2 * -10 + 2 * (1 - u) * u * (190 + 6 * Math.sin(f / 30)) + u * u * 20;
        const sway = 3 * Math.sin(f / 18 + i);
        const glow = 0.75 + 0.25 * Math.sin(f / 9 + i * 1.7);
        return (
          <g key={i} transform={`translate(${x} ${y}) rotate(${sway})`}>
            <circle cx="0" cy="34" r="70" fill="url(#lanternGlow)" opacity={glow} />
            <line x1="0" y1="0" x2="0" y2="10" stroke="rgba(40,20,30,0.6)" strokeWidth="2" />
            <rect x="-13" y="8" width="26" height="6" rx="2" fill="#3a2418" />
            <ellipse cx="0" cy="34" rx="21" ry="26" fill={i % 2 ? '#ff7b54' : '#ffb347'} opacity={0.92} />
            {[-14, -5, 5, 14].map((dy) => <line key={dy} x1="-19" y1={34 + dy} x2="19" y2={34 + dy} stroke="rgba(120,40,20,0.25)" strokeWidth="1.5" />)}
            <rect x="-13" y="56" width="26" height="6" rx="2" fill="#3a2418" />
          </g>
        );
      })}
    </svg>
  );
};

export const Sky = () => {
  const f = useCurrentFrame();
  const [top, mid, bot] = skyAt(f);
  const light = skyLight(f);
  const stars = Math.max(0, 1 - light * 2.2);
  // 小節頭でほんの少し明るく脈打つ（ベースが鳴っている区間だけ）
  const groove = f >= T2.logo && f < T2.end ? Math.exp(-((f - T2.logo) % BAR) / 7) * 0.05 : 0;
  const fest = ease(f, [T2.fest - 6, T2.fest + 30], [0, 1]) * (1 - ease(f, [T2.wall - 14, T2.wall + 4], [0, 1]));
  const wall = ease(f, [T2.wall - 10, T2.wall + 20], [0, 1]) * (1 - ease(f, [T2.end - 10, T2.end + 20], [0, 1]));
  // 夜明けと最後の朝の太陽
  const sun = Math.max(
    ease(f, [T2.lock, T2.unlock + 60], [0, 1]) * (1 - ease(f, [T2.logo + 40, T2.home], [0, 1])),
    ease(f, [T2.end, T2.end + 80], [0, 1]),
  );
  return (
    <AbsoluteFill style={{ background: `linear-gradient(180deg, ${rgb(top)} 0%, ${rgb(mid)} 58%, ${rgb(bot)} 100%)`, overflow: 'hidden' }}>
      {sun > 0 && (
        <div style={{
          position: 'absolute', left: 960 - 900, top: 1080 - 520, width: 1800, height: 1100, borderRadius: '50%',
          background: `radial-gradient(ellipse at 50% 50%, rgba(255,214,150,${0.55 * sun}) 0%, rgba(255,170,120,${0.25 * sun}) 35%, rgba(255,170,120,0) 70%)`,
        }} />
      )}
      {stars > 0.01 && STARS.map((s, i) => (
        <div key={i} style={{
          position: 'absolute', left: s.x, top: s.y, width: s.s, height: s.s, borderRadius: '50%', background: '#fff',
          opacity: stars * (0.35 + 0.65 * (0.5 + 0.5 * Math.sin(f * s.sp + s.p))),
        }} />
      ))}
      {/* 昼のやわらかい光（アイコンの3色） */}
      {light > 0.4 && [
        { c: '26,156,240', x: 300, y: 260, r: 700 },
        { c: '40,200,104', x: 1650, y: 320, r: 640 },
        { c: '242,210,28', x: 1050, y: 1000, r: 700 },
      ].map((b, i) => (
        <div key={i} style={{
          position: 'absolute', left: b.x + 120 * Math.sin(f / (90 + i * 15) + i * 2) - b.r, top: b.y + 70 * Math.cos(f / (110 + i * 12) + i) - b.r,
          width: b.r * 2, height: b.r * 2, borderRadius: '50%',
          background: `radial-gradient(circle, rgba(${b.c},${(0.13 + groove) * (light - 0.4) / 0.6}) 0%, rgba(${b.c},0) 68%)`,
        }} />
      ))}
      {/* 夜の壁：オーロラのようなにじみ */}
      {wall > 0 && [
        { c: '26,156,240', x: 420, y: 420, r: 760 },
        { c: '40,200,104', x: 1500, y: 360, r: 700 },
        { c: '242,210,28', x: 980, y: 980, r: 640 },
      ].map((b, i) => (
        <div key={`a${i}`} style={{
          position: 'absolute', left: b.x + 160 * Math.sin(f / 50 + i * 2) - b.r, top: b.y + 90 * Math.cos(f / 60 + i) - b.r,
          width: b.r * 2, height: b.r * 2, borderRadius: '50%',
          background: `radial-gradient(circle, rgba(${b.c},${0.22 * wall}) 0%, rgba(${b.c},0) 66%)`,
        }} />
      ))}
      {/* 工大祭：あたたかい玉ボケと提灯 */}
      {fest > 0 && BOKEH.map((b, i) => {
        const y = b.y - ((f - T2.fest) * b.v) % 1300;
        const col = b.h < 0.5 ? '255,170,90' : b.h < 0.8 ? '255,110,120' : '255,220,140';
        return (
          <div key={`b${i}`} style={{
            position: 'absolute', left: b.x + 30 * Math.sin(f / 40 + b.p) - b.s / 2, top: (y < -200 ? y + 1300 : y) - b.s / 2,
            width: b.s, height: b.s, borderRadius: '50%', filter: 'blur(2px)',
            background: `radial-gradient(circle, rgba(${col},${0.32 * fest}) 0%, rgba(${col},${0.12 * fest}) 55%, rgba(${col},0) 72%)`,
          }} />
        );
      })}
      <Lanterns f={f} k={fest} />
      {/* ごく薄い方眼（v1 と同じ質感）。夜は消える */}
      <AbsoluteFill style={{
        backgroundImage: 'radial-gradient(rgba(14,32,48,0.12) 1.2px, transparent 1.6px)', backgroundSize: '34px 34px',
        backgroundPosition: `${-f * 0.35}px ${-f * 0.2}px`, opacity: light,
        maskImage: 'radial-gradient(ellipse 75% 70% at 50% 50%, rgba(0,0,0,0.5), rgba(0,0,0,0) 100%)',
        WebkitMaskImage: 'radial-gradient(ellipse 75% 70% at 50% 50%, rgba(0,0,0,0.5), rgba(0,0,0,0) 100%)',
      }} />
    </AbsoluteFill>
  );
};
