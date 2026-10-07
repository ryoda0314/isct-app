import React from 'react';
import { AbsoluteFill, Audio, Sequence, staticFile, useCurrentFrame } from 'remotion';
import './fonts.js';
import { C, FONT, T, ease } from './theme.js';
import { Background } from './Background.jsx';
import { Hook } from './scenes/Hook.jsx';
import { Reveal } from './scenes/Reveal.jsx';
import { Showcase, TASKS_ORIGIN } from './scenes/Showcase.jsx';
import { MapScene } from './scenes/MapScene.jsx';
import { Wall } from './scenes/Wall.jsx';
import { Devices } from './scenes/Devices.jsx';
import { EndCard } from './scenes/EndCard.jsx';
import { BANNER_AT } from './screens/TasksScreen.jsx';

// ScienceTokyo App 紹介アニメーション（BGMのみ・ナレーションなし、約54秒）
// 各シーンはグローバルフレーム f を受け取り、自分の表示区間だけ描画する。
const SCENES = [
  [Hook, 0, T.reveal + 1],
  [Reveal, T.reveal - 20, T.home + 10],
  [Showcase, T.home - 6, T.map + 6],
  [MapScene, T.map + 6, T.wall + 4],
  [Wall, T.wall - 4, T.devices + 8],
  [Devices, T.devices - 4, T.end + 6],
  [EndCard, T.end - 6, T.total],
];

// duck: 効果音の間だけ BGM を何割下げるか（重なると音割れするため）
const SFX = [
  { src: 'promo/sfx/whoosh.wav', at: T.reveal - 16, volume: 0.55, duck: 0.2, len: 24 },
  { src: 'promo/sfx/chime.wav', at: TASKS_ORIGIN + BANNER_AT, volume: 0.5, duck: 0.4, len: 36 },
  { src: 'promo/sfx/whoosh.wav', at: T.end + 24, volume: 0.4, duck: 0.3, len: 24 },
];

const BGM_VOLUME = 0.85;

// 曲の拍頭は 0.072s 地点。さらに書き出し後の音声は AAC の先頭パディングで約 43ms 遅れる。
// 3フレーム（100ms）削ると、拍が映像のカット（12f 格子）の約 15ms 後に来る。
const BGM_TRIM = 3;

const bgmVolume = (fr) => {
  const fadeOut = 1 - ease(fr, [T.total - 64, T.total - 1], [0, 1], (x) => x);
  const duck = SFX.reduce((m, s) => {
    const k = Math.min(ease(fr, [s.at - 3, s.at + 2], [0, 1]), 1 - ease(fr, [s.at + s.len, s.at + s.len + 8], [0, 1]));
    return Math.max(m, s.duck * k);
  }, 0);
  return BGM_VOLUME * fadeOut * (1 - duck);
};

export const AppPromo = () => {
  const f = useCurrentFrame();
  return (
    <AbsoluteFill style={{ fontFamily: FONT, background: C.bg, overflow: 'hidden' }}>
      <Background />
      {SCENES.map(([Scene, from, to], i) => (f >= from && f < to ? <Scene key={i} f={f} /> : null))}

      <Audio src={staticFile('promo/bgm.mp3')} trimBefore={BGM_TRIM} volume={bgmVolume} />
      {SFX.map((s) => (
        <Sequence key={`${s.src}${s.at}`} from={s.at} durationInFrames={60}>
          <Audio src={staticFile(s.src)} volume={s.volume} />
        </Sequence>
      ))}
    </AbsoluteFill>
  );
};
