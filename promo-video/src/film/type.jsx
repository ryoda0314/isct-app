import React from 'react';
import { EASE_IN, EASE_OUT, ease } from './theme.js';

// 文字の出し方（最高傑作版）。1文字ずつ、ぼかしの中から浮かび上がって、抜けるときはまたぼけて消える。

// グラデーションの見出しは、文字の位置に応じた単色を割り当てて全体でグラデーションに見せる
// （1文字ずつ要素を分けると、文字ごとに背景のグラデーションが巻き戻るため）
export const BRAND = [[10, 141, 228], [19, 178, 106], [111, 181, 21]];
const ramp = (stops, t) => {
  const x = Math.max(0, Math.min(1, t)) * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(x));
  const k = x - i;
  const c = stops[i].map((v, j) => Math.round(v + (stops[i + 1][j] - v) * k));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
};

// segs: '文字列' か [{ t, grad?: true | stops[], color? }]
const flatten = (segs) => {
  const out = [];
  (typeof segs === 'string' ? [{ t: segs }] : segs).forEach((s) => {
    const chars = [...s.t];
    chars.forEach((ch, k) => out.push({ ch, s, k: chars.length > 1 ? k / (chars.length - 1) : 0 }));
  });
  return out;
};

export const Rise = ({
  segs, f, d = 0, exitAt = Infinity, size = 110, weight = 900, color = '#0e2030', stagger = 1.3, dur = 18,
  track = '-0.02em', blur = 16, rise = 0.32, glow = null, style,
}) => {
  const chars = flatten(segs);
  return (
    <div style={{ fontSize: size, fontWeight: weight, letterSpacing: track, lineHeight: 1.2, whiteSpace: 'nowrap', color, ...style }}>
      {chars.map(({ ch, s, k }, i) => {
        const p = ease(f, [d + i * stagger, d + i * stagger + dur], [0, 1], EASE_OUT);
        const o = ease(f, [exitAt + i * 0.6, exitAt + i * 0.6 + 12], [0, 1], EASE_IN);
        const col = s.grad ? ramp(Array.isArray(s.grad) ? s.grad : BRAND, k) : s.color;
        const b = (1 - p) * blur + o * blur;
        return (
          <span key={i} style={{
            display: 'inline-block', color: col, whiteSpace: 'pre',
            opacity: p * (1 - o), filter: b > 0.2 ? `blur(${b.toFixed(1)}px)` : undefined,
            transform: `translateY(${((1 - p) * rise - o * rise * 0.6) * size}px)`,
            textShadow: glow || undefined,
          }}>{ch}</span>
        );
      })}
    </div>
  );
};

// 英語の小さな添え字（字間を大きく空けた大文字）。line: 左に短い線を引く
export const Caps = ({ text, f, d = 0, exitAt = Infinity, size = 19, color = '#7898b0', track = '0.34em', weight = 700, line = false, align = 'left' }) => {
  const p = ease(f, [d, d + 18], [0, 1], EASE_OUT);
  const o = ease(f, [exitAt, exitAt + 10], [0, 1], EASE_IN);
  const lw = 46 * ease(f, [d + 2, d + 20], [0, 1], EASE_OUT);
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 14, justifyContent: align === 'center' ? 'center' : align === 'right' ? 'flex-end' : 'flex-start',
      opacity: p * (1 - o), transform: `translateY(${(1 - p) * 10}px)`, filter: o > 0 ? `blur(${o * 6}px)` : undefined,
    }}>
      {line && <span style={{ width: lw, height: 2, borderRadius: 1, background: color, opacity: 0.7 }} />}
      <span style={{ fontSize: size, fontWeight: weight, letterSpacing: track, color, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{text}</span>
    </div>
  );
};

// ふつうの文（説明文）。行ごとに少し遅れて出る
export const Body = ({ text, f, d = 0, exitAt = Infinity, size = 30, color = '#3a5870', weight = 500, align = 'left', lineHeight = 1.7 }) => (
  <div style={{ textAlign: align }}>
    {text.split('\n').map((line, i) => {
      const p = ease(f, [d + i * 4, d + i * 4 + 16], [0, 1], EASE_OUT);
      const o = ease(f, [exitAt, exitAt + 10], [0, 1], EASE_IN);
      return (
        <div key={i} style={{
          fontSize: size, fontWeight: weight, lineHeight, color, whiteSpace: 'nowrap',
          opacity: p * (1 - o), transform: `translateY(${(1 - p) * 14}px)`, filter: o > 0 ? `blur(${o * 6}px)` : undefined,
        }}>{line}</div>
      );
    })}
  </div>
);

// 見出し＋英語の添え字＋説明文のまとまり
export const Block = ({ f, d = 0, exitAt = Infinity, en, lines, body, size = 104, ink = '#0e2030', sub = '#7898b0', align = 'left', gap = 18, lineGap = 0, bodySize = 30 }) => (
  <div style={{ display: 'flex', flexDirection: 'column', alignItems: align === 'center' ? 'center' : align === 'right' ? 'flex-end' : 'flex-start', gap }}>
    {en && <Caps text={en} f={f} d={d} exitAt={exitAt} color={sub} line={align !== 'center'} align={align} />}
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'inherit', gap: lineGap }}>
      {lines.map((segs, i) => (
        <Rise key={i} segs={segs} f={f} d={d + 4 + i * 7} exitAt={exitAt + i * 2} size={size} color={ink} />
      ))}
    </div>
    {body && <Body text={body} f={f} d={d + 14 + lines.length * 6} exitAt={exitAt} size={bodySize} color={sub} align={align} />}
  </div>
);
