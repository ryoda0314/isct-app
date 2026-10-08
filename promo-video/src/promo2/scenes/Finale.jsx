import React from 'react';
import { AbsoluteFill, Img, staticFile } from 'remotion';
import { C, SONG, T2, ease, mix, sp } from '../theme2.js';
import { Icon } from '../../promo/icons.jsx';
import { Headline, SubCopy } from '../../promo/text.jsx';
import { Burst, IconAssembly } from '../../promo/scenes/Reveal.jsx';

// アウトロ（曲の最後の4小節）：夜が明けて、ツバメが横切り、アイコンとURL。179.25s の一打（SONG.stop）で締める
const ICON = { cx: 960, cy: 300, size: 230 };

const FlyBy = ({ e }) => {
  const u = ease(e, [4, 66], [0, 1], (x) => x);
  if (u <= 0 || u >= 1) return null;
  const pt = (t) => [mix(-220, 2160, t), 700 - 760 * t - 180 * Math.sin(t * Math.PI)];
  return (
    <>
      {[5, 4, 3, 2, 1, 0].map((j) => {
        const t = Math.max(0, u - j * 0.018);
        const [x, y] = pt(t);
        const [x2, y2] = pt(Math.min(1, t + 0.01));
        const ang = (Math.atan2(y2 - y, x2 - x) * 180) / Math.PI + 38;
        return (
          <Img key={j} src={staticFile('promo/swallow.png')} style={{
            position: 'absolute', left: x - 70, top: y - 66, width: 140, height: 132,
            transform: `rotate(${ang}deg) scaleY(${1 + 0.12 * Math.sin(e * 1.3)})`, opacity: j === 0 ? 0.9 : 0.16 * (1 - j / 6),
          }} />
        );
      })}
    </>
  );
};

export const Finale = ({ f }) => {
  const e = f - T2.end;
  const hit = f >= SONG.stop ? Math.exp(-(f - SONG.stop) / 7) : 0; // 最後の一打
  const urlP = sp(e, 34, { damping: 14, stiffness: 160 });
  const devP = sp(e, 48, { damping: 16, stiffness: 160 });
  return (
    <AbsoluteFill>
      <FlyBy e={e} />
      <Burst k={e - 2} cx={ICON.cx} cy={ICON.cy} />
      <Burst k={f - SONG.stop} cx={ICON.cx} cy={ICON.cy} />
      <div style={{ position: 'absolute', inset: 0, transform: `scale(${1 + 0.05 * hit})`, transformOrigin: `${ICON.cx}px ${ICON.cy}px` }}>
        <IconAssembly r={e} size={ICON.size} cx={ICON.cx} cy={ICON.cy} flight={false} />
      </div>
      <div style={{ position: 'absolute', top: 452, left: 0, right: 0 }}>
        <Headline lines={[[{ t: 'ScienceTokyo ' }, { t: 'App', grad: true }]]} f={e} d={8} size={108} align="center" />
        <div style={{ marginTop: 20 }}>
          <SubCopy text="毎日を、もっと軽やかに。" f={e} d={18} size={42} align="center" color={C.txH} weight={800} />
        </div>
      </div>
      <div style={{ position: 'absolute', top: 742, left: 0, right: 0, display: 'flex', justifyContent: 'center' }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 16, padding: '14px 18px 14px 34px', borderRadius: 50,
          background: '#fff', boxShadow: `0 26px 50px -26px rgba(14,32,48,0.45), 0 0 0 1px rgba(14,32,48,0.06), 0 0 0 ${10 * hit}px rgba(40,200,104,${0.25 * hit})`,
          opacity: ease(e, [34, 40], [0, 1]), transform: `translateY(${(1 - urlP) * 24}px) scale(${(0.85 + 0.15 * urlP) * (1 + 0.04 * hit)})`,
        }}>
          <span style={{ fontSize: 36, fontWeight: 800, color: C.txH, letterSpacing: '0.01em' }}>sciencetokyo.app</span>
          <div style={{ width: 52, height: 52, borderRadius: 26, background: C.accent, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="arr" size={26} color="#fff" sw={2.6} />
          </div>
        </div>
      </div>
      <div style={{ position: 'absolute', top: 868, left: 0, right: 0, textAlign: 'center', fontSize: 26, fontWeight: 700, color: C.tx, opacity: Math.min(1, devP * 1.4), transform: `translateY(${(1 - devP) * 16}px)` }}>
        スマホでも、PCでも。
      </div>
      <div style={{ position: 'absolute', top: 982, left: 0, right: 0, textAlign: 'center', fontSize: 21, color: C.txD, opacity: ease(e, [56, 68], [0, 1]) }}>
        ※ 東京科学大学の学生アカウントが必要です
      </div>
    </AbsoluteFill>
  );
};
