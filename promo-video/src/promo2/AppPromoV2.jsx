import React from 'react';
import { AbsoluteFill, Audio, Sequence, staticFile, useCurrentFrame } from 'remotion';
import '../promo/fonts.js';
import { C, FONT, SONG, T2, ease } from './theme2.js';
import { Sky, skyLight } from './Sky.jsx';
import { ClockHud } from './Hud.jsx';
import { Prologue } from './scenes/Prologue.jsx';
import { Logo } from './scenes/Logo.jsx';
import { Class, Home, Lunch, SUBMIT, Tasks } from './scenes/Day.jsx';
import { Navi } from './scenes/Navi.jsx';
import { COUPON_TAP, Festival } from './scenes/Festival.jsx';
import { Wall } from './scenes/Wall.jsx';
import { Finale } from './scenes/Finale.jsx';
import { LOCK_NOTES } from './overlays.jsx';

// ScienceTokyo App 紹介アニメーション ver2（約59秒）
// アプリの実画面（デモモードで撮影）を使い、ある学生の1日（朝 → 授業 → 昼 → 放課後 → 週末の工大祭）をたどる。
// 各シーンはグローバルフレーム f を受け取り、自分の表示区間だけ描画する。
const SCENES = [
  [Prologue, 0, T2.logo + 1],
  [Logo, T2.logo - 20, T2.home + 2],
  [Home, T2.home - 14, T2.navi + 2],
  [Navi, T2.navi - 18, T2.cls + 2],
  [Class, T2.cls - 14, T2.lunch + 2],
  [Lunch, T2.lunch - 14, T2.tasks + 2],
  [Tasks, T2.tasks - 14, T2.fest + 2],
  [Festival, T2.fest - 14, T2.wall + 2],
  [Wall, T2.wall - 10, T2.end + 2],
  [Finale, T2.end - 4, T2.total],
];

// duck: 効果音の間だけ BGM を何割下げるか
const pop = (at, volume = 0.24) => ({ src: 'promo/sfx/pop.wav', at, volume, duck: 0, len: 4 });
const SFX = [
  ...LOCK_NOTES.map((n) => pop(n.at, 0.26)),
  { src: 'promo/sfx/whoosh.wav', at: T2.logo - 20, volume: 0.55, duck: 0.2, len: 22 },
  { src: 'promo/sfx/whoosh.wav', at: T2.navi - 18, volume: 0.42, duck: 0.15, len: 20 },
  { src: 'promo/sfx/chime.wav', at: T2.tasks + 6, volume: 0.44, duck: 0.4, len: 36 },
  pop(T2.tasks + 32), pop(T2.tasks + SUBMIT.pick), pop(T2.tasks + SUBMIT.press),
  { src: 'promo/sfx/success.wav', at: T2.tasks + SUBMIT.done, volume: 0.36, duck: 0.35, len: 30 },
  pop(T2.fest + COUPON_TAP),
  { src: 'promo/sfx/success.wav', at: T2.fest + COUPON_TAP + 4, volume: 0.34, duck: 0.3, len: 30 },
  { src: 'promo/sfx/whoosh.wav', at: T2.wall - 12, volume: 0.42, duck: 0.15, len: 20 },
  { src: 'promo/sfx/whoosh.wav', at: T2.wall + 122, volume: 0.42, duck: 0.15, len: 20 },
];

const BGM_VOLUME = 0.78;
const ducking = (fr) => SFX.reduce((m, s) => {
  if (!s.duck) return m;
  const k = Math.min(ease(fr, [s.at - 3, s.at + 2], [0, 1]), 1 - ease(fr, [s.at + s.len, s.at + s.len + 8], [0, 1]));
  return Math.max(m, s.duck * k);
}, 0);

// 曲は2か所を使う（A: ブレイク〜ベース復帰、B: 最後の4小節）。8小節の区切りで、2フレームかけて等パワーで入れ替える
const XF = 2;
const xfade = (fr) => ease(fr, [SONG.partA.until - XF / 2, SONG.partA.until + XF / 2], [0, 1], (x) => x);
const volA = (fr) => BGM_VOLUME * Math.cos((xfade(fr) * Math.PI) / 2) * (1 - ducking(fr));
const volB = (fr) => {
  const g = fr + SONG.partB.at; // Sequence の中は 0 から数えるので全体のフレームに直す
  return BGM_VOLUME * Math.sin((xfade(g) * Math.PI) / 2) * (1 - ducking(g));
};

export const AppPromoV2 = () => {
  const f = useCurrentFrame();
  const dark = skyLight(f) < 0.45;
  return (
    <AbsoluteFill style={{ fontFamily: FONT, background: C.bg, overflow: 'hidden' }}>
      <Sky />
      {SCENES.map(([Scene, from, to], i) => (f >= from && f < to ? <Scene key={i} f={f} /> : null))}
      <ClockHud f={f} ink={dark ? '#ffffff' : '#0e2030'} sub={dark ? 'rgba(255,255,255,0.7)' : '#5b7a94'} />

      <Sequence from={0} durationInFrames={SONG.partA.until + XF}>
        <Audio src={staticFile(SONG.file)} trimBefore={SONG.partA.from} volume={volA} />
      </Sequence>
      <Sequence from={SONG.partB.at}>
        <Audio src={staticFile(SONG.file)} trimBefore={SONG.partB.from - (SONG.partA.until - SONG.partB.at)} volume={volB} />
      </Sequence>
      {SFX.map((s) => (
        <Sequence key={`${s.src}${s.at}`} from={s.at} durationInFrames={45}>
          <Audio src={staticFile(s.src)} volume={s.volume} />
        </Sequence>
      ))}
    </AbsoluteFill>
  );
};
