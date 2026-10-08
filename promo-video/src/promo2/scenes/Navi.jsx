import React from 'react';
import { AbsoluteFill, spring } from 'remotion';
import { C, EASE_IN, EASE_IN_OUT, EASE_OUT, FPS, T2, ease, mix, sp } from '../theme2.js';
import { Headline, SubCopy } from '../../promo/text.jsx';
import { Campus3D, makeCamera, routeAt } from '../Campus3D.jsx';
import { Phone3D, ScreenFlow } from '../Device.jsx';
import ROUTE from '../campusRoute.json';

// 8:42（4小節）：上から見たイラスト地図 → 傾いて建物が立ち上がる → 大岡山駅から西9号館までルートが伸びる → 実際のナビ画面
const MID = routeAt(0.5);
const DEST = routeAt(1);

const camAt = (g) => {
  // 立ち上がり（上空 → 斜め）
  const tilt = ease(g, [-6, 56], [0, 1], EASE_IN_OUT);
  // ルートを追う
  const follow = ease(g, [40, 120], [0, 1], EASE_IN_OUT);
  const orbit = ease(g, [0, 192], [0, 1], (x) => x);
  const tx = mix(MID.x, mix(MID.x, DEST.x, 0.55), follow);
  const ty = mix(MID.y + 10, mix(MID.y, DEST.y, 0.55) - 20, follow);
  // 注視点を置く画面上の位置：最初は中央、建物が立ち上がると右へ、端末が入ってきたら中ほどへ
  const side = ease(g, [0, 56], [0, 1], EASE_IN_OUT);
  const mid = ease(g, [96, 130], [0, 1], EASE_IN_OUT);
  return {
    tx, ty,
    dist: mix(1350, 560, tilt) - 90 * follow,
    pitch: mix(0, 56, tilt),
    yaw: mix(0, -38, tilt) - 26 * orbit,
    cx: mix(960, 1290, side) - 250 * mid,
    cy: mix(540, 600, side),
  };
};

export const Navi = ({ f }) => {
  const g = f - T2.navi;
  const cam = makeCamera(camAt(g));
  const mapIn = ease(g, [-16, 0], [0, 1]);
  const mapOut = ease(g, [178, 192], [0, 1], EASE_IN);
  const rise = ease(g, [4, 60], [0, 1], EASE_OUT);
  const route = ease(g, [44, 104], [0, 1], EASE_IN_OUT);
  const walker = g >= 44 ? ease(g, [44, 150], [0, 0.97], EASE_IN_OUT) : null;
  const dest = sp(g, 100, { damping: 12, stiffness: 200 });
  const phoneIn = spring({ frame: g - 98, fps: FPS, config: { damping: 19, stiffness: 120, mass: 1 } });
  const dim = ease(g, [98, 120], [0, 0.18]);
  const etaP = sp(g, 106, { damping: 14, stiffness: 170 });
  const minutes = 4; // アプリの案内カードと同じ表示（徒歩4分・約276m・8:46着）
  return (
    <AbsoluteFill style={{ opacity: mapIn * (1 - mapOut) }}>
      <Campus3D cam={cam} rise={rise} route={route} walker={walker} dest={dest} labels={ease(g, [26, 44], [0, 1])} frame={f} haze="#e2eef8" />
      <AbsoluteFill style={{ background: `rgba(238,245,251,${dim})` }} />
      {/* 文字の後ろだけ少し明るくする */}
      <div style={{ position: 'absolute', left: -260, top: 150, width: 1300, height: 620, background: 'radial-gradient(ellipse 50% 50% at 50% 50%, rgba(240,247,252,0.85) 0%, rgba(240,247,252,0.6) 45%, rgba(240,247,252,0) 100%)', opacity: ease(g, [0, 16], [0, 1]) }} />
      <div style={{ position: 'absolute', left: 150, top: 300, width: 900 }}>
        <Headline lines={[[{ t: '教室まで、' }], [{ t: 'もう迷わない', grad: true }, { t: '。' }]]} f={g} d={6} exitAt={176} size={100} />
        <div style={{ marginTop: 30 }}>
          <SubCopy text={'キャンパスナビなら、建物も教室も\n検索して、そのまま道案内。'} f={g} d={112} exitAt={174} size={30} />
        </div>
      </div>
      {/* 到着予定のチップ（アプリの案内カードと同じ数字） */}
      {g >= 104 && (
        <div style={{
          position: 'absolute', left: 150, top: 780, display: 'flex', alignItems: 'center', gap: 18, padding: '16px 28px 16px 20px', borderRadius: 22,
          background: '#fff', boxShadow: '0 26px 50px -24px rgba(14,32,48,0.45), 0 0 0 1px rgba(14,32,48,0.06)',
          opacity: Math.min(1, etaP * 1.5) * (1 - ease(g, [170, 180], [0, 1])), transform: `translateY(${(1 - etaP) * 24}px) scale(${0.85 + 0.15 * etaP})`, transformOrigin: '0% 50%',
        }}>
          <div style={{ width: 56, height: 56, borderRadius: 16, background: '#28c86822', display: 'grid', placeItems: 'center' }}>
            <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#28c868" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s-8-7.5-8-13a8 8 0 0116 0c0 5.5-8 13-8 13z" /><circle cx="12" cy="9" r="3" /></svg>
          </div>
          <div>
            <div style={{ fontSize: 30, fontWeight: 900, color: C.txH }}>{ROUTE.to.label}<span style={{ marginLeft: 12, fontSize: 18, fontWeight: 800, color: C.txD }}>W9</span></div>
            <div style={{ fontSize: 22, fontWeight: 700, color: C.tx, marginTop: 2 }}>
              徒歩 <span style={{ fontSize: 34, fontWeight: 900, color: '#1a8ef0' }}>{minutes}</span> 分 ・ 約{ROUTE.length}m ・ 8:46着
            </div>
          </div>
        </div>
      )}
      {g >= 90 && (
        <Phone3D x={mix(2250, 1480, phoneIn)} y={560 + 6 * Math.sin(f / 30) + 120 * mapOut} ry={mix(-46, -14, phoneIn)} rz={mix(6, 0, phoneIn)} scale={1 - 0.15 * mapOut} opacity={1 - mapOut}>
          <ScreenFlow f={g} screens={[{ at: 0, name: 'navi_route' }, { at: 140, name: 'navi_guide', mode: 'fade' }]} />
        </Phone3D>
      )}
    </AbsoluteFill>
  );
};

