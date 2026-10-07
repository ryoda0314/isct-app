import React from 'react';
import { AbsoluteFill, Img, staticFile } from 'remotion';
import { C, T, ease, mix, sp } from '../theme.js';
import { Icon } from '../icons.jsx';
import { Headline, SubCopy } from '../text.jsx';
import { Burst, IconAssembly } from './Reveal.jsx';

const ICON = { cx: 960, cy: 318, size: 230 };

// 背景を横切るツバメ（残像つき）
const FlyBy = ({ e }) => {
  const u = ease(e, [6, 70], [0, 1], (x) => x);
  if (u <= 0 || u >= 1) return null;
  const pt = (t) => {
    // 左下から昇って、アイコンの上を越えて右上へ抜ける
    const x = mix(-220, 2160, t);
    const y = 640 - 720 * t - 190 * Math.sin(t * Math.PI);
    return [x, y];
  };
  return (
    <>
      {[5, 4, 3, 2, 1, 0].map((j) => {
        const t = Math.max(0, u - j * 0.018);
        const [x, y] = pt(t);
        const [x2, y2] = pt(Math.min(1, t + 0.01));
        const ang = (Math.atan2(y2 - y, x2 - x) * 180) / Math.PI + 38;
        const flap = 1 + 0.12 * Math.sin(e * 1.3);
        return (
          <Img key={j} src={staticFile('promo/swallow.png')} style={{
            position: 'absolute', left: x - 70, top: y - 66, width: 140, height: 132,
            transform: `rotate(${ang}deg) scaleY(${flap})`, opacity: j === 0 ? 0.9 : 0.16 * (1 - j / 6),
          }} />
        );
      })}
    </>
  );
};

export const EndCard = ({ f }) => {
  const e = f - T.end;
  const urlP = sp(e, 28, { damping: 14, stiffness: 160 });
  return (
    <AbsoluteFill>
      <FlyBy e={e} />
      <Burst k={e - 2} cx={ICON.cx} cy={ICON.cy} />
      <IconAssembly r={e} size={ICON.size} cx={ICON.cx} cy={ICON.cy} flight={false} />
      <div style={{ position: 'absolute', top: 468, left: 0, right: 0 }}>
        <Headline lines={['ScienceTokyo App']} f={e} d={8} size={112} align="center" />
        <div style={{ marginTop: 26 }}>
          <SubCopy text="東京科学大学生の毎日を、ひとつのアプリに。" f={e} d={18} size={38} align="center" color={C.tx} />
        </div>
      </div>
      <div style={{ position: 'absolute', top: 780, left: 0, right: 0, display: 'flex', justifyContent: 'center' }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 16, padding: '14px 18px 14px 34px', borderRadius: 50,
          background: '#fff', boxShadow: '0 26px 50px -26px rgba(14,32,48,0.45), 0 0 0 1px rgba(14,32,48,0.06)',
          opacity: ease(e, [28, 34], [0, 1]), transform: `translateY(${(1 - urlP) * 24}px) scale(${0.85 + 0.15 * urlP})`,
        }}>
          <span style={{ fontSize: 36, fontWeight: 800, color: C.txH, letterSpacing: '0.01em' }}>sciencetokyo.app</span>
          <div style={{ width: 52, height: 52, borderRadius: 26, background: C.accent, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="arr" size={26} color="#fff" sw={2.6} />
          </div>
        </div>
      </div>
      <div style={{ position: 'absolute', top: 960, left: 0, right: 0, textAlign: 'center', fontSize: 21, color: C.txD, opacity: ease(e, [40, 52], [0, 1]) }}>
        ※ 東京科学大学の学生アカウントが必要です
      </div>
    </AbsoluteFill>
  );
};
