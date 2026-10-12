import React from 'react';
import { Img, staticFile } from 'remotion';
import PARTS from './parts.json';
import { EXPR, mouthFor } from './expressions.js';

// ずんだもん（立ち絵素材2.3・坂本アヒル）をパーツから組み立てて描く。
// 座標は PSD（1082x1650）のまま。anchor（PSD の点）を画面の (x, y) に置き、scale 倍する。
// talk: { moras, t }（話している行の口パク。t は行の頭からの秒）。exprAt: 今の表情になったフレーム（跳ねる・弾むのに使う）
const [PW, PH] = PARTS.size;
const ORDER = ['tail', 'body', 'armL', 'armR', 'mouth', 'face', 'eyes', 'white', 'pupil', 'brow', 'eda', 'mark'];
const ANCHOR = { x: 516, y: 1580 }; // 足もと（体を傾ける・揺らす中心）
const HEAD = { x: 492, y: 300 }; // 記号（！・？・キラキラ）を出す頭の上のあたり
// 手を振る腕：肘のところでなめらかに曲げた絵（capture/export_zundamon.py の make_wave_frames。-14°〜+14°・0.5°おき）。
// 肘より手前（二の腕・袖）は動かないので、肩や袖口に切れ目が出ない
const WAVE = PARTS.wave;

const Part = ({ id }) => {
  const p = PARTS.parts[id];
  if (!p) return null;
  return <Img src={staticFile(`zundamon/parts/${p.file}`)} style={{ position: 'absolute', left: p.x, top: p.y, width: p.w, height: p.h }} />;
};

// まばたき：2〜4.5 秒おきに 2 フレームだけ目を閉じる（決まった並びの擬似乱数）
const BLINKS = (() => {
  const out = [];
  let f = 40;
  let s = 12345;
  while (f < 20000) {
    out.push(f);
    s = (s * 1103515245 + 12345) % 2147483648;
    f += 66 + (s % 70);
  }
  return out;
})();
const blinking = (f) => {
  let lo = 0;
  let hi = BLINKS.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (BLINKS[mid] <= f) lo = mid; else hi = mid - 1;
  }
  return f - BLINKS[lo] >= 0 && f - BLINKS[lo] < 2;
};

// 話している瞬間の口と、その音の中での位置
const talkMouth = (talk, ex) => {
  if (!talk) return null;
  const m = talk.moras.find(([a, b]) => talk.t >= a && talk.t < b);
  if (!m) return null;
  const [a, b, v, c] = m;
  return mouthFor(v, c, (talk.t - a) / Math.max(0.001, b - a), ex);
};

export const Zundamon = ({ f, expr = 'normal', talk = null, exprAt = 0, x, y, scale = 1, opacity = 1, flip = false, extraRot = 0, extraY = 0 }) => {
  const ex = EXPR[expr] || EXPR.normal;
  const sel = {
    tail: true,
    body: true,
    armL: ex.armL || '基本',
    armR: ex.armR || '基本',
    mouth: talkMouth(talk, ex) || ex.mouth || 'むふ',
    face: ex.face || ['ほっぺ'],
    brow: ex.brow || '普通眉',
    eda: ex.eda || '枝豆通常',
    mark: ex.marks || [],
  };
  // 目：白目と黒目の組（まばたきできる）か、まとまった目
  const pairEyes = Array.isArray(ex.eyes);
  if (pairEyes && blinking(f)) sel.eyes = 'なごみ目';
  else if (pairEyes) { sel.white = ex.eyes[0]; sel.pupil = ex.eyes[1]; } else sel.eyes = ex.eyes;

  // 体の動き：息（ゆっくり伸び縮み）・話している間の小さな揺れ・表情が替わった瞬間の弾み・跳ねる
  const since = f - exprAt;
  const breath = 1 + 0.007 * Math.sin((f / 30) * Math.PI * 2 * 0.45);
  const talkSway = talk ? 0.9 * Math.sin(talk.t * Math.PI * 2 * 2.1) : 0;
  const pop = since >= 0 && since < 10 ? 1 + 0.035 * Math.sin((since / 10) * Math.PI) : 1;
  const hop = ex.hop && since >= 0 && since < 14 ? -Math.sin((since / 14) * Math.PI) * 46 : 0;
  const shake = expr === 'panic' ? 5 * Math.sin(f * 2.3) : 0;
  // 手を振る角度：表情が替わった瞬間の 0° から振り出す（1.5 往復/秒・±12°）
  const waveAng = ex.wave && since >= 0 ? 12 * Math.sin((since / 30) * Math.PI * 2 * 1.5) : 0;

  const parts = [];
  for (const slot of ORDER) {
    const v = sel[slot];
    if (v == null || v === false) continue;
    const names = slot === 'tail' || slot === 'body' ? [slot] : Array.isArray(v) ? v : [v];
    for (const n of names) {
      const id = slot === 'tail' || slot === 'body' ? slot : `${slot}.${n}`;
      if (slot === 'armL' && ex.wave && WAVE && n === '手を挙げる') {
        const step = WAVE.angles[1] - WAVE.angles[0];
        const k = Math.max(0, Math.min(WAVE.angles.length - 1, Math.round((waveAng - WAVE.angles[0]) / step)));
        parts.push(<Img key="wave" src={staticFile(`zundamon/parts/wave/${String(k).padStart(2, '0')}.png`)} style={{ position: 'absolute', left: WAVE.x, top: WAVE.y, width: WAVE.w, height: WAVE.h }} />);
        continue;
      }
      parts.push(<Part key={id} id={id} />);
    }
  }

  return (
    <div style={{
      position: 'absolute', left: x - ANCHOR.x * scale, top: y - ANCHOR.y * scale + hop + extraY, width: PW * scale, height: PH * scale, opacity,
      transform: `translateX(${shake}px) rotate(${talkSway + extraRot}deg) scale(${pop * (flip ? -1 : 1)}, ${pop * breath})`,
      transformOrigin: `${ANCHOR.x * scale}px ${ANCHOR.y * scale}px`,
    }}>
      <div style={{ position: 'absolute', left: 0, top: 0, width: PW, height: PH, transform: `scale(${scale})`, transformOrigin: '0 0' }}>
        {parts}
        <Marks expr={expr} since={since} f={f} />
      </div>
    </div>
  );
};

// 頭の上の記号（PSD の座標で描く）：！・？・キラキラ・どんより線
const Marks = ({ expr, since, f }) => {
  const k = Math.min(1, Math.max(0, since / 6));
  if (expr === 'surprise' || expr === 'excited' || expr === 'present') {
    const s = 0.6 + 0.4 * k + (since < 12 ? 0.15 * Math.sin((since / 12) * Math.PI) : 0);
    return (
      <div style={{ position: 'absolute', left: HEAD.x + 250, top: HEAD.y - 200, transform: `scale(${s}) rotate(12deg)`, opacity: k }}>
        <svg width="120" height="200" viewBox="0 0 60 100">
          <path d="M22 6 L40 6 L35 64 L27 64 Z" fill="#ffd23f" stroke="#3a2a10" strokeWidth="5" strokeLinejoin="round" />
          <circle cx="31" cy="83" r="9" fill="#ffd23f" stroke="#3a2a10" strokeWidth="5" />
        </svg>
        {expr !== 'surprise' && [[-380, 40, 0], [-460, 220, 9], [40, 300, 4]].map(([dx, dy, d], i) => (
          <svg key={i} width="90" height="90" viewBox="0 0 40 40" style={{ position: 'absolute', left: dx, top: dy, transform: `scale(${0.6 + 0.4 * Math.abs(Math.sin((f + d * 3) / 7))})` }}>
            <path d="M20 0 C22 14 26 18 40 20 C26 22 22 26 20 40 C18 26 14 22 0 20 C14 18 18 14 20 0 Z" fill="#fff59a" stroke="#e0a800" strokeWidth="1.5" />
          </svg>
        ))}
      </div>
    );
  }
  if (expr === 'confused' || expr === 'think') {
    const bob = 8 * Math.sin(f / 6);
    return (
      <div style={{ position: 'absolute', left: HEAD.x + 230, top: HEAD.y - 230 + bob, opacity: k, transform: `rotate(${10 + 4 * Math.sin(f / 9)}deg)` }}>
        <svg width="150" height="190" viewBox="0 0 75 95">
          <path d="M14 30 C14 8 61 4 61 30 C61 46 40 46 40 62" fill="none" stroke="#3a2a10" strokeWidth="15" strokeLinecap="round" />
          <path d="M14 30 C14 8 61 4 61 30 C61 46 40 46 40 62" fill="none" stroke="#7fd0ff" strokeWidth="8" strokeLinecap="round" />
          <circle cx="40" cy="82" r="9" fill="#7fd0ff" stroke="#3a2a10" strokeWidth="4" />
        </svg>
      </div>
    );
  }
  if (expr === 'cry' || expr === 'panic') {
    // どんより（頭の横の縦線）
    return (
      <svg width="700" height="420" viewBox="0 0 700 420" style={{ position: 'absolute', left: HEAD.x - 350, top: HEAD.y - 200, opacity: 0.55 * k }}>
        {[60, 100, 140, 560, 600, 640].map((x, i) => (
          <line key={i} x1={x} y1={60 + (i % 3) * 25 + 10 * Math.sin(f / 5 + i)} x2={x} y2={260 + (i % 3) * 25 + 10 * Math.sin(f / 5 + i)} stroke="#5b6b8c" strokeWidth="9" strokeLinecap="round" strokeDasharray="38 22" />
        ))}
      </svg>
    );
  }
  if (expr === 'joy' || expr === 'happy' || expr === 'wave') {
    // 頬のまわりの小さなハート・音符
    return (
      <div style={{ position: 'absolute', left: HEAD.x + 260, top: HEAD.y - 120 - 30 * ((f % 60) / 60), opacity: k * (1 - (f % 60) / 60) }}>
        <svg width="80" height="70" viewBox="0 0 40 35">
          <path d="M20 33 C6 22 0 15 0 9 C0 3 5 0 10 0 C14 0 18 3 20 7 C22 3 26 0 30 0 C35 0 40 3 40 9 C40 15 34 22 20 33 Z" fill="#ff8fab" stroke="#c24d6c" strokeWidth="2" />
        </svg>
      </div>
    );
  }
  return null;
};
