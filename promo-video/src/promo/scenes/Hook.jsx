import React from 'react';
import { AbsoluteFill } from 'remotion';
import { BAR, C, EASE_IN, alpha, ease, mix, sp } from '../theme.js';
import { Icon } from '../icons.jsx';
import { CharPop } from '../text.jsx';

// 0〜192f（イントロ4小節）：あちこちのサイトのウィンドウが増えていき、最後に中心へ吸い込まれる
const WIN_W = 330;
const WIN_H = 205;
const LOGIN = { title: 'ログイン', host: 'sso', icon: 'lock', col: '#6375f0', kind: 'login' };
const WINS = [
  { x: 110, y: 90, r: -5, title: '時間割', host: 'portal', icon: 'cal', col: '#1a9cf0', kind: 'table', at: 6 },
  { x: 1470, y: 110, r: 4, title: '課題', host: 'lms', icon: 'tasks', col: '#d4843e', kind: 'lines', at: 18 },
  { x: 190, y: 720, r: 3, ...LOGIN, at: 30 },
  { x: 1400, y: 700, r: -4, title: '成績', host: 'records', icon: 'bar', col: '#a855c7', kind: 'table', at: 54 },
  { x: 650, y: 46, r: 2, title: 'シラバス', host: 'syllabus', icon: 'book', col: '#2d9d8f', kind: 'lines', at: 66 },
  { x: 1000, y: 800, r: -3, ...LOGIN, at: 78 },
  { x: 36, y: 410, r: -6, title: 'お知らせ', host: 'mail', icon: 'mega', col: '#e5534b', kind: 'lines', at: 102 },
  { x: 1580, y: 420, r: 5, title: '休講情報', host: 'portal', icon: 'alert', col: '#d4a420', kind: 'lines', at: 114 },
  { x: 560, y: 830, r: 5, ...LOGIN, at: 126 },
  { x: 1130, y: 52, r: -2, title: '教室', host: 'map', icon: 'map', col: '#3dae72', kind: 'lines', at: 148 },
  { x: 320, y: 236, r: 6, title: '出欠', host: 'attend', icon: 'attend', col: '#c75d8e', kind: 'lines', at: 154 },
  { x: 1300, y: 290, r: -6, ...LOGIN, at: 160 },
];

const LINES = [
  { segs: [{ t: '時間割は、' }, { t: 'あのサイト。', color: '#1a7fd0' }], at: 2 },
  { segs: [{ t: '課題は、' }, { t: 'このサイト。', color: '#c56f22' }], at: BAR + 2 },
  { segs: [{ t: '成績は、' }, { t: 'また別のサイト。', color: '#8e44b5' }], at: BAR * 2 + 2 },
  { segs: [{ t: 'ログイン、' }, { t: '何回目？', color: '#d63b3b' }], at: BAR * 3 + 2 },
];

const Skeleton = ({ w, col = C.bg3, h = 9 }) => <div style={{ width: w, height: h, borderRadius: 5, background: col, marginTop: 9 }} />;

const WinBody = ({ kind, col }) => {
  if (kind === 'login') {
    return (
      <div style={{ padding: '4px 22px' }}>
        {['ユーザーID', 'パスワード'].map((ph) => (
          <div key={ph} style={{ height: 30, borderRadius: 8, border: `1.5px solid ${C.bd}`, marginTop: 9, padding: '0 10px', display: 'flex', alignItems: 'center', fontSize: 12, color: C.txD }}>{ph}</div>
        ))}
        <div style={{ height: 30, borderRadius: 8, background: col, marginTop: 11, color: '#fff', fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>ログイン</div>
      </div>
    );
  }
  if (kind === 'table') {
    return (
      <div style={{ padding: '6px 18px', display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 5 }}>
        {Array.from({ length: 15 }).map((_, i) => (
          <div key={i} style={{ height: 26, borderRadius: 5, background: [1, 4, 7, 11, 13].includes(i) ? alpha(col, 0.22) : C.bg3 }} />
        ))}
      </div>
    );
  }
  return (
    <div style={{ padding: '2px 20px' }}>
      <Skeleton w="88%" col={alpha(col, 0.25)} h={11} />
      <Skeleton w="96%" /><Skeleton w="72%" /><Skeleton w="90%" /><Skeleton w="58%" />
    </div>
  );
};

const Win = ({ w, f, i }) => {
  const p = sp(f, w.at, { damping: 13, stiffness: 190 });
  if (f < w.at) return null;
  const float = 6 * Math.sin((f + i * 23) / 17);
  const shakeAmt = ease(f, [150, 166], [0, 1]);
  const sx = shakeAmt * 6 * Math.sin(f * 2.3 + i * 1.7);
  const sy = shakeAmt * 4 * Math.cos(f * 1.9 + i);
  const sr = shakeAmt * 2.2 * Math.sin(f * 1.4 + i * 2);
  // 吸い込み（ドロップ直前の1拍）
  const q = ease(f, [178, 191], [0, 1], EASE_IN);
  const cx = w.x + WIN_W / 2;
  const cy = w.y + WIN_H / 2;
  const tx = mix(0, 960 - cx, q);
  const ty = mix(0, 520 - cy, q);
  const scale = (0.55 + 0.45 * p) * (1 - 0.88 * q);
  return (
    <div style={{
      position: 'absolute', left: w.x, top: w.y, width: WIN_W, height: WIN_H, borderRadius: 18, overflow: 'hidden',
      background: '#fff', border: `1px solid ${C.bd}`, boxShadow: '0 24px 48px -22px rgba(14,32,48,0.35)',
      opacity: Math.min(1, p * 1.5) * (1 - ease(f, [186, 191], [0, 1])),
      transform: `translate(${tx + sx}px, ${ty + sy + float}px) rotate(${w.r * (1 - q) + sr + (1 - p) * -8}deg) scale(${scale})`,
    }}>
      <div style={{ height: 36, background: C.bg2, borderBottom: `1px solid ${C.bd}`, display: 'flex', alignItems: 'center', gap: 6, padding: '0 12px' }}>
        {['#f1707a', '#f3c04f', '#5fcf80'].map((c) => <div key={c} style={{ width: 10, height: 10, borderRadius: 5, background: c }} />)}
        <div style={{ marginLeft: 8, flex: 1, height: 20, borderRadius: 6, background: C.bg3, fontSize: 11, color: C.txD, display: 'flex', alignItems: 'center', padding: '0 8px', gap: 5 }}>
          <Icon name="lock" size={10} sw={2.2} />{w.host}
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 20px 0' }}>
        <div style={{ width: 30, height: 30, borderRadius: 9, background: alpha(w.col, 0.15), color: w.col, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon name={w.icon} size={17} sw={2} />
        </div>
        <div style={{ fontSize: 17, fontWeight: 800, color: C.txH }}>{w.title}</div>
      </div>
      <WinBody kind={w.kind} col={w.col} />
    </div>
  );
};

export const Hook = ({ f }) => {
  const q = ease(f, [176, 190], [0, 1], EASE_IN);
  return (
    <AbsoluteFill>
      {WINS.map((w, i) => <Win key={i} w={w} f={f} i={i} />)}
      {/* 文字の下に白いにじみを敷いてウィンドウと分離 */}
      <div style={{
        position: 'absolute', left: 160, top: 360, width: 1600, height: 340,
        background: 'radial-gradient(ellipse 50% 50% at 50% 50%, rgba(246,250,253,0.96) 0%, rgba(246,250,253,0.85) 45%, rgba(246,250,253,0) 100%)',
        opacity: 1 - q,
      }} />
      {LINES.map((l, i) => {
        if (f < l.at - 1 || f > l.at + BAR) return null;
        const last = i === LINES.length - 1;
        return (
          <div key={i} style={{ position: 'absolute', left: 0, right: 0, top: 462, display: 'flex', justifyContent: 'center' }}>
            <CharPop segs={l.segs} f={f} d={l.at} stagger={1.5} size={last ? 112 : 100} exitAt={last ? 176 : l.at + BAR - 9} />
          </div>
        );
      })}
    </AbsoluteFill>
  );
};
