import React from 'react';
import { C, alpha, mix } from './theme.js';
import { Icon } from './icons.jsx';

// iPhone 相当の論理サイズ（アプリのスクショは 3x の 1170x2532）
export const SCREEN_W = 390;
export const SCREEN_H = 844;
export const BEZEL = 12;
export const PHONE_W = SCREEN_W + BEZEL * 2;
export const PHONE_H = SCREEN_H + BEZEL * 2;
export const SCREEN_R = 52;
export const STATUS_H = 54;
export const TAB_H = 84;

// 端末の外形。children は 390x844 の画面内（角丸でクリップ）に描かれる。
// outside は端末の座標系でクリップせずに描くもの（はみ出す通知バナーなど）。
export const Phone = ({ children, style, shadow = 1, outside = null }) => (
  <div style={{
    position: 'absolute', width: PHONE_W, height: PHONE_H, borderRadius: 64,
    background: 'linear-gradient(145deg, #2a313d 0%, #10141b 40%, #0c0f15 100%)',
    padding: BEZEL, boxSizing: 'border-box',
    boxShadow: `0 ${70 * shadow}px ${130 * shadow}px -40px rgba(14,32,48,${0.5 * shadow}), 0 30px 60px -30px rgba(14,32,48,${0.35 * shadow}), inset 0 0 0 1.5px #4a5262, inset 0 0 0 5px #161b23`,
    ...style,
  }}>
    {/* サイドボタン */}
    <div style={{ position: 'absolute', left: -3, top: 170, width: 4, height: 34, borderRadius: 2, background: '#232a35' }} />
    <div style={{ position: 'absolute', left: -3, top: 222, width: 4, height: 62, borderRadius: 2, background: '#232a35' }} />
    <div style={{ position: 'absolute', left: -3, top: 296, width: 4, height: 62, borderRadius: 2, background: '#232a35' }} />
    <div style={{ position: 'absolute', right: -3, top: 250, width: 4, height: 96, borderRadius: 2, background: '#232a35' }} />
    <div style={{ position: 'relative', width: SCREEN_W, height: SCREEN_H, borderRadius: SCREEN_R, overflow: 'hidden', background: C.bg }}>
      {children}
      <div style={{ position: 'absolute', top: 11, left: SCREEN_W / 2 - 61, width: 122, height: 36, borderRadius: 18, background: '#000', zIndex: 100 }} />
    </div>
    {outside}
  </div>
);

export const StatusBar = ({ color = C.txH }) => (
  <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: STATUS_H, zIndex: 90, color }}>
    <div style={{ position: 'absolute', left: 46, top: 17, fontSize: 17, fontWeight: 650, letterSpacing: '-0.01em' }}>9:41</div>
    <div style={{ position: 'absolute', right: 30, top: 21, display: 'flex', alignItems: 'center', gap: 6 }}>
      <svg width="18" height="12" viewBox="0 0 18 12">
        {[0, 1, 2, 3].map((i) => <rect key={i} x={i * 4.6} y={9 - i * 3} width="3.2" height={3 + i * 3} rx="0.8" fill={color} />)}
      </svg>
      <svg width="16" height="12" viewBox="0 0 16 12">
        <path d="M8 11.2l2.3-2.6a3.3 3.3 0 00-4.6 0z" fill={color} />
        <path d="M3.4 6.2a6.6 6.6 0 019.2 0l-1.4 1.6a4.4 4.4 0 00-6.4 0z" fill={color} />
        <path d="M1 3.6a10 10 0 0114 0l-1.3 1.5a8 8 0 00-11.4 0z" fill={color} />
      </svg>
      <div style={{ position: 'relative', width: 25, height: 12, borderRadius: 4, border: `1.2px solid ${alpha('#0e2030', 0.4)}`, boxSizing: 'border-box', padding: 1.5 }}>
        <div style={{ width: '82%', height: '100%', borderRadius: 2, background: color }} />
        <div style={{ position: 'absolute', right: -3.5, top: 3.2, width: 2, height: 4, borderRadius: 1, background: alpha('#0e2030', 0.4) }} />
      </div>
    </div>
  </div>
);

const TABS = [
  { key: 'home', label: 'ホーム', icon: 'home' },
  { key: 'timetable', label: '時間割', icon: 'cal' },
  { key: 'tasks', label: '課題', icon: 'tasks', badge: 10 },
  { key: 'map', label: 'マップ', icon: 'map' },
  { key: 'dm', label: 'DM', icon: 'mail' },
  { key: 'more', label: 'その他', icon: 'more', badge: 3 },
];

const lerpColor = (a, b, t) => {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const ch = (s) => Math.round(mix((pa >> s) & 255, (pb >> s) & 255, t));
  return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
};

// active: { from: 'home', to: 'timetable', t: 0..1 } でタブの選択色を遷移させる
export const TabBar = ({ from, to = from, t = 1 }) => (
  <div style={{
    position: 'absolute', left: 0, right: 0, bottom: 0, height: TAB_H, zIndex: 80,
    background: 'rgba(246,250,253,0.97)', borderTop: `1px solid ${C.bd}`, display: 'flex', paddingTop: 8, boxSizing: 'border-box',
  }}>
    {TABS.map((tab) => {
      const w = (tab.key === from ? 1 - t : 0) + (tab.key === to ? t : 0);
      const col = lerpColor(C.txD, C.accent, Math.min(1, w));
      return (
        <div key={tab.key} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, color: col }}>
          <div style={{ position: 'relative', transform: `scale(${1 + 0.08 * w})` }}>
            <Icon name={tab.icon} size={25} sw={1.7} />
            {tab.badge && (
              <div style={{
                position: 'absolute', top: -7, right: -12, minWidth: 19, height: 19, padding: '0 5px', boxSizing: 'border-box',
                borderRadius: 10, background: '#e0393e', color: '#fff', fontSize: 11, fontWeight: 700,
                display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px solid #f6fafd',
              }}>{tab.badge}</div>
            )}
          </div>
          <div style={{ fontSize: 10.5, fontWeight: w > 0.5 ? 700 : 500 }}>{tab.label}</div>
        </div>
      );
    })}
    <div style={{ position: 'absolute', bottom: 8, left: SCREEN_W / 2 - 67, width: 134, height: 5, borderRadius: 3, background: '#0e2030' }} />
  </div>
);

// アプリ共通のヘッダー（モバイル版）
export const AppHeader = ({ children, right, style }) => (
  <div style={{
    height: 56, padding: '0 18px', display: 'flex', alignItems: 'center', gap: 10,
    borderBottom: `1px solid ${C.bd}`, background: 'rgba(246,250,253,0.97)', boxSizing: 'border-box',
    position: 'relative', zIndex: 5, ...style,
  }}>
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>{children}</div>
    {right}
  </div>
);
