import React from 'react';
import { AbsoluteFill, Easing, Img, staticFile } from 'remotion';
import { C, EASE_IN_OUT, T, ease, mix } from '../theme.js';
import { CharPop, Headline, SubCopy } from '../text.jsx';

// ツバメの切り抜き（swallow.png）はアイコン 1024px 中の (148,245) 666x626
const SW = { x: 148 / 1024, y: 245 / 1024, w: 666 / 1024, h: 626 / 1024 };
export const ICON_SIZE = 280;
const CX = 960;
const CY = 410;
const LAND = 2; // ツバメが土台にはまるフレーム（ドロップ直後）

const FLY = Easing.bezier(0.5, 0, 0.2, 1);
const P0 = [-320, 940];
const P1 = [260, 160];

const bez = (u, p2) => [0, 1].map((k) => (1 - u) ** 2 * P0[k] + 2 * (1 - u) * u * P1[k] + u * u * p2[k]);

// アイコン（土台＋ツバメ）。impact で着地の衝撃、land 前はツバメが飛行中。
export const IconAssembly = ({ r, size = ICON_SIZE, cx = CX, cy = CY, flight = true }) => {
  const swW = size * SW.w;
  const swH = size * SW.h;
  const target = [cx - size / 2 + size * SW.x + swW / 2, cy - size / 2 + size * SW.y + swH / 2];
  const plateS = ease(r, [LAND - 5, LAND], [0.45, 1]);
  const plateO = ease(r, [LAND - 5, LAND - 2], [0, 1]);
  const k = r - LAND;
  const impact = k >= 0 ? 1 + 0.09 * Math.exp(-k / 6) * Math.cos(k / 2) : 1;

  const u = flight ? ease(r, [LAND - 20, LAND], [0, 1], FLY) : 1;
  const flying = u < 1;
  const swallowAt = (uu) => {
    const [x, y] = bez(uu, target);
    const [x2, y2] = bez(Math.min(1, uu + 0.02), target);
    const ang = (Math.atan2(y2 - y, x2 - x) * 180) / Math.PI + 38; // 画像のツバメは右上向き
    return { x, y, rot: mix(ang, 0, ease(uu, [0.7, 1], [0, 1])), s: mix(0.55, 1, uu) };
  };

  return (
    <>
      <div style={{
        position: 'absolute', left: cx - size / 2, top: cy - size / 2, width: size, height: size,
        transform: `scale(${plateS * impact})`, opacity: plateO,
        filter: `drop-shadow(0 ${size * 0.1}px ${size * 0.14}px rgba(14,32,48,0.28))`,
      }}>
        <Img src={staticFile('promo/icon-plate.png')} style={{ width: size, height: size }} />
        {!flying && (
          <Img src={staticFile('promo/swallow.png')} style={{ position: 'absolute', left: size * SW.x, top: size * SW.y, width: swW, height: swH }} />
        )}
      </div>
      {flying && u > 0 && [4, 3, 2, 1, 0].map((j) => {
        const uu = Math.max(0, u - j * 0.045);
        const s = swallowAt(uu);
        return (
          <Img key={j} src={staticFile('promo/swallow.png')} style={{
            position: 'absolute', left: s.x - swW / 2, top: s.y - swH / 2, width: swW, height: swH,
            transform: `rotate(${s.rot}deg) scale(${s.s})`, opacity: j === 0 ? 1 : 0.22 * (1 - j / 5),
          }} />
        );
      })}
    </>
  );
};

export const Burst = ({ k, cx = CX, cy = CY }) => {
  if (k < 0 || k > 40) return null;
  const cols = ['#1a9cf0', '#28c868', '#f2c81c'];
  return (
    <>
      <div style={{
        position: 'absolute', left: cx - 420, top: cy - 420, width: 840, height: 840, borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(255,255,255,0.95) 0%, rgba(255,255,255,0) 60%)',
        opacity: ease(k, [0, 14], [1, 0]),
      }} />
      {cols.map((c, i) => {
        const t = ease(k - i * 3, [0, 30], [0, 1]);
        const rad = 150 + 620 * t;
        return (
          <div key={c} style={{
            position: 'absolute', left: cx - rad, top: cy - rad, width: rad * 2, height: rad * 2, borderRadius: '50%',
            border: `${mix(7, 1, t)}px solid ${c}`, opacity: k - i * 3 < 0 ? 0 : 0.55 * (1 - t), boxSizing: 'border-box',
          }} />
        );
      })}
      {Array.from({ length: 14 }).map((_, i) => {
        const a = (i / 14) * Math.PI * 2 + 0.3;
        const t = ease(k, [0, 26], [0, 1]);
        const dist = 170 + 300 * t * (0.75 + 0.25 * Math.sin(i * 7.3));
        const s = 12 * (1 - t);
        return <div key={i} style={{
          position: 'absolute', left: cx + Math.cos(a) * dist - s / 2, top: cy + Math.sin(a) * dist - s / 2,
          width: s, height: s, borderRadius: s, background: cols[i % 3], opacity: 1 - t,
        }} />;
      })}
    </>
  );
};

export const Reveal = ({ f }) => {
  const r = f - T.reveal;
  // ショーケースのスマホへ「アプリ起動」するように吸い込まれる
  const g = ease(r, [82, 95], [0, 1], EASE_IN_OUT);
  const gx = mix(0, 1330 - CX, g);
  const gy = mix(0, 540 - CY, g);
  const gs = mix(1, 0.4, g);
  const go = 1 - ease(r, [90, 96], [0, 1]);
  return (
    <AbsoluteFill>
      <Burst k={r - LAND} />
      <div style={{ position: 'absolute', inset: 0, transform: `translate(${gx}px, ${gy}px) scale(${gs})`, transformOrigin: `${CX}px ${CY}px`, opacity: go }}>
        <IconAssembly r={r} />
      </div>
      {r < 46 && (
        <div style={{ position: 'absolute', top: 610, left: 0, right: 0, display: 'flex', justifyContent: 'center' }}>
          <CharPop segs={[{ t: 'ぜんぶ、' }, { t: 'ひとつに。', grad: true }]} f={r} d={10} stagger={1.8} size={116} exitAt={40} />
        </div>
      )}
      {r >= 44 && (
        <div style={{ position: 'absolute', top: 610, left: 0, right: 0 }}>
          <Headline lines={['ScienceTokyo App']} f={r} d={48} exitAt={84} size={100} align="center" />
          <div style={{ marginTop: 18 }}>
            <SubCopy text="東京科学大学生のための、オールインワン・キャンパスアプリ" f={r} d={58} exitAt={82} size={34} align="center" color={C.tx} />
          </div>
        </div>
      )}
    </AbsoluteFill>
  );
};
