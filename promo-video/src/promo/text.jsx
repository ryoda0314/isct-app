import React from 'react';
import { C, EASE_IN, GRAD_TEXT, ease, sp } from './theme.js';

const gradStyle = {
  backgroundImage: GRAD_TEXT, WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent',
};

// segs: 'テキスト' または [{ t: 'テキスト', grad: true }, ...]
const Segs = ({ segs }) => (typeof segs === 'string' ? segs : segs.map((s, i) => (
  <span key={i} style={s.grad ? gradStyle : s.color ? { color: s.color } : undefined}>{s.t}</span>
)));

// 行ごとにマスクの下からせり上がる見出し。exitAt からは上へ抜けていく。
export const Headline = ({ lines, f, d = 0, exitAt = Infinity, size = 104, align = 'left', color = C.txH, lineGap = 4, stagger = 4 }) => (
  <div style={{ textAlign: align }}>
    {lines.map((segs, i) => {
      const pin = sp(f, d + i * stagger, { damping: 20, stiffness: 140, mass: 0.9 });
      const pout = ease(f, [exitAt + i * 2, exitAt + i * 2 + 9], [0, 1], EASE_IN);
      const y = (1 - pin) * 112 - pout * 112;
      return (
        <div key={i} style={{ overflow: 'hidden', padding: '0.06em 0 0.14em', marginBottom: lineGap - size * 0.2 }}>
          <div style={{
            fontSize: size, fontWeight: 900, lineHeight: 1.12, letterSpacing: '-0.02em', color,
            transform: `translateY(${y}%)`, whiteSpace: 'nowrap',
          }}>
            <Segs segs={segs} />
          </div>
        </div>
      );
    })}
  </div>
);

export const SubCopy = ({ text, f, d = 0, exitAt = Infinity, size = 30, align = 'left', color = C.tx }) => {
  const pin = sp(f, d, { damping: 22, stiffness: 120 });
  const out = ease(f, [exitAt, exitAt + 8], [0, 1], EASE_IN);
  return (
    <div style={{
      fontSize: size, fontWeight: 500, lineHeight: 1.65, color, textAlign: align, whiteSpace: 'pre-line',
      opacity: ease(f, [d, d + 10], [0, 1]) * (1 - out), transform: `translateY(${(1 - pin) * 24 - out * 20}px)`,
    }}>{text}</div>
  );
};

// 「01 — HOME」のような章ラベル
export const ChapterLabel = ({ num, label, f, d = 0, exitAt = Infinity, align = 'left' }) => {
  const p = sp(f, d, { damping: 20, stiffness: 150 });
  const out = ease(f, [exitAt, exitAt + 8], [0, 1], EASE_IN);
  const lineW = 54 * ease(f, [d + 2, d + 14], [0, 1]);
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 14, justifyContent: align === 'right' ? 'flex-end' : 'flex-start',
      opacity: ease(f, [d, d + 6], [0, 1]) * (1 - out), transform: `translateX(${(1 - p) * -24}px)`,
    }}>
      <span style={{ fontSize: 26, fontWeight: 900, letterSpacing: '0.02em', ...gradStyle }}>{num}</span>
      <span style={{ width: lineW, height: 2.5, borderRadius: 2, background: C.bdL }} />
      <span style={{ fontSize: 19, fontWeight: 800, letterSpacing: '0.28em', color: C.txD }}>{label}</span>
    </div>
  );
};

// グラデーション見出しを1文字ずつ分けると文字ごとに色が巻き戻るので、
// 文字位置に応じた単色を割り当てて全体でグラデーションに見せる。
const RAMP = [[10, 141, 228], [19, 178, 106], [111, 181, 21]];
const rampColor = (t) => {
  const x = Math.max(0, Math.min(1, t)) * (RAMP.length - 1);
  const i = Math.min(RAMP.length - 2, Math.floor(x));
  const k = x - i;
  const c = RAMP[i].map((v, j) => Math.round(v + (RAMP[i + 1][j] - v) * k));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
};

// 1文字ずつ弾んで出るタイポ（フック・ロゴ登場用）
export const CharPop = ({ segs, f, d = 0, stagger = 1.4, size = 96, exitAt = Infinity, color = C.txH, weight = 900 }) => {
  const flat = [];
  (typeof segs === 'string' ? [{ t: segs }] : segs).forEach((s) => {
    const chars = [...s.t];
    chars.forEach((ch, k) => flat.push({ ch, s, k: chars.length > 1 ? k / (chars.length - 1) : 0 }));
  });
  return (
    <div style={{ fontSize: size, fontWeight: weight, letterSpacing: '-0.02em', lineHeight: 1.15, whiteSpace: 'nowrap', color }}>
      {flat.map(({ ch, s, k }, i) => {
        const p = sp(f, d + i * stagger, { damping: 12, stiffness: 200, mass: 0.7 });
        const out = ease(f, [exitAt + i * 0.6, exitAt + i * 0.6 + 7], [0, 1], EASE_IN);
        const style = s.grad ? { color: rampColor(k) } : s.color ? { color: s.color } : {};
        return (
          <span key={i} style={{
            display: 'inline-block', ...style,
            opacity: Math.min(1, p * 1.6) * (1 - out),
            transform: `translateY(${(1 - p) * 0.55 * size - out * 0.4 * size}px) scale(${0.5 + 0.5 * p})`,
          }}>{ch}</span>
        );
      })}
    </div>
  );
};
