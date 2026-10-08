import React from 'react';
import { CLOCK, EASE_IN, EASE_OUT, T2, ease, sp } from './theme2.js';
import { GRAD_TEXT } from '../promo/theme.js';

// 左上の時計。場面が変わるたびに数字が下から入れ替わる
const LABEL = { WED: '水曜日', SAT: '土曜日' };

export const ClockHud = ({ f, ink = '#0e2030', sub = '#5b7a94' }) => {
  const start = CLOCK[0].at;
  const end = T2.wall;
  if (f < start - 10 || f >= end + 10) return null;
  let i = 0;
  while (i < CLOCK.length - 1 && f >= CLOCK[i + 1].at - 6) i++;
  const inP = sp(f, start - 4, { damping: 18, stiffness: 160 });
  const out = ease(f, [end - 8, end + 4], [0, 1], EASE_IN);
  return (
    <div style={{
      position: 'absolute', left: 150, top: 92, height: 120, zIndex: 50,
      opacity: Math.min(1, inP * 1.5) * (1 - out), transform: `translateY(${(1 - inP) * -20}px)`,
    }}>
      {CLOCK.map((c, k) => {
        if (k < i - 1 || k > i) return null;
        // k === i が今の表示、k === i - 1 は上へ抜けていく前の表示
        const change = CLOCK[k + 1] ? CLOCK[k + 1].at - 6 : Infinity;
        const enter = k === 0 ? 1 : ease(f, [c.at - 6, c.at + 6], [0, 1], EASE_OUT);
        const leave = ease(f, [change, change + 10], [0, 1], EASE_IN);
        return (
          <div key={k} style={{
            position: 'absolute', left: 0, top: 0, whiteSpace: 'nowrap', display: 'flex', alignItems: 'flex-end', gap: 16,
            opacity: enter * (1 - leave), transform: `translateY(${(1 - enter) * 40 - leave * 40}px)`,
          }}>
            <span style={{ fontSize: 86, fontWeight: 300, letterSpacing: '-0.03em', lineHeight: 1, color: ink, fontVariantNumeric: 'tabular-nums' }}>{c.t}</span>
            <span style={{ marginBottom: 10, display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span style={{ fontSize: 16, fontWeight: 900, letterSpacing: '0.18em', backgroundImage: GRAD_TEXT, WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}>{c.s}</span>
              <span style={{ fontSize: 15, fontWeight: 700, color: sub }}>{c.label || LABEL[c.s]}</span>
            </span>
          </div>
        );
      })}
    </div>
  );
};
