import React from 'react';
import { AbsoluteFill, Img, staticFile } from 'remotion';
import { EASE_IN_OUT, ease } from './theme.js';

// 画面全体にかける効果：空の色・フィルムの粒子・黒帯・周辺減光・光・季節の舞い物

const hexRgb = (h) => {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const lerp = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
export const rgb = (c, a = 1) => (a === 1 ? `rgb(${c[0]},${c[1]},${c[2]})` : `rgba(${c[0]},${c[1]},${c[2]},${a})`);

// keys: [{ at, c: [上, 中, 下], blend? }]。キーの blend フレーム前（既定 30）から混ぜ始め、キーの 4 フレーム後に混ぜ終える
export const skyAt = (keys, f) => {
  const start = (k) => k.at - (k.blend ?? 30);
  let i = 0;
  while (i < keys.length - 1 && f >= start(keys[i + 1])) i++;
  const cur = keys[i];
  const prev = keys[i - 1];
  if (!prev) return cur.c.map(hexRgb);
  const t = ease(f, [start(cur), cur.at + 4], [0, 1], EASE_IN_OUT);
  return cur.c.map((c, k) => lerp(hexRgb(prev.c[k]), hexRgb(c), t));
};
export const lightOf = (c) => (0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]) / 255;

export const SkyFill = ({ f, keys }) => {
  const [a, b, c] = skyAt(keys, f);
  return <AbsoluteFill style={{ background: `linear-gradient(180deg, ${rgb(a)} 0%, ${rgb(b)} 56%, ${rgb(c)} 100%)` }} />;
};

// フィルムの粒子：512px の粒のタイルを、コマごとに別のものを別の位置で重ねる
export const Grain = ({ f, opacity = 0.07 }) => {
  const i = f % 8;
  const ox = (f * 137) % 512;
  const oy = (f * 251) % 512;
  return (
    <AbsoluteFill style={{
      backgroundImage: `url(${staticFile(`film/grain/g${i}.png`)})`, backgroundPosition: `${-ox}px ${-oy}px`,
      mixBlendMode: 'overlay', opacity, pointerEvents: 'none',
    }} />
  );
};

// 映画の黒帯（k = 0 なし 〜 1 で 2.39:1）
export const Letterbox = ({ k }) => {
  if (k <= 0) return null;
  const h = 138 * k;
  return (
    <>
      <div style={{ position: 'absolute', left: 0, right: 0, top: 0, height: h, background: '#000', zIndex: 900 }} />
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: h, background: '#000', zIndex: 900 }} />
    </>
  );
};

export const Vignette = ({ k = 0.5, color = '0,0,0' }) => (
  <AbsoluteFill style={{ background: `radial-gradient(ellipse 75% 70% at 50% 50%, rgba(${color},0) 55%, rgba(${color},${k}) 100%)`, pointerEvents: 'none' }} />
);

// 白い閃光（at で最大、len フレームで消える）
export const Flash = ({ f, at, len = 14, color = '#ffffff', peak = 1 }) => {
  const k = f < at - 2 ? 0 : f < at ? ease(f, [at - 2, at], [0, peak]) : ease(f, [at, at + len], [peak, 0]);
  if (k <= 0) return null;
  return <AbsoluteFill style={{ background: color, opacity: k, zIndex: 950, pointerEvents: 'none' }} />;
};

// やわらかい光のにじみ（左上から差す朝日など）
export const LightLeak = ({ k = 1, x = 0, y = 0, r = 1100, color = '255,214,170' }) => (
  k > 0 ? <div style={{
    position: 'absolute', left: x - r, top: y - r, width: r * 2, height: r * 2, borderRadius: '50%', pointerEvents: 'none',
    background: `radial-gradient(circle, rgba(${color},${0.55 * k}) 0%, rgba(${color},${0.22 * k}) 32%, rgba(${color},0) 68%)`, mixBlendMode: 'screen',
  }} /> : null
);

// ── 舞い物（花びら・葉・紅葉・雪・光の粒）─────────────────────
const rnd = (seed) => {
  let s = seed;
  return () => ((s = (s * 9301 + 49297) % 233280) / 233280);
};
const SHAPES = {
  // 桜の花びら（先が少し割れた楕円）
  petal: (c) => <path d="M0 -10 C 7 -9 9 0 5 8 C 3 11 1 9 0 7 C -1 9 -3 11 -5 8 C -9 0 -7 -9 0 -10 Z" fill={c} />,
  // 紅葉（5つに裂けた葉）
  maple: (c) => <path d="M0 -12 L3 -5 L10 -7 L6 -1 L11 3 L4 3 L5 10 L0 6 L-5 10 L-4 3 L-11 3 L-6 -1 L-10 -7 L-3 -5 Z" fill={c} />,
  // 若葉
  leaf: (c) => <path d="M0 -11 C 7 -6 7 5 0 11 C -7 5 -7 -6 0 -11 Z M0 -9 L0 9" fill={c} stroke="rgba(255,255,255,0.35)" strokeWidth="0.8" />,
  // 雪
  snow: (c) => <circle r="5" fill={c} />,
  // 光の粒（木漏れ日・提灯の火の粉）
  mote: (c) => <circle r="5" fill={c} />,
};

// kind: petal | maple | leaf | snow | mote。k: 濃さ（0〜1）。n: 数。fall: 落ちる速さ（px/フレーム）。wind: 横に流れる速さ
export const Drift = ({ f, kind = 'petal', n = 40, seed = 1, k = 1, colors, fall = 2.2, wind = 1.2, size = [10, 22], blur = true, area = [1920, 1080], z = 0 }) => {
  if (k <= 0) return null;
  const r = rnd(seed);
  const cols = colors || { petal: ['#f9c5d5', '#fbd6e1', '#f4a9c0', '#fde3ea'], maple: ['#e0562b', '#ee8a2f', '#c93a22', '#f2b13a'], leaf: ['#7cc47f', '#9bd38b', '#5fae6c'], snow: ['#ffffff'], mote: ['#fff4c8', '#ffe39a'] }[kind];
  const [AW, AH] = area;
  return (
    <svg width={AW} height={AH} style={{ position: 'absolute', left: 0, top: 0, pointerEvents: 'none', zIndex: z, overflow: 'visible' }}>
      {Array.from({ length: n }).map((_, i) => {
        const depth = r(); // 0 = 奥, 1 = 手前
        const s = size[0] + (size[1] - size[0]) * depth;
        const sp = 0.55 + 0.9 * depth;
        const x0 = r() * (AW + 400) - 200;
        const y0 = r() * (AH + 400) - 200;
        const ph = r() * Math.PI * 2;
        const spin = (r() - 0.5) * 6;
        const flip = 0.5 + 0.5 * r();
        const col = cols[Math.floor(r() * cols.length)];
        const span = AH + 400;
        let y = y0 + f * fall * sp;
        y = ((y + 200) % span + span) % span - 200;
        const wspan = AW + 400;
        let x = x0 + f * wind * sp + 40 * Math.sin(f / (26 + 14 * depth) + ph);
        x = ((x + 200) % wspan + wspan) % wspan - 200;
        const rot = f * spin + ph * 57;
        const sy = kind === 'snow' || kind === 'mote' ? 1 : Math.cos(f / (14 + 10 * flip) + ph);
        const op = kind === 'mote' ? (0.35 + 0.65 * (0.5 + 0.5 * Math.sin(f / 9 + ph))) * k : (0.55 + 0.45 * depth) * k;
        const bl = blur ? (depth > 0.85 ? (depth - 0.85) * 40 : depth < 0.2 ? (0.2 - depth) * 10 : 0) : 0;
        return (
          <g key={i} transform={`translate(${x} ${y}) rotate(${rot}) scale(${s / 20} ${(s / 20) * (0.35 + 0.65 * Math.abs(sy))})`} opacity={op} style={bl ? { filter: `blur(${bl.toFixed(1)}px)` } : undefined}>
            {SHAPES[kind](col)}
          </g>
        );
      })}
    </svg>
  );
};

// きらめき（4つの光の筋）。k: 0〜30 で光って消える
export const Sparkle = ({ x, y, k, s = 1, color = '#fff6dc' }) => {
  const a = Math.max(0, Math.sin((k / 30) * Math.PI));
  if (a <= 0) return null;
  const r = 22 * s * a;
  return (
    <svg width={r * 2 + 20} height={r * 2 + 20} style={{ position: 'absolute', left: x - r - 10, top: y - r - 10, opacity: a, filter: 'drop-shadow(0 0 8px rgba(255,230,180,0.9))', pointerEvents: 'none' }}>
      <path d={`M${r + 10} 10 Q${r + 13} ${r + 7} ${r * 2 + 10} ${r + 10} Q${r + 13} ${r + 13} ${r + 10} ${r * 2 + 10} Q${r + 7} ${r + 13} 10 ${r + 10} Q${r + 7} ${r + 7} ${r + 10} 10Z`} fill={color} />
    </svg>
  );
};

// 画像を貼るだけの小物
export const Pic = ({ src, style }) => <Img maxRetries={8} src={staticFile(src)} style={style} />;
