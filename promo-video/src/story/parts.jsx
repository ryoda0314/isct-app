import React from 'react';
import { AbsoluteFill, Audio, Sequence, staticFile } from 'remotion';
import { C, EASE_IN, EASE_IN_OUT, ease, mix, sp } from './theme.js';
import { Headline, SubCopy } from '../promo/text.jsx';
import { ShotCrop } from '../promo2/Device.jsx';

// 縦動画（ストーリー用）で使い回す部品：背景・見出し・ラベル・浮き上がるカード・シール・きらめき・曲

// ── 背景：場面ごとの3色のグラデーション（keys: [{ at, c: [上, 中, 下], dark? }]）を、切り替わりの前後で混ぜる ──
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const mixHex = (a, b, k) => {
  const x = hex(a);
  const y = hex(b);
  return `rgb(${x.map((v, i) => Math.round(v + (y[i] - v) * k)).join(',')})`;
};
export const bgAt = (keys, f, blend = 10) => {
  let i = 0;
  while (i + 1 < keys.length && f >= keys[i + 1].at - blend) i++;
  const cur = keys[i];
  const prev = keys[i - 1];
  const k = prev ? ease(f, [cur.at - blend, cur.at + 2], [0, 1], EASE_IN_OUT) : 1;
  const c = cur.c.map((col, j) => (prev ? mixHex(prev.c[j], col, k) : mixHex(col, col, 1)));
  const dark = prev ? (k > 0.5 ? !!cur.dark : !!prev.dark) : !!cur.dark;
  return { c, dark, glow: prev ? mix(prev.dark ? 1 : 0, cur.dark ? 1 : 0, k) : cur.dark ? 1 : 0 };
};

export const Background = ({ f, keys }) => {
  const { c, glow } = bgAt(keys, f);
  return (
    <AbsoluteFill style={{ background: `linear-gradient(180deg, ${c[0]} 0%, ${c[1]} 56%, ${c[2]} 100%)` }}>
      {/* やわらかい光の玉（ゆっくり漂う） */}
      <div style={{
        position: 'absolute', left: 540 + 260 * Math.sin(f / 70) - 520, top: 520 + 120 * Math.cos(f / 55) - 520, width: 1040, height: 1040, borderRadius: '50%',
        background: `radial-gradient(circle, rgba(255,255,255,${0.42 - 0.3 * glow}) 0%, rgba(255,255,255,0) 62%)`,
      }} />
      <div style={{
        position: 'absolute', left: 540 - 300 * Math.sin(f / 60) - 600, top: 1500 + 90 * Math.sin(f / 45) - 600, width: 1200, height: 1200, borderRadius: '50%',
        background: `radial-gradient(circle, rgba(255,255,255,${0.32 - 0.24 * glow}) 0%, rgba(255,255,255,0) 60%)`,
      }} />
    </AbsoluteFill>
  );
};

// ── 見出し（画面の上のほう。ストーリーの表示で隠れない位置）──
export const Caption = ({ g, lines, sub, exitAt = 40, size = 108, light = false, top = 318, d = 1 }) => (
  <div style={{ position: 'absolute', left: 0, right: 0, top, zIndex: 50 }}>
    <Headline lines={lines} f={g} d={d} exitAt={exitAt} size={size} align="center" color={light ? '#ffffff' : C.txH} stagger={3} />
    {sub && (
      <div style={{ marginTop: 14 }}>
        <SubCopy text={sub} f={g} d={d + 7} exitAt={exitAt - 2} size={32} align="center" color={light ? 'rgba(255,255,255,0.86)' : C.tx} />
      </div>
    )}
  </div>
);

// 小さなラベル（アプリ名・機能名など）
export const Pill = ({ g, d = 0, exitAt = Infinity, children, top, bg = 'rgba(255,255,255,0.92)', color = C.txH }) => {
  const p = sp(g, d, { damping: 14, stiffness: 190 });
  const out = ease(g, [exitAt, exitAt + 8], [0, 1], EASE_IN);
  return (
    <div style={{ position: 'absolute', left: 0, right: 0, top, display: 'flex', justifyContent: 'center', zIndex: 55 }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12, padding: '10px 22px 10px 12px', borderRadius: 40, background: bg, color,
        boxShadow: '0 14px 30px -18px rgba(14,32,48,0.45)', fontSize: 30, fontWeight: 800, letterSpacing: '0.01em',
        opacity: Math.min(1, p * 1.5) * (1 - out), transform: `translateY(${(1 - p) * 20 - out * 16}px) scale(${0.8 + 0.2 * p})`,
      }}>{children}</div>
    </div>
  );
};

// 画面から浮き上がるカード（スクショの一部を切り出す）
export const Lift = ({ f, at, until, name, crop, x, y, scale = 1.5, from = [0, 60], tilt = 0 }) => {
  if (f < at - 1 || f > until + 10) return null;
  const p = sp(f, at, { damping: 14, stiffness: 160 });
  const out = ease(f, [until, until + 8], [0, 1], EASE_IN);
  return (
    <div style={{
      position: 'absolute', left: x, top: y, zIndex: 40, opacity: Math.min(1, p * 1.6) * (1 - out),
      transform: `translate(${(1 - p) * from[0]}px, ${(1 - p) * from[1]}px) rotate(${tilt * (1 - p)}deg) scale(${0.8 + 0.2 * p - 0.06 * out})`,
      filter: 'drop-shadow(0 30px 30px rgba(14,32,48,0.28)) drop-shadow(0 6px 10px rgba(14,32,48,0.12))',
    }}>
      <ShotCrop name={name} {...crop} scale={scale} radius={18} />
    </div>
  );
};

// 斜めに貼るシール（「NEW」など）
export const NewBadge = ({ g, d = 6, x, y, exitAt = Infinity, text = 'NEW', bg = '#ffd43b', color = '#0e2030', size = 34 }) => {
  const p = sp(g, d, { damping: 9, stiffness: 220, mass: 0.7 });
  const out = ease(g, [exitAt, exitAt + 8], [0, 1], EASE_IN);
  return (
    <div style={{
      position: 'absolute', left: x, top: y, zIndex: 60, padding: '10px 18px', borderRadius: 14, background: bg, color,
      fontSize: size, fontWeight: 900, letterSpacing: '0.06em', boxShadow: '0 12px 24px -12px rgba(14,32,48,0.5)', whiteSpace: 'nowrap',
      opacity: Math.min(1, p * 2) * (1 - out), transform: `rotate(${mix(-40, -10, p) + 12 * out}deg) scale(${p * (1 - 0.3 * out)})`,
    }}>{text}</div>
  );
};

// 工大祭のテーマ「Sparkle」にちなんだ、きらめき（k: 0〜30 で光って消える）
export const Sparkle = ({ x, y, k, s = 1 }) => {
  const a = Math.max(0, Math.sin((k / 30) * Math.PI));
  if (a <= 0) return null;
  const r = 22 * s * a;
  return (
    <svg width={r * 2 + 20} height={r * 2 + 20} style={{ position: 'absolute', left: x - r - 10, top: y - r - 10, opacity: a, filter: 'drop-shadow(0 0 8px rgba(255,220,160,0.9))' }}>
      <path d={`M${r + 10} 10 Q${r + 13} ${r + 7} ${r * 2 + 10} ${r + 10} Q${r + 13} ${r + 13} ${r + 10} ${r * 2 + 10} Q${r + 7} ${r + 13} 10 ${r + 10} Q${r + 7} ${r + 7} ${r + 10} 10Z`} fill="#fff6dc" />
    </svg>
  );
};

// ── 曲：2か所をつなぎ（2 フレームの等パワーで入れ替え）、効果音の間だけ少し下げる ──
// song: { file, partA: { from, until }, partB: { from, at } }、sfx: [{ src, at, volume, duck, len }]
export const SongTrack = ({ song, sfx, volume = 0.8 }) => {
  const XF = 2;
  const ducking = (fr) => sfx.reduce((m, s) => {
    if (!s.duck) return m;
    const k = Math.min(ease(fr, [s.at - 3, s.at + 2], [0, 1]), 1 - ease(fr, [s.at + s.len, s.at + s.len + 8], [0, 1]));
    return Math.max(m, s.duck * k);
  }, 0);
  const xfade = (fr) => ease(fr, [song.partA.until - XF / 2, song.partA.until + XF / 2], [0, 1], (x) => x);
  const volA = (fr) => volume * ease(fr, [0, 3], [0, 1]) * Math.cos((xfade(fr) * Math.PI) / 2) * (1 - ducking(fr));
  const volB = (fr) => {
    const g = fr + song.partB.at;
    return volume * Math.sin((xfade(g) * Math.PI) / 2) * (1 - ducking(g));
  };
  return (
    <>
      <Sequence from={0} durationInFrames={song.partA.until + XF}>
        <Audio src={staticFile(song.file)} trimBefore={song.partA.from} volume={volA} />
      </Sequence>
      <Sequence from={song.partB.at}>
        <Audio src={staticFile(song.file)} trimBefore={song.partB.from - (song.partA.until - song.partB.at)} volume={volB} />
      </Sequence>
      {sfx.map((s) => (
        <Sequence key={`${s.src}${s.at}`} from={s.at} durationInFrames={45}>
          <Audio src={staticFile(s.src)} volume={s.volume} />
        </Sequence>
      ))}
    </>
  );
};
