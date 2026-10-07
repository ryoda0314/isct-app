import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { BAR, T } from './theme.js';

// アイコンの3色（空色・緑・黄）をにじませた明るい背景。全編で共通。
const BLOBS = [
  { c: '26,156,240', a: 0.2, x: 330, y: 230, r: 760, sx: 140, sy: 90, p: 90 },
  { c: '40,200,104', a: 0.18, x: 1620, y: 330, r: 700, sx: 150, sy: 110, p: 105 },
  { c: '242,210,28', a: 0.15, x: 1060, y: 980, r: 760, sx: 180, sy: 60, p: 125 },
];

export const Background = () => {
  const f = useCurrentFrame();
  // 小節頭でほんの少しだけ明るく脈打つ（曲のノリと同期。ブレイク以降は止める）
  const inGroove = f >= T.reveal && f < T.devices;
  const beatPulse = inGroove ? Math.exp(-((f - T.reveal) % BAR) / 7) * 0.05 : 0;
  return (
    <AbsoluteFill style={{ background: 'linear-gradient(180deg, #f4f9fd 0%, #e8f1f9 100%)', overflow: 'hidden' }}>
      {BLOBS.map((b, i) => {
        const x = b.x + b.sx * Math.sin(f / b.p + i * 2);
        const y = b.y + b.sy * Math.cos(f / (b.p * 1.2) + i);
        return (
          <div key={i} style={{
            position: 'absolute', left: x - b.r, top: y - b.r, width: b.r * 2, height: b.r * 2, borderRadius: '50%',
            background: `radial-gradient(circle, rgba(${b.c},${b.a + beatPulse}) 0%, rgba(${b.c},0) 68%)`,
          }} />
        );
      })}
      <AbsoluteFill style={{
        backgroundImage: 'radial-gradient(rgba(14,32,48,0.13) 1.3px, transparent 1.7px)',
        backgroundSize: '34px 34px',
        backgroundPosition: `${-f * 0.35}px ${-f * 0.2}px`,
        maskImage: 'radial-gradient(ellipse 75% 70% at 50% 50%, rgba(0,0,0,0.55), rgba(0,0,0,0) 100%)',
        WebkitMaskImage: 'radial-gradient(ellipse 75% 70% at 50% 50%, rgba(0,0,0,0.55), rgba(0,0,0,0) 100%)',
      }} />
    </AbsoluteFill>
  );
};
