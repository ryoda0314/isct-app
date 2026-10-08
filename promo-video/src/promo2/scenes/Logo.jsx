import React from 'react';
import { AbsoluteFill } from 'remotion';
import { C, EASE_IN_OUT, T2, ease } from '../theme2.js';
import { Headline, SubCopy } from '../../promo/text.jsx';
import { Burst, IconAssembly } from '../../promo/scenes/Reveal.jsx';

// 384f（ドロップ）：画面に飛び込んだ白から、ツバメがアイコンに着地する
const CX = 960;
const CY = 380;
const SIZE = 300;

export const Logo = ({ f }) => {
  const r = f - (T2.logo - 2); // r = 2 で着地（IconAssembly の LAND）
  const flash = 1 - ease(f, [T2.logo, T2.logo + 12], [0, 1]);
  const out = ease(f, [T2.home - 18, T2.home], [0, 1], EASE_IN_OUT);
  return (
    <AbsoluteFill>
      <AbsoluteFill style={{ background: '#fff', opacity: flash }} />
      <div style={{ position: 'absolute', inset: 0, transform: `translateY(${-out * 140}px) scale(${1 - 0.25 * out})`, transformOrigin: '960px 380px', opacity: 1 - out }}>
        <Burst k={r - 2} cx={CX} cy={CY} />
        <IconAssembly r={r} size={SIZE} cx={CX} cy={CY} />
      </div>
      <div style={{ position: 'absolute', top: 590, left: 0, right: 0, opacity: 1 - out, transform: `translateY(${-out * 80}px)` }}>
        <Headline lines={[[{ t: 'ScienceTokyo ' }, { t: 'App', grad: true }]]} f={f - T2.logo} d={10} size={122} align="center" />
        <div style={{ marginTop: 22 }}>
          <SubCopy text="東京科学大学生のための、オールインワン・キャンパスアプリ" f={f - T2.logo} d={20} size={36} align="center" color={C.tx} />
        </div>
      </div>
    </AbsoluteFill>
  );
};

