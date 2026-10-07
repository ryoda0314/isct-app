import React from 'react';
import { C, alpha, ease, sp } from '../theme.js';
import { STATUS_H, TAB_H } from '../Phone.jsx';

// ステータスバーとタブバーの間（＝アプリの本文領域）
export const Body = ({ children, style }) => (
  <div style={{ position: 'absolute', top: STATUS_H, left: 0, right: 0, bottom: TAB_H, overflow: 'hidden', ...style }}>
    {children}
  </div>
);

// 下からふわっと出てくる（f: 画面のローカルフレーム, d: 遅延）
export const rise = (f, d, dist = 26) => {
  const p = sp(f, d, { damping: 20, stiffness: 150 });
  return { opacity: ease(f, [d, d + 8], [0, 1]), transform: `translateY(${(1 - p) * dist}px)` };
};

export const pop = (f, d, from = 0.6) => {
  const p = sp(f, d, { damping: 13, stiffness: 190 });
  return { opacity: ease(f, [d, d + 5], [0, 1]), transform: `scale(${from + (1 - from) * p})` };
};

export const Tag = ({ text, col, style }) => (
  <span style={{
    display: 'inline-block', padding: '2px 8px', borderRadius: 7, background: alpha(col, 0.12), color: col,
    fontSize: 12, fontWeight: 700, letterSpacing: '0.01em', ...style,
  }}>{text}</span>
);

export const SectionTitle = ({ title, link, style }) => (
  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '0 2px 8px', ...style }}>
    <div style={{ fontSize: 16, fontWeight: 800, color: C.txH }}>{title}</div>
    {link && <div style={{ fontSize: 12, fontWeight: 600, color: C.accent }}>{link} →</div>}
  </div>
);
