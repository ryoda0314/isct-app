import React from 'react';
import { AbsoluteFill, Audio, Img, Sequence, staticFile, useCurrentFrame } from 'remotion';
import '../promo/fonts.js';
import { EASE_IN, EASE_IN_OUT, EASE_OUT, FONT, SONG, ease, mix, sp } from '../film/theme.js';
import { FilmFlow, Laptop, flowTaps, recMeta, recSrc } from '../film/Device.jsx';
import { Caps, Rise } from '../film/type.jsx';
import { PhoneAt, poseAt } from '../film/stage.jsx';
import { Burst, IconAssembly } from '../promo/scenes/Reveal.jsx';
import { Icon } from '../promo/icons.jsx';

// X（Twitter）のタイムライン用（1080x1080・約30秒）。音なしで自動再生されても伝わるよう、見出しは画面の上に大きく。
// 端末の画面はすべてアプリを実際に操作した動画（capture/record_film.mjs の rec_x_*。工大祭のお知らせは撮影のときに隠している）。
// 曲は最高傑作版と同じ曲の終盤（4512f〜）。最後の一打（852f）でエンドカードを締める。1小節 = 48 フレーム、操作は拍（12 フレーム）に合わせてある。
export const XS = 1080;
export const TX = {
  hook: 0, // 1拍ごとにテーマが替わるホーム「大学生活を、ひとつに。」
  tt: 96, // 時間割 → 授業のチャットで投票
  navi: 192, // 3Dキャンパスナビ（3小節）
  asgn: 336, // 課題をアプリで提出
  free: 432, // 空き教室
  dm: 528, // DM とスタンプ
  desk: 624, // スマホでも、PCでも（1小節）
  end: 672, // エンドカード
  hit: 852, // 曲の最後の一打
  total: 918,
};
const SONG_FROM = 4512; // 曲のこのフレーム（最高傑作版の時間軸）から使う。小節の頭

const FLOW = [
  { at: TX.hook, rec: 'rec_x_home' },
  { at: TX.tt, rec: 'rec_x_tt' },
  { at: TX.navi, rec: 'rec_x_navi', from: 12 }, // 入力の途中から。「案内を開始」が場面の終わりの12フレーム前に来る
  { at: TX.asgn, rec: 'rec_x_asgn' },
  { at: TX.free, rec: 'rec_x_free' },
  { at: TX.dm, rec: 'rec_x_dm' },
];
const TAPS = flowTaps(FLOW);
const THEME_AT = (recMeta('rec_x_home').marks || []).map(([mf]) => TX.hook + mf);
// テーマが替わる順（rec_x_home と同じ）と、その色
const THEME_COL = ['#28c868', '#6375f0', '#1e7ac8', '#d4507a', '#3a9878', '#8b60c8', '#d4782a', '#28c868'];
const DESK_AT = TX.desk - 14; // PC の動画（rec_desk）。36・60 コマ目のクリックが拍に来る

const SECTIONS = [
  { at: TX.tt, until: TX.navi, en: 'Timetable', jp: ['時間割も、', '授業のチャットも。'] },
  { at: TX.navi, until: TX.asgn, en: '3D Campus Navigation', jp: ['教室まで、', '3Dで道案内。'] },
  { at: TX.asgn, until: TX.free, en: 'Assignments', jp: ['締切も、提出も、', 'アプリで完結。'] },
  { at: TX.free, until: TX.dm, en: 'Free Rooms', jp: ['空き教室が、', 'すぐわかる。'] },
  { at: TX.dm, until: TX.desk, en: 'Messages', jp: ['仲間とも、', 'すぐつながる。'] },
  { at: TX.desk, until: TX.end, en: 'Phone & Desktop', jp: ['スマホでも、', 'PCでも。'] },
];

const hexRgb = (h) => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };

// 背景：明るい空色。冒頭はテーマの色の光が端末の後ろで替わる
const Background = ({ f }) => {
  let i = 0;
  while (i < THEME_AT.length && f >= THEME_AT[i]) i++;
  const [r, g, b] = hexRgb(THEME_COL[i] || THEME_COL[0]);
  const hook = 1 - ease(f, [TX.tt - 8, TX.tt + 8], [0, 1]);
  return (
    <AbsoluteFill style={{ background: 'linear-gradient(180deg, #dcecf8 0%, #eef6fb 45%, #fbfdff 100%)' }}>
      <div style={{ position: 'absolute', left: 540 - 520, top: 640 - 480, width: 1040, height: 960, borderRadius: '50%', opacity: 0.85 * hook, background: `radial-gradient(ellipse, rgba(${r},${g},${b},0.45) 0%, rgba(${r},${g},${b},0.12) 45%, rgba(${r},${g},${b},0) 70%)` }} />
      {[['40,200,104', 120, 900, 520], ['26,156,240', 980, 260, 560]].map(([c, x, y, rr], k) => (
        <div key={k} style={{ position: 'absolute', left: x + 60 * Math.sin(f / 40 + k * 2) - rr, top: y + 40 * Math.cos(f / 50 + k) - rr, width: rr * 2, height: rr * 2, borderRadius: '50%', background: `radial-gradient(circle, rgba(${c},0.16) 0%, rgba(${c},0) 65%)` }} />
      ))}
    </AbsoluteFill>
  );
};

const phonePose = (f) => poseAt([
  { f: -2, x: 540, y: 1500, s: 0.86, rx: 30 },
  // タイムラインのスマホでも画面の中が読めるよう大きく置き、下は少しはみ出させる
  { f: 14, x: 540, y: 720, s: 0.92, ry: -6 },
  { f: TX.tt - 6, x: 540, y: 720, s: 0.92, ry: 6, ease: (x) => x },
  { f: TX.tt + 10, x: 540, y: 735, s: 0.9, ry: -4 },
  { f: TX.desk - 10, x: 540, y: 735, s: 0.9, ry: 4, ease: (x) => x },
  { f: TX.desk + 8, x: 900, y: 780, s: 0.5, ry: -14 },
  { f: TX.end - 6, x: 900, y: 780, s: 0.5, ry: -12 },
  { f: TX.end + 10, x: 900, y: 1500, s: 0.5, rx: 20, o: 0 },
], f);

// 場面の頭で端末が少し弾む
const bumpAt = (f) => SECTIONS.reduce((m, s) => (f >= s.at && f < s.at + 16 ? Math.max(m, Math.exp(-(f - s.at) / 4) * Math.sin(((f - s.at) / 16) * Math.PI)) : m), 0);

const Headline = ({ f }) => (
  <>
    {/* 冒頭 */}
    <div style={{ position: 'absolute', left: 0, right: 0, top: 70, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, zIndex: 50 }}>
      <Caps text="ScienceTokyo App" f={f} d={4} exitAt={TX.tt - 10} color="#3a6a8e" align="center" />
      <Rise segs={[{ t: '大学生活を、' }, { t: 'ひとつに', grad: true }, { t: '。' }]} f={f} d={8} exitAt={TX.tt - 10} size={82} weight={900} color="#0e2030" glow="0 4px 30px rgba(255,255,255,0.9)" />
    </div>
    {SECTIONS.map((s) => (
      <div key={s.en} style={{ position: 'absolute', left: 0, right: 0, top: 46, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, zIndex: 50 }}>
        <Caps text={s.en} f={f} d={s.at + 2} exitAt={s.until - 8} color="#3a6a8e" align="center" />
        <Rise segs={s.jp[0]} f={f} d={s.at + 4} exitAt={s.until - 8} size={66} weight={900} color="#0e2030" glow="0 4px 30px rgba(255,255,255,0.9)" />
        <Rise segs={[{ t: s.jp[1], grad: true }]} f={f} d={s.at + 8} exitAt={s.until - 8} size={66} weight={900} color="#0e2030" glow="0 4px 30px rgba(255,255,255,0.9)" />
      </div>
    ))}
  </>
);

// PC の画面（操作動画）とカーソル
const LAP = { x: 90, y: 330, w: 760 };
const DeskScreen = ({ f }) => {
  const R = recMeta('rec_desk');
  const i = Math.max(0, Math.min(R.frames - 1, Math.round(f - DESK_AT)));
  const sc = LAP.w / 1440;
  const pts = [[TX.desk - 8, 700, 640], ...R.taps.filter(([tf]) => tf > 14).map(([tf, x, y]) => [DESK_AT + tf - 2, x, y])];
  let cx = pts[0][1];
  let cy = pts[0][2];
  for (let j = 0; j < pts.length - 1; j++) {
    const [fa, xa, ya] = pts[j];
    const [fb, xb, yb] = pts[j + 1];
    if (f >= fa) {
      const t = ease(f, [fa + Math.max(0, fb - fa - 14), fb], [0, 1], EASE_IN_OUT);
      cx = mix(xa, xb, t);
      cy = mix(ya, yb, t);
    }
  }
  return (
    <>
      <Img maxRetries={8} src={recSrc('rec_desk', i)} style={{ position: 'absolute', left: 0, top: 0, width: LAP.w, height: (LAP.w * 900) / 1440 }} />
      <svg width="22" height="29" viewBox="0 0 26 34" style={{ position: 'absolute', left: cx * sc - 3, top: cy * sc - 2, filter: 'drop-shadow(0 2px 3px rgba(0,0,0,0.35))' }}>
        <path d="M3 2 L3 27 L9.5 21 L14 31 L18 29 L13.6 19.4 L22 19.4 Z" fill="#111" stroke="#fff" strokeWidth="2" strokeLinejoin="round" />
      </svg>
    </>
  );
};
const Desk = ({ f }) => {
  if (f < TX.desk - 12 || f > TX.end + 12) return null;
  const enter = ease(f, [TX.desk - 10, TX.desk + 8], [0, 1], EASE_OUT);
  const out = ease(f, [TX.end - 6, TX.end + 8], [0, 1], EASE_IN);
  return (
    <Laptop x={LAP.x} y={LAP.y + mix(80, 0, enter) + out * 600} w={LAP.w} opacity={enter * (1 - out)}>
      <DeskScreen f={f} />
    </Laptop>
  );
};

// エンドカード
const ICON = { cx: 540, cy: 300, size: 200 };
const End = ({ f }) => {
  const e = f - TX.end;
  if (e < -8) return null;
  const hit = f >= TX.hit ? Math.exp(-(f - TX.hit) / 7) : 0;
  const urlP = sp(e, 30, { damping: 14, stiffness: 160 });
  const qrP = sp(e, 44, { damping: 15, stiffness: 150 });
  return (
    <AbsoluteFill style={{ opacity: ease(e, [-6, 10], [0, 1]) }}>
      <Burst k={e - 2} cx={ICON.cx} cy={ICON.cy} />
      <Burst k={f - TX.hit} cx={ICON.cx} cy={ICON.cy} />
      <div style={{ position: 'absolute', inset: 0, transform: `scale(${1 + 0.05 * hit})`, transformOrigin: `${ICON.cx}px ${ICON.cy}px` }}>
        <IconAssembly r={e} size={ICON.size} cx={ICON.cx} cy={ICON.cy} flight={false} />
      </div>
      <div style={{ position: 'absolute', top: 440, left: 0, right: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
        <Rise segs={[{ t: 'ScienceTokyo ' }, { t: 'App', grad: true }]} f={e} d={8} size={92} weight={900} color="#0e2030" stagger={1} />
        <Rise segs="大学生活を、ひとつに。" f={e} d={18} size={42} weight={800} color="#1b2b3c" stagger={1.5} blur={10} />
      </div>
      <div style={{ position: 'absolute', top: 690, left: 0, right: 0, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 28 }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 14, padding: '12px 16px 12px 30px', borderRadius: 46, background: '#fff',
          boxShadow: `0 26px 50px -26px rgba(14,32,48,0.45), 0 0 0 1px rgba(14,32,48,0.06), 0 0 0 ${10 * hit}px rgba(40,200,104,${0.25 * hit})`,
          opacity: ease(e, [30, 36], [0, 1]), transform: `translateY(${(1 - urlP) * 24}px) scale(${(0.85 + 0.15 * urlP) * (1 + 0.04 * hit)})`,
        }}>
          <span style={{ fontSize: 34, fontWeight: 800, color: '#0e2030' }}>sciencetokyo.app</span>
          <div style={{ width: 48, height: 48, borderRadius: 24, background: '#28c868', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="arr" size={24} color="#fff" sw={2.6} />
          </div>
        </div>
        <div style={{ padding: 9, borderRadius: 14, background: '#fff', boxShadow: '0 20px 40px -24px rgba(14,32,48,0.5)', opacity: Math.min(1, qrP * 1.4), transform: `scale(${0.8 + 0.2 * qrP})` }}>
          <Img maxRetries={8} src={staticFile('film/qr.png')} style={{ width: 104, height: 104, display: 'block' }} />
        </div>
      </div>
      <div style={{ position: 'absolute', top: 850, left: 0, right: 0, textAlign: 'center', fontSize: 26, fontWeight: 700, color: '#3a5870', opacity: ease(e, [50, 62], [0, 1]) }}>
        時間割・3Dナビ・課題・空き教室・DM・成績 ほか30以上の機能
      </div>
      <div style={{ position: 'absolute', top: 960, left: 0, right: 0, textAlign: 'center', fontSize: 20, color: '#7898b0', opacity: ease(e, [60, 72], [0, 1]) }}>
        ※ 東京科学大学の学生アカウントが必要です
      </div>
    </AbsoluteFill>
  );
};

// 効果音
const fx = (src, at, volume, dur = 1.5) => ({ src, at, volume, dur });
const SFX = [
  fx('film/sfx/swish.wav', 0, 0.36),
  ...THEME_AT.map((at) => fx('film/sfx/tick.wav', at, 0.28, 0.3)),
  ...SECTIONS.map((s) => fx('film/sfx/swish.wav', s.at - 4, 0.3)),
  ...TAPS.map((at) => fx('promo/sfx/pop.wav', at, 0.13)),
  fx('promo/sfx/success.wav', TX.asgn + 76, 0.32), // 「提出しました」
  ...(recMeta('rec_desk').taps.filter(([tf]) => tf > 14).map(([tf]) => fx('promo/sfx/pop.wav', DESK_AT + tf, 0.12))),
  fx('promo/sfx/whoosh.wav', TX.end - 10, 0.45),
  fx('film/sfx/shimmer.wav', TX.end + 4, 0.3, 2),
  fx('film/sfx/shimmer.wav', TX.hit, 0.4, 2),
];

export const XPromo = () => {
  const f = useCurrentFrame();
  const pose = phonePose(f);
  const bump = bumpAt(f);
  return (
    <AbsoluteFill style={{ fontFamily: FONT, overflow: 'hidden', background: '#eef6fb' }}>
      <Background f={f} />
      <Desk f={f} />
      <PhoneAt pose={{ ...pose, s: pose.s * (1 + 0.025 * bump) }}>
        <FilmFlow f={f} screens={FLOW} slide={12} />
      </PhoneAt>
      {f < TX.end + 4 && <Headline f={f} />}
      <End f={f} />
      <Sequence from={0}>
        <Audio src={staticFile(SONG.file)} trimBefore={SONG_FROM + SONG.from} volume={(fr) => SONG.volume * ease(fr, [0, 4], [0, 1])} />
      </Sequence>
      {SFX.map((s, i) => (
        <Sequence key={`${i}${s.src}${s.at}`} from={s.at} durationInFrames={Math.ceil(s.dur * 30)}>
          <Audio src={staticFile(s.src)} volume={s.volume} />
        </Sequence>
      ))}
    </AbsoluteFill>
  );
};
