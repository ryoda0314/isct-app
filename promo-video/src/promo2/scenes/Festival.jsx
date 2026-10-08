import React from 'react';
import { AbsoluteFill, spring } from 'remotion';
import { EASE_IN, EASE_IN_OUT, FPS, T2, ease, mix } from '../theme2.js';
import { Phone3D, ScreenFlow, STATUS_H } from '../Device.jsx';
import { CouponUsed, Tap } from '../overlays.jsx';
import { SceneText } from './Day.jsx';

// 10/10（土）工大祭：日が暮れて提灯が灯る → 出店一覧 → 学生限定クーポンを使う
export const COUPON_TAP = 92; // 「店員さんの前で使う」を押す（場面先頭から）
const USED = COUPON_TAP + 4;

// 工大祭のテーマ「Sparkle」にちなんだ、きらめき
const SPARKS = [
  [330, 260, 0], [920, 180, 9], [1010, 820, 17], [250, 860, 23], [1060, 470, 31], [180, 560, 38],
  [880, 980, 45], [1000, 300, 52], [420, 120, 60], [1100, 640, 66],
];
const Sparkle = ({ x, y, k, s = 1 }) => {
  const a = Math.max(0, Math.sin((k / 30) * Math.PI));
  if (a <= 0) return null;
  const r = 18 * s * a;
  return (
    <svg width={r * 2 + 20} height={r * 2 + 20} style={{ position: 'absolute', left: x - r - 10, top: y - r - 10, opacity: a, filter: 'drop-shadow(0 0 8px rgba(255,220,160,0.9))' }}>
      <path d={`M${r + 10} 10 Q${r + 13} ${r + 7} ${r * 2 + 10} ${r + 10} Q${r + 13} ${r + 13} ${r + 10} ${r * 2 + 10} Q${r + 7} ${r + 13} 10 ${r + 10} Q${r + 7} ${r + 7} ${r + 10} 10Z`} fill="#fff6dc" />
    </svg>
  );
};

export const Festival = ({ f }) => {
  const g = f - T2.fest;
  const inP = spring({ frame: g + 10, fps: FPS, config: { damping: 19, stiffness: 120, mass: 1 } });
  const out = ease(g, [128, 144], [0, 1], EASE_IN);
  const scroll = ease(g, [10, 58], [0, 470], EASE_IN_OUT); // 出店一覧のカテゴリが上に来るところまで
  return (
    <AbsoluteFill>
      {SPARKS.map(([x, y, d], i) => (
        <Sparkle key={i} x={x} y={y} k={(g - d + 300) % 60} s={i % 3 === 0 ? 1.3 : 0.9} />
      ))}
      <SceneText g={g} side="right" tone="light"
        head={[[{ t: '週末は、' }], [{ t: '工大祭', color: '#ffc46b' }, { t: '。' }]]}
        sub={'模擬店や展示をチェックして、\n学生限定クーポンもアプリで。'}
        note="※ 画面の出店はサンプルです" exitAt={124} />
      <Phone3D x={mix(-320, 640, inP) + mix(0, 320, out)} y={548 + 6 * Math.sin(f / 30)} ry={mix(46, 12, inP)} scale={1 - 0.45 * out} opacity={1 - out} shadow={0.9}>
        <ScreenFlow f={g} screens={[{ at: 0, name: 'festival_tall', scroll }, { at: 66, name: 'booth_coupon' }]} />
        <CouponUsed t={g - USED} />
        <Tap x={195} y={STATUS_H + 356} f={g} at={COUPON_TAP} />
      </Phone3D>
    </AbsoluteFill>
  );
};
