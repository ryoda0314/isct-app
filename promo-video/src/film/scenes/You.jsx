import React from 'react';
import { AbsoluteFill, Img } from 'remotion';
import { EASE_IN, EASE_IN_OUT, EASE_OUT, TL, ease, mix } from '../theme.js';
import { FilmFlow, Laptop, recMeta, recSrc } from '../Device.jsx';
import { Caps, Rise } from '../type.jsx';
import { PhoneAt, poseAt } from '../stage.jsx';

// 4416–4800：17のテーマ（ホームを流しながら、1拍ごとにアプリ全体の色が変わる）→ 5つの言語（1拍ごとに画面の言葉が変わる）→ スマホでも、PCでも。
// 端末の画面はアプリの動画（rec_themes・rec_langs。テーマと言語は撮影のときに設定の画面を出さずに切り替えている）、
// ノートPCの画面も PC 版の操作動画（rec_desk）。

// rec_themes で切り替える順（名前はアプリの設定画面と同じ）と、光の色（各テーマのアクセント）
const THEMES = [
  ['ダーク', 'DARK', '#6375f0'], ['東工大ブルー', 'TITECH BLUE', '#1e7ac8'], ['医科歯科', 'TMDU', '#00897b'], ['Science Tokyo', 'SCIENCE TOKYO', '#6e58a8'],
  ['桜', 'SAKURA', '#d4507a'], ['ラベンダー', 'LAVENDER', '#8b60c8'], ['ミント', 'MINT', '#3a9878'], ['スカイ', 'SKY', '#4a80c8'],
  ['ピーチ', 'PEACH', '#d07848'], ['レモン', 'LEMON', '#a89030'], ['コーラル', 'CORAL', '#d0605a'], ['新緑', 'SHINRYOKU', '#2e8b57'],
  ['紅葉', 'KOYO', '#d4782a'], ['雪', 'YUKI', '#4a80b4'], ['ライト', 'LIGHT', '#4f5bd5'], ['ツバメ', 'TSUBAME', '#28c868'],
];
// rec_langs で切り替える順（最初は日本語のまま）
const LANGS = [
  ['日本語', 'Japanese'], ['English', 'English'], ['简体中文', 'Chinese'], ['한국어', 'Korean'], ['toki pona', 'Toki Pona'], ['日本語', 'Japanese'],
];

// 動画の置き場所：テーマの動画は最初の切り替え（12 コマ目の「ダーク」）が You の頭（小節の頭）に来るように置き、そこで画面を切り替える。
// 言語の動画は 12 コマ目から1拍ごとに切り替え。PC の動画は 12・36・60 コマ目でクリック（2拍ごと）
const THEMES_AT = TL.you - 12;
const DESK_AT = TL.devices + 12;
const FLOW = [
  { at: THEMES_AT, rec: 'rec_themes' },
  { at: TL.langs, rec: 'rec_langs', mode: 'fade', slide: 4 }, // 「スマホでも、PCでも」でも、このままホームが流れ続ける
];
const tapsOf = (rec, at) => recMeta(rec).taps.map(([tf]) => at + tf);
const marksOf = (rec, at) => (recMeta(rec).marks || []).map(([mf]) => at + mf);
const THEME_TAPS = marksOf('rec_themes', THEMES_AT); // 1拍ごと16回（ダーク〜ツバメ）
const LANG_TAPS = marksOf('rec_langs', TL.langs); // English・简体中文・한국어・toki pona（2拍）・日本語
// 効果音：テーマと言語の切り替え（ティック）、PC のクリック
export const TICKS = [...THEME_TAPS, ...LANG_TAPS];
export const CLICKS = tapsOf('rec_desk', DESK_AT);

const hexRgb = (h) => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
// いま何番目か（taps[i] を過ぎたら i）と、その切り替わりからの経過フレーム
const stepOf = (f, taps) => {
  let i = -1;
  while (i + 1 < taps.length && f >= taps[i + 1]) i++;
  return { i, k: i >= 0 ? f - taps[i] : f - (taps[0] ?? f) };
};

const phonePose = (f) => poseAt([
  { f: TL.you, x: 960, y: 560, s: 1.0 }, // 冬の場面の端末（正面・中央）をそのまま受け取る
  { f: TL.you + 18, x: 960, y: 590, s: 0.86, ry: -7 },
  { f: TL.langs - 6, x: 960, y: 590, s: 0.86, ry: 7, ease: (x) => x }, // テーマの間、ゆっくり向きを変える
  { f: TL.langs + 10, x: 960, y: 590, s: 0.86, ry: 0 },
  { f: TL.devices - 4, x: 960, y: 590, s: 0.86, ry: -3, ease: (x) => x },
  { f: TL.devices + 20, x: 1530, y: 640, s: 0.78, ry: -16 },
], f);

// 端末の後ろの光と、大きな文字（テーマ・言語の名前）。i が替わると、前の色から 6 フレームで移る
const Glow = ({ color, prev, k, opacity = 1 }) => {
  const p = ease(k, [0, 6], [0, 1]);
  const layer = (c, o) => {
    if (!c || o <= 0) return null;
    const [r, g, b] = hexRgb(c);
    return <div style={{ position: 'absolute', inset: 0, opacity: o, background: `radial-gradient(ellipse 46% 50% at 50% 56%, rgba(${r},${g},${b},0.6) 0%, rgba(${r},${g},${b},0.2) 45%, rgba(${r},${g},${b},0) 75%)` }} />;
  };
  return (
    <AbsoluteFill style={{ opacity }}>
      {layer(prev, 1 - p)}
      {layer(color, p)}
    </AbsoluteFill>
  );
};
const BigWord = ({ text, k, color = 'rgba(255,255,255,0.1)', opacity = 1 }) => (
  <div style={{
    position: 'absolute', left: -200, right: -200, top: 400, textAlign: 'center', fontSize: 220, fontWeight: 900, letterSpacing: '-0.03em', lineHeight: 1,
    color, whiteSpace: 'nowrap', opacity, transform: `scale(${1 + 0.05 * Math.exp(-Math.max(0, k) / 5)})`,
  }}>{text}</div>
);
// 右側の名前（替わるたびに下から入る）
const NameTag = ({ jp, en, k, color = '#9fb3cc', opacity = 1 }) => {
  const p = ease(k, [0, 7], [0, 1], EASE_OUT);
  return (
    <div style={{ position: 'absolute', right: 150, top: 470, zIndex: 40, opacity, textAlign: 'right' }}>
      <div style={{ fontSize: 56, fontWeight: 800, color: '#ffffff', transform: `translateY(${(1 - p) * 14}px)`, opacity: 0.4 + 0.6 * p }}>{jp}</div>
      <div style={{ fontSize: 15, fontWeight: 700, letterSpacing: '0.3em', color, marginTop: 8 }}>{en}</div>
    </div>
  );
};

const Themes = ({ f }) => {
  const { i, k } = stepOf(f, THEME_TAPS);
  const out = ease(f, [TL.langs - 12, TL.langs + 2], [0, 1], EASE_IN);
  if (i < 0) return null;
  const [jp, en, c] = THEMES[i];
  const prev = i > 0 ? THEMES[i - 1][2] : null;
  return (
    <AbsoluteFill style={{ opacity: 1 - out }}>
      <Glow color={c} prev={prev} k={k} opacity={ease(f, [TL.you, TL.you + 10], [0, 1])} />
      <BigWord text={en} k={k} color={`rgba(${hexRgb(c).join(',')},0.2)`} />
      <div style={{ position: 'absolute', left: 140, top: 380, zIndex: 40 }}>
        <Caps text="17 Themes" f={f} d={TL.you + 2} exitAt={TL.langs - 14} color="#9fb3cc" line />
        <div style={{ marginTop: 14 }}>
          <Rise segs="17のテーマで、" f={f} d={TL.you + 6} exitAt={TL.langs - 14} size={76} weight={900} color="#ffffff" />
        </div>
        <Rise segs={[{ t: 'あなたらしく', grad: true }, { t: '。' }]} f={f} d={TL.you + 12} exitAt={TL.langs - 14} size={76} weight={900} color="#ffffff" />
      </div>
      <NameTag jp={jp} en={en} k={k} color={`rgb(${hexRgb(c).map((v) => Math.min(255, v + 70)).join(',')})`} />
    </AbsoluteFill>
  );
};

const Langs = ({ f }) => {
  const { i, k } = stepOf(f, [TL.langs - 1, ...LANG_TAPS]);
  const enter = ease(f, [TL.langs - 8, TL.langs + 8], [0, 1], EASE_OUT);
  const out = ease(f, [TL.devices - 10, TL.devices + 2], [0, 1], EASE_IN);
  const [name, en] = LANGS[Math.max(0, i)];
  return (
    <AbsoluteFill style={{ opacity: enter * (1 - out) }}>
      <Glow color="#7f9cc4" k={99} opacity={0.7} />
      <BigWord text={name} k={i > 0 ? k : 99} />
      <div style={{ position: 'absolute', left: 140, top: 430, zIndex: 40 }}>
        <Caps text="5 Languages" f={f} d={TL.langs + 2} exitAt={TL.devices - 12} color="#9fb3cc" line />
        <div style={{ marginTop: 14 }}>
          <Rise segs="5つの言語で。" f={f} d={TL.langs + 6} exitAt={TL.devices - 12} size={76} weight={900} color="#ffffff" />
        </div>
      </div>
      <NameTag jp={name} en={en} k={i > 0 ? k : 99} />
    </AbsoluteFill>
  );
};

// PC の画面（操作動画）とマウスのカーソル。カーソルはクリックの 2 フレーム前に着き、押すと波紋が広がる
const LAP = { x: 200, y: 300, w: 1000 };
const DeskScreen = ({ f }) => {
  const R = recMeta('rec_desk');
  const i = Math.max(0, Math.min(R.frames - 1, Math.round(f - DESK_AT)));
  const sc = LAP.w / (R.w || 1440);
  // カーソルの通り道：[フレーム, x, y]（PC 画面の CSS px）
  const pts = [[DESK_AT - 12, 700, 640], ...R.taps.map(([tf, x, y]) => [DESK_AT + tf - 2, x, y]), [DESK_AT + 90, 760, 470]];
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
      {R.taps.map(([tf, x, y]) => {
        const k = f - (DESK_AT + tf);
        if (k < 0 || k > 16) return null;
        const r = ease(k, [0, 16], [0, 1], EASE_OUT);
        return <div key={tf} style={{ position: 'absolute', left: x * sc - 26, top: y * sc - 26, width: 52, height: 52, borderRadius: 26, border: '2.5px solid rgba(40,200,104,0.8)', boxSizing: 'border-box', opacity: 1 - r, transform: `scale(${0.3 + 0.9 * r})` }} />;
      })}
      <svg width="26" height="34" viewBox="0 0 26 34" style={{ position: 'absolute', left: cx * sc - 3, top: cy * sc - 2, filter: 'drop-shadow(0 2px 3px rgba(0,0,0,0.35))', zIndex: 5 }}>
        <path d="M3 2 L3 27 L9.5 21 L14 31 L18 29 L13.6 19.4 L22 19.4 Z" fill="#111" stroke="#fff" strokeWidth="2" strokeLinejoin="round" />
      </svg>
    </>
  );
};

const Devices = ({ f }) => {
  const enter = ease(f, [TL.devices - 10, TL.devices + 10], [0, 1], EASE_OUT);
  const out = ease(f, [TL.all - 14, TL.all], [0, 1], EASE_IN);
  return (
    <AbsoluteFill style={{ opacity: 1 - out }}>
      <Laptop x={LAP.x} y={LAP.y + mix(90, 0, enter)} w={LAP.w} opacity={enter}>
        <DeskScreen f={f} />
      </Laptop>
      <div style={{ position: 'absolute', left: 0, right: 0, top: 96, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, zIndex: 40 }}>
        <Caps text="Phone & Desktop" f={f} d={TL.devices + 2} exitAt={TL.all - 12} color="#9fb3cc" align="center" />
        <Rise segs="スマホでも、PCでも。" f={f} d={TL.devices + 6} exitAt={TL.all - 12} size={76} weight={900} color="#ffffff" />
      </div>
    </AbsoluteFill>
  );
};

export const You = ({ f }) => {
  const out = ease(f, [TL.all - 14, TL.all], [0, 1], EASE_IN);
  const pose = phonePose(f);
  return (
    <AbsoluteFill>
      {f < TL.langs + 2 && <Themes f={f} />}
      {f >= TL.langs - 10 && f < TL.devices + 4 && <Langs f={f} />}
      {f >= TL.devices - 12 && <Devices f={f} />}
      <PhoneAt pose={{ ...pose, o: pose.o * (1 - out) }}>
        <FilmFlow f={f} screens={FLOW} slide={14} />
      </PhoneAt>
    </AbsoluteFill>
  );
};
