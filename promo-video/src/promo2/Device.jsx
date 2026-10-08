import React from 'react';
import { Img, staticFile } from 'remotion';
import { PHONE_H, PHONE_W, Phone, SCREEN_H, SCREEN_W, STATUS_H } from '../promo/Phone.jsx';
import SCREENS from './screens.json';

// アプリの実画面（capture/capture_v2.mjs でデモモードを撮ったもの）を端末に入れて見せる部品。
// スクショは 390x770（iPhone の表示域から、上のステータスバー 54px と下のホームインジケータ 20px を除いた分）。
export const SHOT_H = 770;
const APP_HEADER = 55; // アプリの見出しバー（境界線込み）
const APP_TABBAR = 51; // 下のタブバー（境界線込み）
const HOME_STRIP = SCREEN_H - STATUS_H - SHOT_H; // 20

export const shotSrc = (name) => staticFile(`promo2/screens/${name}.png`);
export const shotMeta = (name) => SCREENS[name] || { css_h: SHOT_H, top: '#f6fafd', bottom: '#f6fafd', dark: false };

// iPhone のステータスバー（色だけ変えられる）
export const StatusBar2 = ({ color = '#0e2030' }) => (
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
      <div style={{ position: 'relative', width: 25, height: 12, borderRadius: 4, border: `1.2px solid ${color}`, opacity: 0.95, boxSizing: 'border-box', padding: 1.5 }}>
        <div style={{ width: '82%', height: '100%', borderRadius: 2, background: color }} />
      </div>
    </div>
  </div>
);

// 実画面1枚。縦長に撮った画面（home_tall など）は、見出しとタブバーを固定して中身だけ scroll(px) する
export const RealScreen = ({ name, scroll = 0, time = '9:41', children }) => {
  const m = shotMeta(name);
  const src = shotSrc(name);
  const tall = m.css_h > SHOT_H + 1;
  const ink = m.dark ? '#ffffff' : '#0e2030';
  return (
    <div style={{ position: 'absolute', inset: 0, background: m.top, overflow: 'hidden' }}>
      {!tall ? (
        <Img src={src} style={{ position: 'absolute', left: 0, top: STATUS_H, width: SCREEN_W, height: SHOT_H }} />
      ) : (
        <>
          <div style={{ position: 'absolute', left: 0, top: STATUS_H + APP_HEADER, width: SCREEN_W, height: SHOT_H - APP_HEADER - APP_TABBAR, overflow: 'hidden' }}>
            <Img src={src} style={{ position: 'absolute', left: 0, top: -APP_HEADER - Math.max(0, Math.min(scroll, m.css_h - SHOT_H)), width: SCREEN_W, height: m.css_h }} />
          </div>
          <div style={{ position: 'absolute', left: 0, top: STATUS_H, width: SCREEN_W, height: APP_HEADER, overflow: 'hidden' }}>
            <Img src={src} style={{ position: 'absolute', left: 0, top: 0, width: SCREEN_W, height: m.css_h }} />
          </div>
          <div style={{ position: 'absolute', left: 0, top: STATUS_H + SHOT_H - APP_TABBAR, width: SCREEN_W, height: APP_TABBAR, overflow: 'hidden' }}>
            <Img src={src} style={{ position: 'absolute', left: 0, top: -(m.css_h - APP_TABBAR), width: SCREEN_W, height: m.css_h }} />
          </div>
        </>
      )}
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: HOME_STRIP, background: m.bottom }} />
      {children}
      <StatusBar2 color={ink} />
      <div style={{ position: 'absolute', bottom: 7, left: SCREEN_W / 2 - 67, width: 134, height: 5, borderRadius: 3, background: ink, opacity: 0.85, zIndex: 95 }} />
    </div>
  );
};

// 画面の切り替え（右から滑り込む）。screens: [{ at, name, scroll?, el? }] のうち、いま表示すべきものを重ねる
export const ScreenFlow = ({ f, screens, slide = 12 }) => (
  <>
    {screens.map((s, i) => {
      const next = screens[i + 1];
      if (i > 0 && f < s.at - slide) return null;
      if (next && f >= next.at + 2) return null;
      const tIn = i === 0 ? 1 : Math.max(0, Math.min(1, (f - (s.at - slide)) / slide));
      const e = 1 - (1 - tIn) ** 3;
      const tOut = next ? Math.max(0, Math.min(1, (f - (next.at - slide)) / slide)) : 0;
      const eo = 1 - (1 - tOut) ** 3;
      const mode = s.mode || 'slide';
      const style = mode === 'fade'
        ? { opacity: e }
        : { transform: `translateX(${(1 - e) * SCREEN_W - eo * 90}px)`, boxShadow: e < 1 ? '-24px 0 40px -18px rgba(14,32,48,0.35)' : 'none' };
      return (
        <div key={i} style={{ position: 'absolute', inset: 0, ...style }}>
          {s.el ? s.el : <RealScreen name={s.name} scroll={typeof s.scroll === 'function' ? s.scroll(f) : s.scroll || 0} />}
          {eo > 0 && mode !== 'fade' && <div style={{ position: 'absolute', inset: 0, background: `rgba(14,32,48,${0.14 * eo})` }} />}
        </div>
      );
    })}
  </>
);

// 3D 空間に置いた端末。x, y は画面上の中心、rx/ry/rz は度
export const Phone3D = ({ x, y, scale = 1, rx = 0, ry = 0, rz = 0, opacity = 1, shadow = 1, children, outside, glare = 0.5, z = 0 }) => (
  <div style={{ position: 'absolute', inset: 0, perspective: 2400, perspectiveOrigin: `${x}px ${y}px`, pointerEvents: 'none' }}>
    <Phone
      shadow={shadow}
      outside={outside}
      style={{
        left: x - PHONE_W / 2, top: y - PHONE_H / 2, opacity,
        transform: `translateZ(${z}px) rotateX(${rx}deg) rotateY(${ry}deg) rotateZ(${rz}deg) scale(${scale})`,
      }}
    >
      {children}
      {/* ガラスの映り込み（傾きに合わせて流れる） */}
      {glare > 0 && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 120, pointerEvents: 'none', mixBlendMode: 'screen',
          background: `linear-gradient(${115 + ry * 1.5}deg, rgba(255,255,255,0) ${30 + ry}%, rgba(255,255,255,${0.16 * glare}) ${42 + ry}%, rgba(255,255,255,0) ${56 + ry}%)`,
        }} />
      )}
    </Phone>
  </div>
);

// スクショの一部を切り出したカード（画面から浮き上がる吹き出し用）。座標はスクショの CSS px
export const ShotCrop = ({ name, x, y, w, h, scale = 1.6, radius = 14, style }) => {
  const m = shotMeta(name);
  return (
    <div style={{ position: 'relative', width: w * scale, height: h * scale, borderRadius: radius, overflow: 'hidden', background: m.top, ...style }}>
      <Img src={shotSrc(name)} style={{ position: 'absolute', left: -x * scale, top: -y * scale, width: SCREEN_W * scale, height: m.css_h * scale }} />
    </div>
  );
};

export { PHONE_W, PHONE_H, SCREEN_W, SCREEN_H, STATUS_H };
