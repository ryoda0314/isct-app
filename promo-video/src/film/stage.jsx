import React from 'react';
import { EASE_IN, EASE_IN_OUT, EASE_OUT, ease, mix, sp } from './theme.js';
import { BEZEL, PHONE_H, PHONE_W, STATUS_H } from '../promo/Phone.jsx';
import { Crop, FilmScreen, rectOf } from './Device.jsx';
import { ModelPhone, screenMatrix } from './ModelPhone.jsx';
import { Block, Caps } from './type.jsx';
import { Drift } from './fx.jsx';

// 場面づくりの道具：端末の置き場所（キー間をなめらかに移動）、画面から浮き上がるカード、機能の説明、季節の扉

// keys: [{ f, x, y, s, rx?, ry?, rz?, o? }]。キーの間を EASE_IN_OUT でつなぐ
export const poseAt = (keys, f) => {
  if (f <= keys[0].f) return { rx: 0, ry: 0, rz: 0, o: 1, ...keys[0] };
  for (let i = 0; i < keys.length - 1; i++) {
    const a = { rx: 0, ry: 0, rz: 0, o: 1, ...keys[i] };
    const b = { rx: 0, ry: 0, rz: 0, o: 1, ...keys[i + 1] };
    if (f <= b.f) {
      const t = ease(f, [a.f, b.f], [0, 1], b.ease || EASE_IN_OUT);
      const out = {};
      for (const k of ['x', 'y', 's', 'rx', 'ry', 'rz', 'o']) out[k] = mix(a[k], b[k], t);
      return out;
    }
  }
  return { rx: 0, ry: 0, rz: 0, o: 1, ...keys[keys.length - 1] };
};

// 端末（実画面入り）。pose: { x, y, s, rx, ry, rz, o }。本体は iPhone の3Dモデル（ModelPhone.jsx）
export const PhoneAt = ({ pose, children, shadow = 1, outside }) => (
  pose.o <= 0.001 ? null : <ModelPhone pose={pose} shadow={shadow} outside={outside}>{children}</ModelPhone>
);

// 画面の中の点（スクショの CSS px）が、回転していない端末で画面のどこに来るか
export const onPhone = (pose, cx, cy) => [
  pose.x + (-PHONE_W / 2 + BEZEL + cx) * pose.s,
  pose.y + (-PHONE_H / 2 + BEZEL + STATUS_H + cy) * pose.s,
];

// 画面から浮き上がって、決めた場所へ飛んでいくカード。
// from: 端末の pose（カードの元の位置を求める）。to: { x, y, s }（カードの左上と倍率）。at〜 で飛び、back から戻る
export const LiftCard = ({ f, name, r, pose, to, at, back = Infinity, until = Infinity, label, labelColor = '#5b7a94', radius = 14, pad = 0, z = 30 }) => {
  if (!r || f < at - 1) return null;
  const p = sp(f, at, { damping: 17, stiffness: 140, mass: 0.9 });
  const b = ease(f, [back, back + 16], [0, 1], EASE_IN_OUT);
  const k = Math.min(1, p) * (1 - b);
  const [sx, sy] = onPhone(pose, r.x - pad, r.y - pad);
  const x = mix(sx, to.x, k);
  const y = mix(sy, to.y, k);
  const s = mix(pose.s, to.s, k);
  const out = ease(f, [until, until + 10], [0, 1], EASE_IN);
  const lift = Math.sin(Math.min(1, p) * Math.PI) * (1 - b);
  return (
    <div style={{ position: 'absolute', left: x, top: y, zIndex: z, opacity: (1 - out) * (b > 0.95 ? 0 : 1) }}>
      {label && (
        <div style={{ position: 'absolute', left: 4, top: -34, opacity: ease(f, [at + 8, at + 18], [0, 1]) * (1 - b) * (1 - out) }}>
          <Caps text={label} f={f} d={at + 6} size={15} color={labelColor} track="0.28em" />
        </div>
      )}
      <div style={{
        transform: `rotate(${-3 * lift}deg) scale(${1 + 0.04 * lift})`, transformOrigin: '0 0', borderRadius: radius * s,
        boxShadow: `0 ${30 * k}px ${60 * k}px -${24 * k}px rgba(14,32,48,${0.4 * k}), 0 0 0 1px rgba(14,32,48,${0.06 * k})`,
      }}>
        <Crop name={name} r={r} scale={s} radius={radius * s} pad={pad} />
      </div>
    </div>
  );
};

// 名前とテキストで探したカードを浮かせる短縮形
export const liftRect = (name, text) => rectOf(name, text);

// 機能の説明（左右どちらかに置く見出しのまとまり）
export const Feature = ({ f, d, exitAt, en, lines, body, x, y, w = 760, align = 'left', size = 92, ink, sub, bodySize = 30 }) => (
  <div style={{ position: 'absolute', left: x, top: y, width: w, display: 'flex', justifyContent: align === 'right' ? 'flex-end' : align === 'center' ? 'center' : 'flex-start', zIndex: 60 }}>
    <Block f={f} d={d} exitAt={exitAt} en={en} lines={lines} body={body} size={size} ink={ink} sub={sub} align={align} bodySize={bodySize} />
  </div>
);

// 季節の扉：大きな一文字（細い字）と、英語・日本語の副題。舞い物が吹き込む
export const SeasonGate = ({ f, at, season, until, kind, x = 170, y = 250, dark = false }) => {
  const S = season;
  const p = ease(f, [at, at + 26], [0, 1], EASE_OUT);
  const out = ease(f, [until, until + 14], [0, 1], EASE_IN);
  if (f < at - 2 || f > until + 16) return null;
  const k = p * (1 - out);
  return (
    <>
      <div style={{ position: 'absolute', left: x, top: y, zIndex: 60, opacity: k, filter: out > 0 ? `blur(${out * 10}px)` : undefined }}>
        <div style={{
          fontSize: 420, fontWeight: 200, lineHeight: 1, color: S.ink, letterSpacing: '-0.04em',
          transform: `translateY(${(1 - p) * 40}px)`, filter: p < 1 ? `blur(${(1 - p) * 18}px)` : undefined,
          textShadow: dark ? '0 0 60px rgba(255,170,90,0.35)' : '0 10px 60px rgba(255,255,255,0.7)',
        }}>{S.kanji}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 18, marginTop: 18 }}>
          <div style={{ width: 70 * ease(f, [at + 8, at + 30], [0, 1], EASE_OUT), height: 2, background: S.accent }} />
          <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: '0.6em', color: S.accent, opacity: ease(f, [at + 10, at + 26], [0, 1]) }}>{S.en}</div>
        </div>
        <div style={{ marginTop: 14, fontSize: 40, fontWeight: 600, color: S.ink, letterSpacing: '0.12em', opacity: ease(f, [at + 16, at + 32], [0, 1]), transform: `translateY(${(1 - ease(f, [at + 16, at + 32], [0, 1], EASE_OUT)) * 14}px)` }}>{S.ja}</div>
      </div>
      {kind && <Drift f={f - at} kind={kind} n={60} seed={at} k={k} fall={kind === 'snow' ? 1.6 : 2.4} wind={kind === 'snow' ? 0.4 : 2.6} size={kind === 'snow' ? [6, 16] : [14, 34]} z={55} />}
    </>
  );
};

export { FilmScreen };

// 分解図：端末を傾け、画面の中のカードが層になって手前（Z）へ浮き上がる（3Dモデルの端末と同じ投影で、カードを貼る）。
// screen: 画面の中身、layers: [{ r, z, label }]（r は画面の画像の CSS px、z は浮く高さ）、card(l): 層の中身、
// k(i): 層 i の浮き上がり 0（画面に収まる）〜 1（浮き上がる）
export const ExplodedPhone = ({ pose, screen, layers, card, k, labelColor = '#5b7a94' }) => (
  <>
    <ModelPhone pose={pose}>{screen}</ModelPhone>
    {layers.map((l, i) => {
      const kk = Math.max(0, Math.min(1, k(i)));
      if (kk <= 0.001 || !l.r) return null;
      const box = { x: l.r.x, y: STATUS_H + l.r.y, w: l.r.w, h: l.r.h };
      return (
        <React.Fragment key={i}>
          {/* 画面に落ちる影（画面の高さ） */}
          <div style={{ position: 'absolute', left: 0, top: 0, width: box.w, height: box.h, transformOrigin: '0 0', transform: screenMatrix(pose, { ...box, z: 0 }), opacity: 0.55 * kk }}>
            <div style={{ position: 'absolute', inset: -10, borderRadius: 18, background: 'rgba(14,32,48,0.5)', filter: `blur(${8 + 16 * kk}px)` }} />
          </div>
          {/* 浮き上がったカード */}
          <div style={{ position: 'absolute', left: 0, top: 0, width: box.w, height: box.h, transformOrigin: '0 0', transform: screenMatrix(pose, { ...box, z: l.z * kk }) }}>
            <div style={{ borderRadius: 14, boxShadow: `0 0 0 1px rgba(255,255,255,${0.6 * kk}), 0 18px 40px -16px rgba(14,32,48,${0.5 * kk})` }}>{card(l)}</div>
            {l.label && (
              <div style={{ position: 'absolute', left: box.w + 18, top: '50%', transform: 'translateY(-50%)', whiteSpace: 'nowrap', opacity: kk, display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ width: 28 * kk, height: 2, background: labelColor, opacity: 0.7 }} />
                <span style={{ fontSize: 17, fontWeight: 800, letterSpacing: '0.18em', color: labelColor }}>{l.label}</span>
              </div>
            )}
          </div>
        </React.Fragment>
      );
    })}
  </>
);
