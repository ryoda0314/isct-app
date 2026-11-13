import React from 'react';
import { AbsoluteFill, Audio, Img, Sequence, staticFile, useCurrentFrame } from 'remotion';
import '../promo/fonts.js';
import { EASE_IN, EASE_IN_OUT, EASE_OUT, FONT, ease } from '../film/theme.js';
import { Grain, Letterbox, Vignette } from '../film/fx.jsx';
import { Caps, Rise } from '../film/type.jsx';
import { BAR, PAD, SHOTS, TL, doyToDay, yearDoy } from './shots.js';

// 大岡山キャンパス 3D マップ紹介映像（CampusMapFilm・1920x1080・約3分）。
// 3D の連番（capture/capture_campus3d.mjs が out/c3d_public/shots/<id>/NNNN.jpg に撮ったもの）を、曲の拍に合わせて並べ、
// 字幕・時計・暦・切り替えの光・黒帯・効果音を重ねる。素材の置き場は render_campus3d.mjs の publicDir（out/c3d_public）。
//   前奏（夜明け）→ ビート：建物 8 棟 → ブレイク：時間が流れる → ドロップ：雷雨 → 雨・雪 → 1年 → 桜・イチョウ
//   → 駅の改札から Taki Plaza の中まで歩く → 夕暮れの電車・月の出・夜の明かり → 1 小節ずつのたたみかけ → 夕日の空へ → 終わりの画面

const pad4 = (n) => String(n).padStart(4, '0');
const FADE = 8;
// カットの入り方：flash（白い閃光）・fade（重ねて切り替え）・drop（ドロップの一撃）・cut（そのまま）
const ENTER = {
  honkan: 'flash', timelapse: 'fade', storm: 'drop', year: 'fade', xing: 'fade', gatewalk: 'fade', takiin1: 'fade', takiin2: 'fade',
  takiin3: 'fade', moonrise: 'fade', seven: 'fade', finale: 'flash', trains: 'flash', stnin: 'flash',
};
const enterOf = (S) => (S.montage ? 'flash' : ENTER[S.id] || 'cut');
const ORDER = [...SHOTS].sort((a, b) => a.at - b.at);
// たたみかけの場所の名前
const MONTAGE_NAME = {
  m_lib: '附属図書館', m_hyaku: '百年記念館', m_elsi: '地球生命研究所', m_ud: '石川台の地下通路', m_mc: '駅前の POINT A',
  m_s4: '南4号館の通り抜け', m_b2: 'Taki Plaza 地下 2 階', m_k70: '70周年記念講堂',
};
const nOf = (S) => S.len + PAD;
const uAt = (S, f) => Math.min(1, (f - S.at) / (nOf(S) - 1));

// その時刻に見せるカット（重ねて切り替えるあいだは前のカットも）
function layersAt(f) {
  let i = -1;
  for (let k = 0; k < ORDER.length; k++) if (ORDER[k].at <= f) i = k;
  if (i < 0) return [];
  const cur = ORDER[i];
  const out = [];
  const prev = ORDER[i - 1];
  if (prev && enterOf(cur) === 'fade' && f < cur.at + FADE && f - prev.at < nOf(prev)) out.push({ S: prev, o: 1 });
  out.push({ S: cur, o: enterOf(cur) === 'fade' && prev ? ease(f, [cur.at, cur.at + FADE], [0, 1], EASE_IN_OUT) : 1 });
  return out;
}

// 雷雨の稲妻（撮ったときと同じコマ）で画面をゆらす・白く
const STORM = SHOTS.find((s) => s.id === 'storm');
const STRIKES = (STORM?.flashes || []).map((x) => ({ at: STORM.at + x.f, near: x.kind === 'cg' && x.dist < 4, kind: x.kind }));
const shakeAt = (f) => {
  let k = 0;
  if (f >= TL.drop && f < TL.drop + 26) k = Math.max(k, 1 - (f - TL.drop) / 26);
  for (const s of STRIKES) if (s.near && f >= s.at && f < s.at + 14) k = Math.max(k, 0.55 * (1 - (f - s.at) / 14));
  if (k <= 0) return [0, 0];
  return [Math.sin(f * 2.7) * 14 * k, Math.cos(f * 3.3) * 10 * k];
};

const Shot = ({ S, f, o }) => {
  const g = Math.max(0, Math.min(nOf(S) - 1, f - S.at));
  return (
    <Img maxRetries={8} src={staticFile(`shots/${S.id}/${pad4(g)}.jpg`)}
      style={{ position: 'absolute', left: 0, top: 0, width: 1920, height: 1080, opacity: o }} />
  );
};

// 白い閃光（at で最大）
const flashK = (f, at, len, peak) => (f < at ? 0 : f < at + len ? peak * (1 - ease(f, [at, at + len], [0, 1], EASE_OUT)) : 0);
function whiteAt(f) {
  let k = 0;
  for (const S of ORDER) {
    const e = enterOf(S);
    if (e === 'flash') k = Math.max(k, flashK(f, S.at, S.montage ? 6 : 12, S.montage ? 0.45 : 0.85));
    if (e === 'drop') k = Math.max(k, flashK(f, S.at, 22, 1));
    if (e === 'cut' && S.at > TL.beat) k = Math.max(k, flashK(f, S.at, 5, 0.22));
  }
  for (const s of STRIKES) k = Math.max(k, flashK(f, s.at, 8, s.near ? 0.35 : 0.12));
  k = Math.max(k, flashK(f, TL.hit, 18, 0.6));
  return k;
}

// 字幕：左下に、英字の見出し・大きな名前・ひとこと
const Caption = ({ S, f, lift = 0 }) => {
  const c = S.cap;
  if (!c) return null;
  const d = S.at + 10;
  const end = S.at + Math.min(S.len, 230) - 20;
  if (f < d - 2 || f > end + 30) return null;
  const glow = '0 2px 18px rgba(0,0,0,0.55), 0 0 2px rgba(0,0,0,0.6)';
  const scrim = ease(f, [d - 2, d + 12], [0, 1], EASE_OUT) * (1 - ease(f, [end, end + 18], [0, 1], EASE_IN));
  return (
    <>
      <div style={{ position: 'absolute', left: 0, bottom: 0, width: 1200, height: 480 + lift, opacity: scrim, background: 'radial-gradient(ellipse 80% 90% at 0% 100%, rgba(0,0,0,0.58) 0%, rgba(0,0,0,0.22) 45%, rgba(0,0,0,0) 72%)' }} />
      <div style={{ position: 'absolute', left: 110, bottom: 118 + lift }}>
        <Caps text={c.en} f={f} d={d} exitAt={end} size={21} color="rgba(255,255,255,0.86)" line />
        <Rise segs={c.ja} f={f} d={d + 4} exitAt={end + 2} size={c.ja.length > 9 ? 70 : 92} weight={800} color="#ffffff" glow={glow} style={{ marginTop: 6 }} />
        {c.sub ? <Rise segs={c.sub} f={f} d={d + 14} exitAt={end + 4} size={30} weight={500} color="rgba(255,255,255,0.94)" stagger={0.55} dur={14} blur={8} glow={glow} style={{ marginTop: 10 }} /> : null}
      </div>
    </>
  );
};

// 時計（夜明け・時間が流れる・夕日）：右下に日付と時刻
const CLOCKS = { dawn: true, timelapse: true, finale: true, moonrise: true };
const hm = (ms) => { const d = new Date(ms + 9 * 3600000); return `${d.getUTCHours()}:${String(d.getUTCMinutes()).padStart(2, '0')}`; };
const md = (day) => { const [, m, d] = day.split('-').map(Number); return `${m}月${d}日`; };
const jst = (day, t) => Date.parse(`${day}T${t.length === 5 ? `${t}:00` : t}+09:00`);
const Clock = ({ S, f, lift = 0 }) => {
  if (!CLOCKS[S.id] || !S.env) return null;
  const u = uAt(S, f);
  const t0 = jst(S.env.day, S.env.hm);
  const t1 = S.env.until ? jst(S.env.day, S.env.until) : t0 + (nOf(S) / 30) * 1000 * (S.env.speed || 0);
  const now = t0 + (t1 - t0) * u;
  // 終わりの画面では消す
  const end = Math.min(S.at + S.len, TL.outro + 4);
  const k = ease(f, [S.at + 6, S.at + 22], [0, 1], EASE_OUT) * (1 - ease(f, [end - 14, end], [0, 1], EASE_IN));
  if (k <= 0) return null;
  return (
    <div style={{ position: 'absolute', right: 110, bottom: 112 + lift, textAlign: 'right', color: '#fff', opacity: k, textShadow: '0 2px 16px rgba(0,0,0,0.5)' }}>
      <div style={{ fontSize: 24, fontWeight: 600, letterSpacing: '0.12em', opacity: 0.85 }}>{md(S.env.day)}</div>
      <div style={{ fontSize: 78, fontWeight: 300, fontVariantNumeric: 'tabular-nums', letterSpacing: '0.02em', lineHeight: 1 }}>{hm(now)}</div>
    </div>
  );
};

// 1年がめぐる：右上に月と季節、1年の帯
const SEASON = (m) => (m <= 2 || m === 12 ? '冬' : m <= 5 ? '春' : m <= 8 ? '夏' : '秋');
const YearDial = ({ S, f }) => {
  if (S.id !== 'year') return null;
  const u = uAt(S, f);
  const doy = yearDoy(u);
  const day = doyToDay(doy);
  const m = Number(day.slice(5, 7));
  const k = ease(f, [S.at + 4, S.at + 20], [0, 1], EASE_OUT) * (1 - ease(f, [S.at + S.len - 10, S.at + S.len + 4], [0, 1], EASE_IN));
  const months = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'];
  return (
    <div style={{ position: 'absolute', right: 110, top: 96, width: 520, color: '#fff', opacity: k, textShadow: '0 2px 16px rgba(0,0,0,0.5)' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'flex-end', gap: 18 }}>
        <span style={{ fontSize: 40, fontWeight: 700 }}>{SEASON(m)}</span>
        <span style={{ fontSize: 96, fontWeight: 300, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>{m}<span style={{ fontSize: 44, marginLeft: 4 }}>月</span></span>
      </div>
      <div style={{ position: 'relative', height: 3, marginTop: 16, background: 'rgba(255,255,255,0.35)', borderRadius: 2 }}>
        <div style={{ position: 'absolute', left: 0, top: 0, height: 3, width: `${(doy / 365) * 100}%`, background: '#fff', borderRadius: 2 }} />
        <div style={{ position: 'absolute', left: `calc(${(doy / 365) * 100}% - 7px)`, top: -6, width: 14, height: 14, borderRadius: 7, background: '#fff' }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10, fontSize: 15, opacity: 0.75 }}>{months.map((x) => <span key={x}>{x}</span>)}</div>
    </div>
  );
};

// たたみかけ：右下に場所の名前
const MontageName = ({ S, f }) => {
  const name = MONTAGE_NAME[S.id];
  if (!name) return null;
  const k = ease(f, [S.at + 2, S.at + 10], [0, 1], EASE_OUT) * (1 - ease(f, [S.at + BAR - 8, S.at + BAR], [0, 1], EASE_IN));
  return (
    <div style={{ position: 'absolute', left: 110, bottom: 110, color: '#fff', opacity: k, fontSize: 46, fontWeight: 800, textShadow: '0 2px 16px rgba(0,0,0,0.6)', transform: `translateX(${(1 - k) * -24}px)` }}>
      {name}
    </div>
  );
};

// はじめのタイトル（夜明け）
const Title = ({ f }) => {
  if (f > TL.beat + 4) return null;
  return (
    <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ textAlign: 'center', marginTop: -40 }}>
        <Caps text="OOKAYAMA CAMPUS  3D" f={f} d={36} exitAt={176} size={24} color="rgba(255,255,255,0.88)" align="center" />
        <Rise segs="大岡山キャンパス" f={f} d={44} exitAt={172} size={128} weight={800} color="#ffffff" glow="0 4px 30px rgba(0,0,0,0.45)" style={{ marginTop: 10 }} />
        <Rise segs="時刻・季節・天気まで、まるごと 3D に" f={f} d={84} exitAt={178} size={34} weight={500} color="rgba(255,255,255,0.92)" stagger={0.6} glow="0 2px 18px rgba(0,0,0,0.5)" style={{ marginTop: 14 }} />
      </div>
    </AbsoluteFill>
  );
};

// 終わりの画面
const EndCard = ({ f }) => {
  if (f < TL.outro - 6) return null;
  const k = ease(f, [TL.outro, TL.outro + 30], [0, 1], EASE_OUT);
  return (
    <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center' }}>
      <AbsoluteFill style={{ background: 'linear-gradient(180deg, rgba(4,10,24,0.15) 0%, rgba(4,10,24,0.6) 100%)', opacity: k }} />
      <div style={{ textAlign: 'center', position: 'relative' }}>
        <Caps text="OOKAYAMA CAMPUS  3D MAP" f={f} d={TL.outro + 8} size={24} color="rgba(255,255,255,0.88)" align="center" />
        <Rise segs="大岡山キャンパス" f={f} d={TL.outro + 14} size={120} weight={800} color="#ffffff" glow="0 4px 30px rgba(0,0,0,0.5)" style={{ marginTop: 10 }} />
        <Rise segs="ScienceTokyo App　キャンパスナビ" f={f} d={TL.outro + 40} size={38} weight={600} color="rgba(255,255,255,0.95)" stagger={0.5} glow="0 2px 18px rgba(0,0,0,0.5)" style={{ marginTop: 18 }} />
        <Rise segs="sciencetokyo.app" f={f} d={TL.outro + 70} size={30} weight={500} color="rgba(255,255,255,0.8)" stagger={0.4} style={{ marginTop: 26 }} />
      </div>
      <div style={{ position: 'absolute', bottom: 40, width: '100%', textAlign: 'center', fontSize: 15, color: 'rgba(255,255,255,0.62)', opacity: ease(f, [TL.outro + 60, TL.outro + 90], [0, 1]) }}>
        地図・線路 © OpenStreetMap contributors ／ 標高 国土地理院 ／ 時刻表 駅探 ／ 映像はアプリの 3D 地図をそのまま撮影（時刻・天気はデバッグで指定）
      </div>
    </AbsoluteFill>
  );
};

// ── 音 ──
const fx = (src, at, volume, { duck = 0, len = 10, dur = 1.5 } = {}) => ({ src, at, volume, duck, len, dur });
const swish = (at, v = 0.36) => fx('film/sfx/swish.wav', at, v);
const shimmer = (at, v = 0.28) => fx('film/sfx/shimmer.wav', at, v, { dur: 2 });
const SFX = [
  fx('film/sfx/wind.wav', 0, 0.3, { dur: 6.4 }),
  shimmer(70, 0.24),
  fx('promo/sfx/whoosh.wav', TL.beat - 10, 0.5, { duck: 0.1, len: 16 }),
  fx('film/sfx/impact.wav', TL.beat, 0.42, { duck: 0.2, len: 20, dur: 2.6 }),
  ...ORDER.filter((S) => S.at > TL.beat && S.at < TL.brk).map((S) => swish(S.at - 3, 0.3)),
  fx('film/sfx/wind.wav', TL.brk, 0.26, { dur: 6.4 }),
  fx('film/sfx/wind.wav', TL.brk + 192, 0.22, { dur: 6.4 }),
  fx('film/sfx/riser.wav', TL.drop - 96, 0.5, { dur: 3.3 }),
  // ドロップ：雷鳴と雨
  fx('film/sfx/impact.wav', TL.drop, 0.55, { duck: 0.3, len: 26, dur: 2.6 }),
  fx('c3d/sfx/thunder_near.wav', TL.drop, 0.95, { duck: 0.35, len: 40, dur: 5 }),
  fx('c3d/sfx/rain.wav', TL.drop, 0.32, { dur: 6.5 }),
  ...STRIKES.slice(1).map((s, i) => fx(s.near ? (i % 2 ? 'c3d/sfx/thunder_near2.wav' : 'c3d/sfx/thunder_near.wav') : 'c3d/sfx/thunder_far.wav', s.at + 4, s.near ? 0.7 : 0.5, { duck: s.near ? 0.2 : 0, len: 24, dur: 5 })),
  fx('c3d/sfx/rain.wav', 1920, 0.5, { dur: 3.3 }),
  swish(1917, 0.3), swish(2013, 0.3),
  fx('film/sfx/wind.wav', 2016, 0.24, { dur: 3.3 }),
  shimmer(2112, 0.26),
  swish(2493, 0.3), fx('film/sfx/wind.wav', 2496, 0.2, { dur: 6.4 }),
  swish(2685, 0.3), fx('film/sfx/wind.wav', 2688, 0.22, { dur: 6.4 }),
  // 歩いて見る
  swish(2877, 0.34), shimmer(3456, 0.18),
  fx('promo/sfx/whoosh.wav', 3840 + 100, 0.45, { duck: 0.1, len: 16 }),
  // 夜
  swish(4029, 0.32), shimmer(4180, 0.22),
  // たたみかけ（1 小節ずつ）
  ...ORDER.filter((S) => S.montage).flatMap((S) => [fx('film/sfx/tick.wav', S.at, 0.3, { dur: 0.3 }), swish(S.at - 2, 0.22)]),
  fx('promo/sfx/whoosh.wav', 4800 - 12, 0.5, { duck: 0.1, len: 16 }),
  shimmer(4800 + 4, 0.3),
  fx('promo/sfx/whoosh.wav', TL.outro - 20, 0.42),
  shimmer(TL.hit, 0.4),
];
const ducking = (fr) => SFX.reduce((m, s) => {
  if (!s.duck) return m;
  const k = Math.min(ease(fr, [s.at - 3, s.at + 2], [0, 1]), 1 - ease(fr, [s.at + s.len, s.at + s.len + 10], [0, 1]));
  return Math.max(m, s.duck * k);
}, 0);

export const CampusMapFilm = () => {
  const f = useCurrentFrame();
  const layers = layersAt(f);
  const cur = layers[layers.length - 1]?.S;
  const [sx, sy] = shakeAt(f);
  // 黒帯：前奏とブレイクのあいだ（ビート・ドロップで開く）
  const bars = Math.max(
    1 - ease(f, [TL.beat, TL.beat + 14], [0, 1], EASE_IN_OUT),
    ease(f, [TL.brk, TL.brk + 40], [0, 1], EASE_IN_OUT) * (1 - ease(f, [TL.drop, TL.drop + 10], [0, 1], EASE_IN_OUT)),
    ease(f, [TL.outro, TL.outro + 40], [0, 0.6], EASE_IN_OUT),
  );
  // はじめは暗闇から、最後は暗く
  const black = Math.max(1 - ease(f, [0, 30], [0, 1]), ease(f, [TL.total - 30, TL.total - 2], [0, 1]));
  const white = whiteAt(f);
  return (
    <AbsoluteFill style={{ fontFamily: FONT, background: '#000', overflow: 'hidden' }}>
      <AbsoluteFill style={{ transform: sx || sy ? `translate(${sx}px, ${sy}px) scale(1.02)` : undefined }}>
        {layers.map(({ S, o }) => <Shot key={S.id} S={S} f={f} o={o} />)}
      </AbsoluteFill>
      <Vignette k={0.32} />
      {cur && !cur.montage && <Caption S={cur} f={f} lift={138 * bars} />}
      {cur && <Clock S={cur} f={f} lift={138 * bars} />}
      {cur && <YearDial S={cur} f={f} />}
      {cur && cur.montage && <MontageName S={cur} f={f} />}
      <Title f={f} />
      <EndCard f={f} />
      {white > 0 && <AbsoluteFill style={{ background: '#fff', opacity: white }} />}
      <Grain f={f} opacity={0.05} />
      <Letterbox k={bars} />
      {black > 0 && <AbsoluteFill style={{ background: '#000', opacity: black }} />}

      <Sequence from={0}>
        <Audio src={staticFile('promo/bgm.mp3')} trimBefore={1} volume={(fr) => 0.74 * ease(fr, [0, 3], [0, 1]) * (1 - ducking(fr)) * (1 - ease(fr, [TL.total - 40, TL.total - 2], [0, 1]))} />
      </Sequence>
      {SFX.map((s, i) => (
        <Sequence key={`${i}${s.src}${s.at}`} from={s.at} durationInFrames={Math.ceil((s.dur || 1.5) * 30)}>
          <Audio src={staticFile(s.src)} volume={s.volume} />
        </Sequence>
      ))}
    </AbsoluteFill>
  );
};
