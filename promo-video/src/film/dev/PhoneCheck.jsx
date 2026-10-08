import React from 'react';
import { AbsoluteFill } from 'remotion';
import '../../promo/fonts.js';
import { FONT } from '../theme.js';
import { FilmScreen } from '../Device.jsx';
import { ModelPhone } from '../ModelPhone.jsx';
import { PhoneAt } from '../stage.jsx';

// 開発用：3Dモデルの端末と、これまでの CSS の端末を同じ置き方で並べて比べる
const POSES = [
  { x: 260, y: 300, s: 0.55, rx: 0, ry: 0, rz: 0, o: 1 },
  { x: 700, y: 300, s: 0.55, rx: 0, ry: -14, rz: 0, o: 1 },
  { x: 1140, y: 300, s: 0.55, rx: 16, ry: 32, rz: -5, o: 1 },
  { x: 1600, y: 300, s: 0.55, rx: 0, ry: -36, rz: 0, o: 1 },
];
export const PhoneCheck = () => (
  <AbsoluteFill style={{ fontFamily: FONT, background: 'linear-gradient(180deg, #fbe3ec, #fffaf6)' }}>
    {POSES.map((p, i) => (
      <ModelPhone key={`m${i}`} pose={p}><FilmScreen name="sp_home" /></ModelPhone>
    ))}
    {POSES.map((p, i) => (
      <PhoneAt key={`c${i}`} pose={{ ...p, y: 790 }}><FilmScreen name="sp_home" /></PhoneAt>
    ))}
  </AbsoluteFill>
);
