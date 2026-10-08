import React from 'react';
import { AbsoluteFill } from 'remotion';
import '../../promo/fonts.js';
import { FONT } from '../../promo/theme.js';
import { Campus3D, makeCamera } from '../Campus3D.jsx';

// 開発用：3Dキャンパスのカメラを props で変えて静止画を確かめる
export const Campus3DCheck = ({ tx = 14, ty = 38, dist = 520, pitch = 52, yaw = -20, rise = 1, route = 1, walker = 0.6, dest = 1 }) => {
  const cam = makeCamera({ tx, ty, dist, pitch, yaw });
  return (
    <AbsoluteFill style={{ background: 'linear-gradient(180deg, #bfe2ff 0%, #eef6fb 60%)', fontFamily: FONT }}>
      <Campus3D cam={cam} rise={rise} route={route} walker={walker} dest={dest} />
    </AbsoluteFill>
  );
};
