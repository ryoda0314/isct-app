import React from 'react';
import { AbsoluteFill, Img, staticFile, useCurrentFrame } from 'remotion';
import '../promo/fonts.js';
import { BG, C, EASE_IN, EASE_IN_OUT, EASE_OUT, FONT, SONG_S, SW, TS, ease, mix, sp } from './theme.js';
import { Background, Caption, Lift, NewBadge, Pill, SongTrack, Sparkle } from './parts.jsx';
import { CharPop, Headline, SubCopy } from '../promo/text.jsx';
import { Icon } from '../promo/icons.jsx';
import { Burst, IconAssembly } from '../promo/scenes/Reveal.jsx';
import { Phone3D, RealScreen, ScreenFlow, StatusBar2, SCREEN_H, SCREEN_W, STATUS_H } from '../promo2/Device.jsx';
import { CouponUsed, SubmitSheet, Tap } from '../promo2/overlays.jsx';

// ScienceTokyo App　インスタのストーリー用の縦動画（約20秒）。
// ver2 と同じ実画面（デモモードで撮影）と、キャンパスナビの3D表示を1コマずつ撮った連番（capture/capture_story.mjs）を使う。
// 1台のスマホを画面の下半分に置いたまま中身を切り替え、上の見出しを1小節ごとに替えていく。

// 3D表示の連番（1コマずつカメラを動かして撮った 390x770 の2倍）
const RISE_N = 56;
const RiseScreen = ({ k }) => {
  const i = Math.max(0, Math.min(RISE_N - 1, Math.round(k)));
  return (
    <div style={{ position: 'absolute', inset: 0, background: '#f6fafd', overflow: 'hidden' }}>
      <Img src={staticFile(`story/rise/rise_${String(i).padStart(3, '0')}.jpg`)} style={{ position: 'absolute', left: 0, top: STATUS_H, width: SCREEN_W, height: 770 }} />
      <StatusBar2 />
      <div style={{ position: 'absolute', bottom: 7, left: SCREEN_W / 2 - 67, width: 134, height: 5, borderRadius: 3, background: '#0e2030', opacity: 0.85, zIndex: 95 }} />
    </div>
  );
};

// ── 1台のスマホ（0〜440f）。中身は ScreenFlow で切り替える ──
const RISE_AT = TS.navi + 4; // 連番を流し始める（56コマ）
const PhoneTrack = ({ f }) => {
  if (f > TS.wall + 14) return null;
  const enter = sp(f, -2, { damping: 15, stiffness: 110, mass: 0.9 });
  const navi = ease(f, [TS.navi - 8, TS.navi + 10], [0, 1], EASE_IN_OUT) * (1 - ease(f, [TS.cls - 10, TS.cls + 4], [0, 1], EASE_IN_OUT));
  const exit = ease(f, [TS.wall - 6, TS.wall + 12], [0, 1], EASE_IN);
  // 場面が替わる小節の頭で、少しだけ弾む
  const beats = [TS.navi, TS.cls, TS.lunch, TS.tasks, TS.fest];
  const bump = beats.reduce((m, b) => (f >= b && f < b + 16 ? Math.max(m, Math.exp(-(f - b) / 4) * Math.sin(((f - b) / 16) * Math.PI)) : m), 0);
  const scale = mix(1.17, 1.26, navi) * (1 + 0.025 * bump);
  const y = mix(2350, 1175, enter) + mix(0, -20, navi) + exit * 1400 + 7 * Math.sin(f / 28);
  const ry = mix(-18, 0, enter) + 4 * Math.sin(f / 46);
  const rx = mix(14, 2, enter) + 2 * Math.sin(f / 38);
  const shots = [
    { at: 0, name: 'home_tall', scroll: (k) => ease(k, [26, 90], [0, 320], EASE_IN_OUT) },
    { at: TS.navi + 4, el: <RiseScreen k={f - RISE_AT} />, mode: 'fade' },
    { at: TS.navi + 82, name: 'navi3d_route' },
    { at: TS.navi + 110, name: 'navi3d_guide' },
    { at: TS.cls + 6, name: 'timetable' },
    { at: TS.cls + 28, name: 'attendance' },
    { at: TS.lunch + 6, name: 'freeroom' },
    { at: TS.lunch + 28, name: 'dm_chat' },
    { at: TS.tasks + 6, el: <RealScreen name="asgn_detail"><SubmitSheet t={f - (TS.tasks + 6)} pick={8} press={20} done={30} /></RealScreen> },
    { at: TS.fest + 6, name: 'festival_tall', scroll: (k) => ease(k, [TS.fest + 6, TS.fest + 22], [0, 470], EASE_IN_OUT) },
    { at: TS.fest + 26, el: <RealScreen name="booth_coupon"><CouponUsed t={f - (TS.fest + 37)} /></RealScreen> },
  ];
  return (
    <Phone3D x={SW / 2} y={y} scale={scale} rx={rx} ry={ry} opacity={1 - ease(f, [TS.wall + 2, TS.wall + 14], [0, 1])} shadow={0.9}>
      <ScreenFlow f={f} screens={shots} />
      {/* 課題：ファイルを選んで提出 */}
      <Tap x={195} y={STATUS_H + 560} f={f} at={TS.tasks + 14} />
      <Tap x={195} y={STATUS_H + 700} f={f} at={TS.tasks + 26} />
      {/* ルート → 案内を開始 */}
      <Tap x={195} y={STATUS_H + 670} f={f} at={TS.navi + 96} />
      {/* 工大祭：クーポンを使う */}
      <Tap x={195} y={STATUS_H + 356} f={f} at={TS.fest + 34} />
    </Phone3D>
  );
};

// ── 0–96 つかみ：大学生活、ぜんぶ入り。 ──
const Hook = ({ f }) => {
  if (f >= TS.navi + 4) return null;
  const out = ease(f, [TS.navi - 10, TS.navi], [0, 1], EASE_IN);
  return (
    <AbsoluteFill>
      <Pill g={f} d={10} exitAt={TS.navi - 12} top={250}>
        <Img src={staticFile('promo/icon.png')} style={{ width: 52, height: 52, borderRadius: 13 }} />
        ScienceTokyo App
      </Pill>
      <div style={{ position: 'absolute', left: 0, right: 0, top: 346, display: 'flex', flexDirection: 'column', alignItems: 'center', opacity: 1 - out, transform: `translateY(${-out * 60}px)` }}>
        <CharPop segs="大学生活、" f={f} d={0} stagger={1.6} size={122} />
        <CharPop segs={[{ t: 'ぜんぶ入り', grad: true }, { t: '。' }]} f={f} d={8} stagger={1.8} size={140} />
      </div>
      {/* ホームのカードが浮き上がる（小節の頭で） */}
      <Lift f={f} at={48} until={TS.navi - 20} name="home" crop={{ x: 8, y: 132, w: 374, h: 142 }} x={20} y={930} scale={1.35} from={[-120, 40]} tilt={-6} />
      <Lift f={f} at={60} until={TS.navi - 18} name="home" crop={{ x: 10, y: 622, w: 370, h: 96 }} x={555} y={1400} scale={1.35} from={[120, 40]} tilt={6} />
    </AbsoluteFill>
  );
};

// ── 96–240 3Dキャンパスナビ ──
const Navi = ({ f }) => {
  const g = f - TS.navi;
  if (g < -6 || g > 150) return null;
  return (
    <AbsoluteFill>
      <Pill g={g} d={2} exitAt={136} top={250} bg="#0e2030" color="#ffffff">
        <span style={{ display: 'inline-flex', width: 50, height: 50, borderRadius: 25, background: '#28c868', alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="map" size={28} color="#fff" sw={2.2} />
        </span>
        キャンパスナビ
      </Pill>
      <NewBadge g={g} d={10} x={786} y={236} exitAt={134} />
      <Caption g={g} top={340} lines={[[{ t: '3D', grad: true }, { t: 'で、' }], [{ t: 'もう迷わない。' }]]} exitAt={136} size={104} d={4} />
    </AbsoluteFill>
  );
};

// ── 1小節ずつの機能紹介 ──
const Feature = ({ f, at, lines, sub, light = false, note }) => {
  const g = f - at;
  if (g < -4 || g > 52) return null;
  return (
    <AbsoluteFill>
      <Caption g={g} lines={lines} sub={sub} exitAt={40} light={light} size={104} top={336} />
      {note && (
        <div style={{ position: 'absolute', left: 0, right: 0, top: 590, textAlign: 'center', fontSize: 24, fontWeight: 600, color: light ? 'rgba(255,255,255,0.7)' : C.txD, opacity: ease(g, [8, 14], [0, 1]) * (1 - ease(g, [40, 46], [0, 1])) }}>
          {note}
        </div>
      )}
    </AbsoluteFill>
  );
};

// 工大祭のきらめき
const SPARKS = [[150, 640, 0], [930, 560, 9], [980, 1240, 17], [90, 1180, 23], [1000, 900, 31], [70, 860, 38], [880, 1500, 45], [210, 1520, 52]];
const Fest = ({ f }) => {
  const g = f - TS.fest;
  if (g < -4 || g > 52) return null;
  return (
    <AbsoluteFill>
      {SPARKS.map(([x, y, d], i) => <Sparkle key={i} x={x} y={y} k={(g - d + 300) % 60} s={i % 3 === 0 ? 1.3 : 0.9} />)}
      <Caption g={g} lines={[[{ t: '週末は、' }], [{ t: '工大祭', color: '#ffc46b' }, { t: '。' }]]} sub="学生限定クーポンも、アプリで。" light exitAt={40} size={104} top={290} />
      <div style={{ position: 'absolute', left: 0, right: 0, top: 622, textAlign: 'center', fontSize: 22, fontWeight: 600, color: 'rgba(255,255,255,0.62)', opacity: ease(g, [10, 16], [0, 1]) * (1 - ease(g, [42, 48], [0, 1])) }}>
        ※ 画面の出店はサンプルです
      </div>
    </AbsoluteFill>
  );
};

// ── 432–480 ほかにも、ぜんぶ入り。（実画面が縦に流れる壁）──
const WALL_COLS = [
  ['wall_grades', 'theme_sakura', 'wall_gym', 'wall_notes', 'theme_dark', 'wall_pocket'],
  ['wall_calendar', 'wall_reviews', 'theme_titech', 'wall_pomo', 'wall_music', 'theme_koyo'],
  ['wall_circles', 'theme_mizukumori', 'wall_pdftools', 'wall_languages', 'wall_exams', 'theme_peach'],
  ['wall_lecrec', 'wall_qr', 'theme_lavender', 'wall_friends', 'wall_events', 'wall_acadCal'],
];
const WS = 0.56;
const Wall = ({ f }) => {
  const g = f - TS.wall;
  if (g < -6 || g > 60) return null;
  const inP = ease(g, [-6, 10], [0, 1], EASE_OUT);
  const out = ease(g, [40, 50], [0, 1], EASE_IN);
  const w = SCREEN_W * WS;
  const h = SCREEN_H * WS;
  return (
    <AbsoluteFill style={{ opacity: inP * (1 - out) }}>
      <div style={{ position: 'absolute', left: 540, top: 960, width: 0, height: 0, transform: `rotate(-9deg) scale(${mix(1.25, 1.08, inP)})` }}>
        {WALL_COLS.map((col, ci) => {
          const dir = ci % 2 ? 1 : -1;
          const shift = dir * (g + 6) * 7 + (ci % 2 ? -h * 1.6 : -h * 1.1);
          return col.map((name, ri) => (
            <div key={name} style={{
              position: 'absolute', left: (ci - 1.5) * (w + 34) - w / 2, top: ri * (h + 34) + shift - h * 2,
              width: w, height: h, borderRadius: 52 * WS + 6, overflow: 'hidden', boxShadow: '0 30px 60px -20px rgba(0,0,0,0.6), 0 0 0 2px rgba(255,255,255,0.12)',
            }}>
              <div style={{ width: SCREEN_W, height: SCREEN_H, transform: `scale(${WS})`, transformOrigin: '0 0', position: 'relative' }}>
                <RealScreen name={name} />
              </div>
            </div>
          ));
        })}
      </div>
      <AbsoluteFill style={{ background: 'radial-gradient(ellipse 70% 32% at 50% 47%, rgba(5,8,22,0.82) 0%, rgba(5,8,22,0.55) 55%, rgba(5,8,22,0.15) 100%)' }} />
      <div style={{ position: 'absolute', left: 0, right: 0, top: 740, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <CharPop segs="ほかにも、" f={g} d={2} stagger={1.6} size={96} color="#ffffff" exitAt={40} />
        <CharPop segs={[{ t: 'ぜんぶ入り', grad: true }, { t: '。' }]} f={g} d={10} stagger={1.8} size={150} color="#ffffff" exitAt={40} />
        <div style={{ marginTop: 14 }}>
          <SubCopy text="成績・カレンダー・サークル・ノート・テーマ着せ替え…" f={g} d={18} exitAt={38} size={30} align="center" color="rgba(255,255,255,0.82)" />
        </div>
      </div>
    </AbsoluteFill>
  );
};

// ── 480〜 エンドカード。曲の最後の一打（SONG_S.stop）で締める ──
const ICON = { cx: 540, cy: 640, size: 300 };
const End = ({ f }) => {
  const e = f - TS.end;
  if (e < -2) return null;
  const hit = f >= SONG_S.stop ? Math.exp(-(f - SONG_S.stop) / 7) : 0;
  const urlP = sp(e, 30, { damping: 14, stiffness: 160 });
  const ctaP = sp(e, 52, { damping: 14, stiffness: 160 });
  const bob = Math.sin(Math.max(0, e - 52) / 5) * 8;
  return (
    <AbsoluteFill>
      <Burst k={e - 16} cx={ICON.cx} cy={ICON.cy} />
      <Burst k={f - SONG_S.stop} cx={ICON.cx} cy={ICON.cy} />
      <div style={{ position: 'absolute', inset: 0, transform: `scale(${1 + 0.05 * hit})`, transformOrigin: `${ICON.cx}px ${ICON.cy}px` }}>
        <IconAssembly r={e - 14} size={ICON.size} cx={ICON.cx} cy={ICON.cy} />
      </div>
      <div style={{ position: 'absolute', top: 840, left: 0, right: 0 }}>
        <Headline lines={[[{ t: 'ScienceTokyo ' }, { t: 'App', grad: true }]]} f={e} d={18} size={104} align="center" />
        <div style={{ marginTop: 18 }}>
          <SubCopy text={'東京科学大学生のための、\nぜんぶ入りキャンパスアプリ'} f={e} d={26} size={38} align="center" color={C.txH} />
        </div>
      </div>
      <div style={{ position: 'absolute', top: 1164, left: 0, right: 0, display: 'flex', justifyContent: 'center' }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 18, padding: '16px 18px 16px 38px', borderRadius: 56, background: '#fff',
          boxShadow: `0 26px 50px -26px rgba(14,32,48,0.45), 0 0 0 1px rgba(14,32,48,0.06), 0 0 0 ${12 * hit}px rgba(40,200,104,${0.25 * hit})`,
          opacity: ease(e, [30, 36], [0, 1]), transform: `translateY(${(1 - urlP) * 24}px) scale(${(0.85 + 0.15 * urlP) * (1 + 0.04 * hit)})`,
        }}>
          <span style={{ fontSize: 44, fontWeight: 800, color: C.txH, letterSpacing: '0.01em' }}>sciencetokyo.app</span>
          <div style={{ width: 62, height: 62, borderRadius: 31, background: C.accent, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="arr" size={30} color="#fff" sw={2.6} />
          </div>
        </div>
      </div>
      <div style={{ position: 'absolute', top: 1290, left: 0, right: 0, textAlign: 'center', fontSize: 32, fontWeight: 700, color: C.tx, opacity: ease(e, [40, 48], [0, 1]) }}>
        スマホでも、PCでも。
      </div>
      {/* リンクのスタンプを置く場所への誘導（スタンプは投稿するときに、この下に置く） */}
      <div style={{ position: 'absolute', top: 1392, left: 0, right: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, opacity: Math.min(1, ctaP * 1.4), transform: `translateY(${(1 - ctaP) * 20 + bob}px)` }}>
        <span style={{ fontSize: 30, fontWeight: 800, color: C.accentDeep || '#1fa557' }}>リンクからすぐ使える</span>
        <Icon name="chevDown" size={44} color={C.accentDeep || '#1fa557'} sw={3} />
      </div>
      <div style={{ position: 'absolute', top: 1520, left: 0, right: 0, textAlign: 'center', fontSize: 22, color: C.txD, opacity: ease(e, [56, 66], [0, 1]) }}>
        ※ 東京科学大学の学生アカウントが必要です
      </div>
    </AbsoluteFill>
  );
};

// ── 音 ──
const pop = (at, volume = 0.24) => ({ src: 'promo/sfx/pop.wav', at, volume, duck: 0, len: 4 });
const SFX = [
  { src: 'promo/sfx/whoosh.wav', at: TS.navi - 8, volume: 0.42, duck: 0.15, len: 20 },
  pop(TS.navi + 10, 0.22),
  pop(TS.navi + 96),
  pop(TS.tasks + 14), pop(TS.tasks + 26),
  { src: 'promo/sfx/success.wav', at: TS.tasks + 36, volume: 0.32, duck: 0.3, len: 26 },
  pop(TS.fest + 34),
  { src: 'promo/sfx/success.wav', at: TS.fest + 38, volume: 0.3, duck: 0.3, len: 26 },
  { src: 'promo/sfx/whoosh.wav', at: TS.wall - 8, volume: 0.42, duck: 0.15, len: 20 },
  { src: 'promo/sfx/chime.wav', at: TS.end + 14, volume: 0.36, duck: 0.3, len: 36 },
];
export const StoryPromo = () => {
  const f = useCurrentFrame();
  return (
    <AbsoluteFill style={{ fontFamily: FONT, overflow: 'hidden' }}>
      <Background f={f} keys={BG} />
      <Fest f={f} />
      <Wall f={f} />
      <PhoneTrack f={f} />
      <Hook f={f} />
      <Navi f={f} />
      <Feature f={f} at={TS.cls} lines={[[{ t: '授業も出欠も、' }], [{ t: '自動', grad: true }, { t: 'でそろう。' }]]} />
      <Feature f={f} at={TS.lunch} lines={[[{ t: '空き教室', grad: true }, { t: 'から、' }], [{ t: 'そのままDM。' }]]} />
      <Feature f={f} at={TS.tasks} lines={[[{ t: '締切も' }, { t: '提出', grad: true }, { t: 'も、' }], [{ t: 'アプリで。' }]]} />
      <End f={f} />

      <SongTrack song={SONG_S} sfx={SFX} />
    </AbsoluteFill>
  );
};
