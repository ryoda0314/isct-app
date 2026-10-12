import React from 'react';
import { AbsoluteFill, Img, staticFile } from 'remotion';
import { EASE_IN, EASE_IN_OUT, EASE_OUT, ease, mix, sp } from '../promo/theme.js';
import { STATUS_H } from '../promo/Phone.jsx';

// ずんだもんの紹介映像の部品：背景・字幕・章のバッジ・章の幕・テロップ・画面の中の囲み・通知・道しるべ
export const ZC = {
  green: '#7cc242', deep: '#2f5b1f', leaf: '#a6e36b', cream: '#fffaf0', mint: '#e7f7dc', ink: '#24361a', pink: '#ff8fab', purple: '#b48ad8', app: '#28c868',
};

// 背景：クリームからミントへ。枝豆のさやがゆっくり漂う（gloom: 冒頭の迷子の場面は少しくすませる）
const POD = (
  <svg width="120" height="60" viewBox="0 0 120 60">
    <path d="M6 34 C10 10 40 4 60 10 C82 4 112 10 114 30 C112 52 82 58 60 50 C40 58 8 54 6 34 Z" fill="#b7e58a" stroke="#86c65a" strokeWidth="3" />
    <circle cx="34" cy="31" r="11" fill="#d6f5b2" /><circle cx="60" cy="30" r="11" fill="#d6f5b2" /><circle cx="86" cy="31" r="11" fill="#d6f5b2" />
  </svg>
);
const PODS = Array.from({ length: 16 }, (_, i) => {
  const r = (n) => ((Math.sin(i * 97.3 + n * 13.1) + 1) / 2);
  return { x: r(1) * 1920, y: r(2) * 1080, s: 0.5 + r(3) * 0.8, rot: r(4) * 360, sp: 0.15 + r(5) * 0.35, ph: r(6) * 6.28 };
});
export const Background = ({ f, gloom = 0 }) => (
  <AbsoluteFill style={{ background: `linear-gradient(135deg, ${ZC.cream} 0%, #f6fbe8 45%, ${ZC.mint} 100%)`, overflow: 'hidden' }}>
    {/* 水玉 */}
    <AbsoluteFill style={{ backgroundImage: 'radial-gradient(circle, rgba(124,194,66,0.13) 3px, transparent 3.5px)', backgroundSize: '44px 44px', backgroundPosition: `${(f * 0.4) % 44}px ${(f * 0.25) % 44}px` }} />
    {PODS.map((p, i) => (
      <div key={i} style={{
        position: 'absolute', left: ((p.x + f * p.sp * 2) % 2100) - 120, top: p.y + 18 * Math.sin(f / 50 + p.ph), opacity: 0.32,
        transform: `rotate(${p.rot + f * p.sp * 0.6}deg) scale(${p.s})`,
      }}>{POD}</div>
    ))}
    {gloom > 0 && <AbsoluteFill style={{ background: 'linear-gradient(180deg, #6f7a8c 0%, #9aa3b4 100%)', opacity: 0.55 * gloom }} />}
  </AbsoluteFill>
);

// 字幕：白い太字に濃い緑のふち。行の頭でぽんっと出る
export const Subtitle = ({ f, line, x = 700, y = 968, maxW = 1240 }) => {
  if (!line) return null;
  const k = f - line.at;
  if (k < -1 || f > line.end + 6) return null;
  const pin = ease(k, [0, 6], [0, 1], EASE_OUT);
  const out = ease(f, [line.end + 1, line.end + 6], [0, 1], EASE_IN);
  const lines = line.text.split('\n');
  const size = lines.some((l) => l.length > 21) ? 46 : 52;
  return (
    <div style={{ position: 'absolute', left: x - maxW / 2, top: y - (lines.length - 1) * size * 0.62, width: maxW, display: 'flex', flexDirection: 'column', alignItems: 'center', zIndex: 80, opacity: 1 - out, transform: `translateY(${(1 - pin) * 14}px) scale(${0.94 + 0.06 * pin})` }}>
      {lines.map((t, i) => (
        <div key={i} style={{
          fontSize: size, fontWeight: 900, lineHeight: 1.22, color: '#ffffff', letterSpacing: '0.02em', whiteSpace: 'nowrap',
          WebkitTextStroke: `${size * 0.22}px ${ZC.deep}`, paintOrder: 'stroke fill', textShadow: '0 6px 0 rgba(47,91,31,0.35), 0 10px 24px rgba(0,0,0,0.18)',
        }}>{t}</div>
      ))}
    </div>
  );
};

// 章のバッジ（左上）：番号と名前。場面のあいだずっと出ている
export const ChapterBadge = ({ f, no, title, start, end }) => {
  const k = ease(f, [start + 10, start + 24], [0, 1], EASE_OUT);
  const out = ease(f, [end - 8, end], [0, 1], EASE_IN);
  if (k <= 0 || out >= 1) return null;
  return (
    <div style={{ position: 'absolute', left: 52, top: 40, display: 'flex', alignItems: 'center', gap: 16, zIndex: 70, opacity: 1 - out, transform: `translateX(${(1 - k) * -60}px)` }}>
      <div style={{ width: 74, height: 74, borderRadius: 37, background: ZC.green, color: '#fff', fontSize: 34, fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: `0 6px 0 ${ZC.deep}` }}>
        {String(no).padStart(2, '0')}
      </div>
      <div style={{ fontSize: 48, fontWeight: 900, color: ZC.ink, letterSpacing: '0.02em', WebkitTextStroke: '10px #ffffff', paintOrder: 'stroke fill' }}>{title}</div>
    </div>
  );
};

// 章の幕：緑の幕が右から左へ通り過ぎ、真ん中で章の番号と名前を見せる（この間に場面が替わる）
// 幕の形（SVG の座標。幅 2400）：入ってくる側（左）と出ていく側（右）の縁を、どちらも波にする。
// 左の縁は x = 40〜200、右の縁は x = 2180〜2340 の間で波打つ
const WIPE_LEAD = 'M140 0 C60 180 200 360 120 540 C40 720 200 900 140 1080';
const WIPE_TRAIL = 'M2260 1080 C2340 900 2180 720 2260 540 C2340 360 2180 180 2260 0';
const WIPE_FILL = `${WIPE_LEAD} L2260 1080 C2340 900 2180 720 2260 540 C2340 360 2180 180 2260 0 Z`;
// 幕の位置 x（SVG の左端は x - 140）。止まっている間は、左右の縁がどちらも画面の外（x = -90 で、左の縁は -190〜-30、右の縁は 1950〜2110）
const WIPE_FROM = 2040; // 左の縁がまだ画面の右の外
const WIPE_HOLD = -90;
const WIPE_TO = -2220; // 右の縁が画面の左の外へ出きる

export const ChapterWipe = ({ f, at, no, title }) => {
  const a = at - 10;
  const b = at + 16;
  if (f < a || f > b) return null;
  const inK = ease(f, [a, at], [0, 1], EASE_OUT);
  const outK = ease(f, [at + 6, b], [0, 1], EASE_IN);
  const x = mix(WIPE_FROM, WIPE_HOLD, inK) + mix(0, WIPE_TO - WIPE_HOLD, outK);
  const tk = ease(f, [at - 4, at + 4], [0, 1], EASE_OUT);
  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 200, pointerEvents: 'none' }}>
      <svg width="2400" height="1080" viewBox="0 0 2400 1080" style={{ position: 'absolute', left: x - 140, top: 0, overflow: 'visible' }}>
        <path d={WIPE_FILL} fill={ZC.green} />
        {/* 縁の内側に沿う、明るい緑の線 */}
        <path d={WIPE_LEAD} transform="translate(34 0)" fill="none" stroke={ZC.leaf} strokeWidth="10" opacity="0.7" />
        <path d={WIPE_TRAIL} transform="translate(-34 0)" fill="none" stroke={ZC.leaf} strokeWidth="10" opacity="0.7" />
        {/* 縁の線 */}
        <path d={WIPE_LEAD} fill="none" stroke={ZC.deep} strokeWidth="18" />
        <path d={WIPE_TRAIL} fill="none" stroke={ZC.deep} strokeWidth="18" />
      </svg>
      <div style={{ position: 'absolute', left: x - WIPE_HOLD, top: 0, width: 1920, height: 1080, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
        <div style={{ fontSize: 40, fontWeight: 900, color: ZC.deep, letterSpacing: '0.3em', opacity: tk }}>CHAPTER {String(no).padStart(2, '0')}</div>
        <div style={{ fontSize: 120, fontWeight: 900, color: '#ffffff', WebkitTextStroke: `22px ${ZC.deep}`, paintOrder: 'stroke fill', transform: `scale(${0.85 + 0.15 * tk})` }}>{title}</div>
      </div>
    </div>
  );
};

// テロップ（要点を大きく）：傾いてぽんっと出て、少し揺れて消える
export const Telop = ({ f, at, until, text, x, y, size = 64, color = ZC.green, rot = -5, sub }) => {
  if (f < at - 1 || f > until + 8) return null;
  const k = sp(f, at, { damping: 11, stiffness: 190 });
  const out = ease(f, [until, until + 8], [0, 1], EASE_IN);
  return (
    <div style={{ position: 'absolute', left: x, top: y, zIndex: 75, opacity: 1 - out, transform: `translate(-50%, -50%) rotate(${rot + 1.5 * Math.sin((f - at) / 8)}deg) scale(${Math.min(1.15, k) * (1 - 0.3 * out)})` }}>
      <div style={{
        padding: '14px 30px 18px', borderRadius: 26, background: '#ffffff', border: `7px solid ${color}`, boxShadow: `0 10px 0 ${ZC.deep}22, 0 18px 40px -12px rgba(0,0,0,0.25)`,
        fontSize: size, fontWeight: 900, color: ZC.ink, whiteSpace: 'nowrap', lineHeight: 1.15, textAlign: 'center', maxWidth: 560,
      }}>
        {text}
        {sub && <div style={{ fontSize: size * 0.42, fontWeight: 800, color, marginTop: 4 }}>{sub}</div>}
      </div>
    </div>
  );
};

// 端末の画面の中の囲み（録画の CSS px。status bar の分は足す）。脈打つ緑のふちとラベル
export const Highlight = ({ f, at, until, r, label, side = 'right' }) => {
  if (f < at || f > until + 8) return null;
  const k = ease(f, [at, at + 7], [0, 1], EASE_OUT);
  const out = ease(f, [until, until + 8], [0, 1], EASE_IN);
  const pulse = 1 + 0.03 * Math.sin((f - at) / 4);
  return (
    <div style={{ position: 'absolute', left: r.x - 6, top: STATUS_H + r.y - 6, width: r.w + 12, height: r.h + 12, zIndex: 60, opacity: k * (1 - out), transform: `scale(${pulse * (0.9 + 0.1 * k)})` }}>
      <div style={{ position: 'absolute', inset: 0, borderRadius: 18, border: `5px solid ${ZC.green}`, boxShadow: `0 0 0 4px rgba(255,255,255,0.85), 0 0 28px rgba(124,194,66,0.8)` }} />
      {label && (
        <div style={{ position: 'absolute', top: -22, [side === 'right' ? 'right' : 'left']: -10, padding: '4px 14px', borderRadius: 14, background: ZC.green, color: '#fff', fontSize: 22, fontWeight: 900, boxShadow: `0 4px 0 ${ZC.deep}` }}>{label}</div>
      )}
    </div>
  );
};

// 端末の上から降りてくる通知（課題の締切）。画面の中に描く
export const PushBanner = ({ f, at, until, title, body }) => {
  if (f < at - 1 || f > until + 10) return null;
  const k = sp(f, at, { damping: 15, stiffness: 160 });
  const out = ease(f, [until, until + 10], [0, 1], EASE_IN);
  return (
    <div style={{ position: 'absolute', left: 10, right: 10, top: 50, zIndex: 90, transform: `translateY(${(1 - Math.min(1, k)) * -150 - out * 150}px)` }}>
      <div style={{ display: 'flex', gap: 10, padding: '12px 12px', borderRadius: 20, background: 'rgba(250,250,250,0.97)', boxShadow: '0 12px 30px -8px rgba(0,0,0,0.35)' }}>
        <Img src={staticFile('promo/icon.png')} style={{ width: 38, height: 38, borderRadius: 9, flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#777', fontWeight: 600 }}><span>SCIENCETOKYO APP</span><span>今</span></div>
          <div style={{ fontSize: 14, fontWeight: 800, color: '#111', marginTop: 1 }}>{title}</div>
          <div style={{ fontSize: 13, color: '#222', marginTop: 1 }}>{body}</div>
        </div>
      </div>
    </div>
  );
};

// 冒頭の道しるべ（建物の名前の札が四方を指して揺れる）
export const SignPost = ({ f, x, y, text, dir = 'right', rot = 0, delay = 0, scale = 1 }) => {
  const k = sp(f, delay, { damping: 10, stiffness: 140 });
  if (k <= 0.001) return null;
  const sway = 3 * Math.sin((f + delay * 7) / 11);
  const w = 60 + text.length * 44;
  const left = dir === 'left';
  return (
    <div style={{ position: 'absolute', left: x, top: y, transform: `translate(-50%, -50%) rotate(${rot + sway}deg) scale(${Math.min(1.1, k) * scale})`, zIndex: 20 }}>
      <svg width={w + 40} height="110" viewBox={`0 0 ${w + 40} 110`} style={{ overflow: 'visible' }}>
        <rect x={(w + 40) / 2 - 9} y="60" width="18" height="140" fill="#8a5a2b" stroke="#4a2e12" strokeWidth="4" />
        <path d={left ? `M8 50 L48 8 L${w + 32} 8 L${w + 32} 92 L48 92 Z` : `M8 8 L${w - 8} 8 L${w + 32} 50 L${w - 8} 92 L8 92 Z`} fill="#c8935a" stroke="#4a2e12" strokeWidth="6" strokeLinejoin="round" />
      </svg>
      <div style={{ position: 'absolute', left: left ? 50 : 22, top: 14, width: w - 30, textAlign: 'center', fontSize: 44, fontWeight: 900, color: '#fff', WebkitTextStroke: '8px #4a2e12', paintOrder: 'stroke fill', whiteSpace: 'nowrap' }}>{text}</div>
    </div>
  );
};

// 浮かぶ「？」
export const Question = ({ f, x, y, at, size = 90, color = '#7fd0ff' }) => {
  const k = sp(f, at, { damping: 9, stiffness: 150 });
  if (k <= 0.001) return null;
  return (
    <div style={{ position: 'absolute', left: x, top: y + 10 * Math.sin((f + at) / 9), fontSize: size, fontWeight: 900, color, WebkitTextStroke: `${size * 0.12}px #2a3b4e`, paintOrder: 'stroke fill', transform: `translate(-50%, -50%) scale(${Math.min(1.15, k)}) rotate(${12 * Math.sin((f + at) / 13)}deg)`, zIndex: 25 }}>？</div>
  );
};

// フラッシュ（場面の頭の白い光）
export const Flash = ({ f, at, len = 10 }) => {
  if (f < at || f > at + len) return null;
  return <AbsoluteFill style={{ background: '#ffffff', opacity: 1 - ease(f, [at, at + len], [0, 1], EASE_IN_OUT), zIndex: 190 }} />;
};
