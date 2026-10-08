import React from 'react';
import { AbsoluteFill, Audio, Sequence, staticFile, useCurrentFrame } from 'remotion';
import '../promo/fonts.js';
import { FONT, SKY, SONG, TL, ease, EASE_IN_OUT } from './theme.js';
import { Grain, Letterbox, SkyFill } from './fx.jsx';
import { Hero, Open } from './scenes/Opening.jsx';
import { Chaos } from './scenes/Chaos.jsx';
import { Break } from './scenes/Break.jsx';
import { Home, LIFTS } from './scenes/Home.jsx';
import { ASGN_DONE, Autumn, COUPON, Navi, NightMap, Spring, Summer, TAPS, Winter, WinterMap } from './scenes/Seasons.jsx';
import { CLICKS, TICKS, You } from './scenes/You.jsx';
import { All, Outro } from './scenes/Finale.jsx';

// ScienceTokyo App 紹介映像・最高傑作版（約3分・曲を頭から最後まで通しで使う）
// 春のキャンパスを空から見下ろすところから始まり、ブレイクでツバメがロゴになり、
// アプリの季節のテーマ（桜・新緑・紅葉・雪）とともに1年をたどって、曲の最後の一打で締める。
// 各場面はフレーム f を受け取り、自分の区間だけ描く。
const SCENES = [
  [Open, 0, TL.hero + 60],
  [Hero, TL.hero, TL.chaos + 2],
  [Chaos, TL.chaos - 8, TL.brk + 24],
  [Break, TL.brk - 6, TL.home + 6],
  [Home, TL.home - 30, TL.spring],
  [Spring, TL.spring, TL.navi + 6],
  [Navi, TL.navi - 10, TL.summer],
  [Summer, TL.summer, TL.autumn],
  // 秋の夜の地図と冬の地図は、端末の場面より下に描く背景の層（重ねて切り替える）
  [NightMap, TL.fest - 10, TL.winter + 4],
  [WinterMap, TL.winter - 18, TL.exams + 12],
  [Autumn, TL.autumn, TL.winter],
  [Winter, TL.winter, TL.you],
  [You, TL.you, TL.all + 2],
  [All, TL.all - 12, TL.outro + 6],
  [Outro, TL.outro - 8, TL.total],
];

// 効果音（public/promo/sfx・public/film/sfx。どちらも numpy で合成したもの）。
// duck: 効果音の間だけ曲を何割下げるか、len: 下げておくフレーム数、dur: 鳴らしておく秒数
const fx = (src, at, volume, { duck = 0, len = 10, dur = 1.5 } = {}) => ({ src, at, volume, duck, len, dur });
const pop = (at, v = 0.16) => fx('promo/sfx/pop.wav', at, v);
const swish = (at, v = 0.42) => fx('film/sfx/swish.wav', at, v);
const shimmer = (at, v = 0.3) => fx('film/sfx/shimmer.wav', at, v, { dur: 2 });
const SFX = [
  // 冒頭：風の音の中に「4月。」→ 建物が立ち上がる
  fx('film/sfx/wind.wav', 0, 0.32, { dur: 6.4 }),
  shimmer(TL.rise - 2, 0.32),
  ...[300, 318, 336, 354].map((a) => pop(a, 0.14)),
  ...Array.from({ length: 10 }, (_, i) => pop(600 + i * 12, 0.11)), // 「？」が増えていく
  // 情報があちこちに → 限界まで増えて、ツバメが突き抜ける
  swish(TL.chaos - 6, 0.4),
  ...Array.from({ length: 6 }, (_, i) => pop(984 + i * 24, 0.1)), // 右上の通知
  fx('film/sfx/riser.wav', TL.brk - 96, 0.5, { dur: 3.3 }),
  fx('promo/sfx/whoosh.wav', TL.build + 156, 0.72, { duck: 0.15, len: 20 }),
  // ブレイク：空とツバメ → ドロップでロゴ
  fx('film/sfx/wind.wav', TL.brk, 0.36, { dur: 6.4 }),
  fx('film/sfx/wind.wav', TL.one2, 0.3, { dur: 6.4 }),
  swish(TL.one2 + 40, 0.3),
  fx('promo/sfx/whoosh.wav', TL.land - 22, 0.6, { duck: 0.2, len: 22 }),
  fx('film/sfx/impact.wav', TL.land, 0.6, { duck: 0.32, len: 30, dur: 2.6 }),
  shimmer(TL.land + 2, 0.36),
  ...LIFTS.map((at) => pop(at)), // ホームの分解図：カードが1枚ずつ浮き上がる
  // 季節の扉（風切り）と、テーマをタップしてアプリの色が変わる瞬間（きらめき）
  ...[TL.spring, TL.summer, TL.autumn, TL.winter].flatMap((at) => [swish(at - 4, 0.4), shimmer(at + 48, 0.24)]),
  // アプリを操作している動画の中のタップ
  ...TAPS.map((at) => pop(at, 0.13)),
  pop(TL.navi + 168, 0.2), shimmer(TL.navi + 170, 0.28),
  // 夏：締切の通知 → アプリで課題を提出
  fx('promo/sfx/chime.wav', TL.asgn + 8, 0.44, { duck: 0.35, len: 30 }),
  fx('promo/sfx/success.wav', ASGN_DONE, 0.36, { duck: 0.3, len: 26 }),
  // 秋：クーポンを使う
  fx('promo/sfx/success.wav', COUPON.used, 0.34, { duck: 0.3, len: 26 }),
  // 冬：成績のカード
  ...[0, 8, 16, 24].map((d) => pop(TL.exams + 96 + d, 0.12)),
  // テーマ・言語をタップ（1拍ごと）・スマホとPC（PC のクリック）
  ...TICKS.map((at) => fx('film/sfx/tick.wav', at, 0.3, { dur: 0.3 })),
  swish(TL.devices - 4, 0.36),
  ...CLICKS.map((at) => pop(at, 0.12)),
  // 機能の壁 → エンドカード
  swish(TL.all - 6, 0.3),
  fx('promo/sfx/whoosh.wav', TL.outro - 30, 0.5, { duck: 0.1, len: 20 }),
  fx('promo/sfx/whoosh.wav', TL.outro + 4, 0.4),
  shimmer(TL.hit, 0.42),
];

const ducking = (fr) => SFX.reduce((m, s) => {
  if (!s.duck) return m;
  const k = Math.min(ease(fr, [s.at - 3, s.at + 2], [0, 1]), 1 - ease(fr, [s.at + s.len, s.at + s.len + 10], [0, 1]));
  return Math.max(m, s.duck * k);
}, 0);

export const AppPromoFilm = () => {
  const f = useCurrentFrame();
  // 映画の黒帯：冒頭からドロップ（ロゴ）まで。ドロップで上下に開く
  const bars = 1 - ease(f, [TL.land, TL.land + 18], [0, 1], EASE_IN_OUT);
  return (
    <AbsoluteFill style={{ fontFamily: FONT, background: '#000', overflow: 'hidden' }}>
      <SkyFill f={f} keys={SKY} />
      {SCENES.map(([Scene, from, to], i) => (f >= from && f < to ? <Scene key={i} f={f} /> : null))}
      <Grain f={f} opacity={0.06} />
      <Letterbox k={bars} />

      <Sequence from={0}>
        <Audio src={staticFile(SONG.file)} trimBefore={SONG.from} volume={(fr) => SONG.volume * ease(fr, [0, 3], [0, 1]) * (1 - ducking(fr))} />
      </Sequence>
      {SFX.map((s, i) => (
        <Sequence key={`${i}${s.src}${s.at}`} from={s.at} durationInFrames={Math.ceil((s.dur || 1.5) * 30)}>
          <Audio src={staticFile(s.src)} volume={s.volume} />
        </Sequence>
      ))}
    </AbsoluteFill>
  );
};
