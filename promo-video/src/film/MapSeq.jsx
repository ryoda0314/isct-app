import React from 'react';
import { Img, staticFile } from 'remotion';
import { EASE_IN, EASE_OUT, ease } from './theme.js';
import HERO from './maps/hero.json';
import ROUTE from './maps/route.json';
import NIGHT from './maps/night.json';
import WINTER from './maps/winter.json';

// 3Dキャンパスの連番（capture/capture_film.mjs で、アプリの地図を1コマずつ動かして撮ったもの）。
// 連番のファイル名は動画のフレーム番号なので、f をそのまま渡せば撮ったときのカメラの動きになる。
const SEQ = { hero: HERO, route: ROUTE, night: NIGHT, winter: WINTER };

const frameOf = (name, f) => {
  const s = SEQ[name];
  const g = Math.max(s.f0, Math.min(s.f1, Math.round(f)));
  return { s, g, fr: s.frames[g - s.f0] };
};

// 建物の名前（アプリのラベルの位置＝屋上）の画面上の位置。見えていなければ null
export const labelPos = (name, f, label) => {
  const { s, fr } = frameOf(name, f);
  const idx = s.names.indexOf(label);
  const e = fr?.l.find(([i]) => i === idx);
  return e ? [e[1], e[2]] : null;
};
// 撮影時に指定した地点（工大祭の提灯など）の画面上の位置
export const pointPos = (name, f, id) => frameOf(name, f).fr?.p?.[id] || null;
// ルートの先端の画面上の位置と、どこまで伸びたか（0〜1）
export const routeHead = (f) => {
  const { fr } = frameOf('route', f);
  return fr ? { h: fr.h, s: fr.s } : null;
};

export const MapSeq = ({ name, f, style }) => {
  const { g } = frameOf(name, f);
  return (
    <Img maxRetries={8} src={staticFile(`film/map/${name}/${String(g).padStart(4, '0')}.jpg`)}
      style={{ position: 'absolute', left: 0, top: 0, width: 1920, height: 1080, ...style }} />
  );
};

// 地図の上に立てる名前の札：屋上の点から細い線が伸び、その上に名前（と英語）が出る
export const MapTag = ({ seq, f, label, title, en, d, until = Infinity, ink = '#0e2030', sub = '#5b7a94', accent = '#1a9cf0', lift = 74, big = false }) => {
  const pos = labelPos(seq, f, label);
  if (!pos || f < d - 1 || f > until + 12) return null;
  const p = ease(f, [d, d + 16], [0, 1], EASE_OUT);
  const o = ease(f, [until, until + 10], [0, 1], EASE_IN);
  const k = p * (1 - o);
  const [x, y] = pos;
  const L = lift * ease(f, [d, d + 14], [0, 1], EASE_OUT);
  return (
    <div style={{ position: 'absolute', left: x, top: y, width: 0, height: 0, opacity: k, zIndex: 40 }}>
      <div style={{ position: 'absolute', left: -6, top: -6, width: 12, height: 12, borderRadius: 6, background: accent, boxShadow: `0 0 0 ${4 + 6 * (1 - p)}px ${accent}33, 0 0 18px ${accent}` }} />
      <div style={{ position: 'absolute', left: -1, top: -L, width: 2, height: L, background: `linear-gradient(to top, ${accent}, ${accent}00)` }} />
      <div style={{
        position: 'absolute', left: 0, top: -L - 8, transform: `translate(-50%, -100%) translateY(${(1 - p) * 10}px)`, textAlign: 'center', whiteSpace: 'nowrap',
        padding: big ? '12px 22px 13px' : '9px 16px 10px', borderRadius: 14, background: 'rgba(255,255,255,0.86)', backdropFilter: 'blur(6px)',
        boxShadow: '0 14px 30px -14px rgba(14,32,48,0.45)',
      }}>
        <div style={{ fontSize: big ? 34 : 24, fontWeight: 800, color: ink, letterSpacing: '-0.01em', lineHeight: 1.15 }}>{title || label}</div>
        {en && <div style={{ fontSize: big ? 14 : 12, fontWeight: 700, color: sub, letterSpacing: '0.24em', marginTop: 3 }}>{en}</div>}
      </div>
    </div>
  );
};
