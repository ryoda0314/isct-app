import React from 'react';
import { AbsoluteFill, Img, staticFile } from 'remotion';
import { EASE_IN, EASE_IN_OUT, EASE_OUT, TL, ease, mix } from '../theme.js';
import { LightLeak } from '../fx.jsx';
import { Caps, Rise } from '../type.jsx';
import { Burst, IconAssembly } from '../../promo/scenes/Reveal.jsx';

// 1344–1824：ブレイク（ベースが抜ける8小節）。窓が吹き飛んだあとの、夜明けの空。
// ツバメがゆっくり横切り、「大学生活を、」「ひとつに。」。ドロップ（1728）でツバメがアイコンに着地してロゴになる。

const rnd = (seed) => {
  let s = seed;
  return () => ((s = (s * 9301 + 49297) % 233280) / 233280);
};
const CLOUDS = (() => {
  const r = rnd(5);
  return Array.from({ length: 9 }, () => ({ x: r() * 2400 - 240, y: 140 + r() * 760, w: 380 + r() * 520, h: 90 + r() * 90, v: 0.25 + r() * 0.5, o: 0.35 + r() * 0.4 }));
})();

// 遠くを横切るツバメ（羽ばたき・残像つき）
const Glide = ({ f, from, to, a, b, size = 170, arc = 120, flip = false }) => {
  const u = ease(f, [from, to], [0, 1], (x) => x);
  if (u <= 0 || u >= 1) return null;
  const pt = (t) => [mix(a[0], b[0], t), mix(a[1], b[1], t) - arc * Math.sin(t * Math.PI)];
  return (
    <>
      {[5, 4, 3, 2, 1, 0].map((j) => {
        const t = Math.max(0, u - j * 0.012);
        const [x, y] = pt(t);
        const [x2, y2] = pt(Math.min(1, t + 0.01));
        const ang = (Math.atan2(y2 - y, x2 - x) * 180) / Math.PI + (flip ? -38 + 180 : 38);
        const flap = 1 + 0.16 * Math.sin(f * 0.9 + j);
        return (
          <Img key={j} maxRetries={8} src={staticFile('promo/swallow.png')} style={{
            position: 'absolute', left: x - size / 2, top: y - size * 0.47, width: size, height: size * 0.94,
            transform: `rotate(${ang}deg) scale(${flip ? -1 : 1}, ${flap})`, opacity: j === 0 ? 0.95 : 0.14 * (1 - j / 6),
            filter: j === 0 ? 'drop-shadow(0 18px 24px rgba(14,32,48,0.25))' : 'blur(1.5px)',
          }} />
        );
      })}
    </>
  );
};

const ICON = { cx: 960, cy: 400, size: 300 };

export const Break = ({ f }) => {
  const g = f - TL.brk;
  const r = f - (TL.land - 2); // r = 2 で着地（IconAssembly の LAND）
  const enter = ease(f, [TL.brk - 6, TL.brk + 20], [0, 1]);
  const logoOut = ease(f, [TL.home - 20, TL.home + 4], [0, 1], EASE_IN_OUT);
  return (
    <AbsoluteFill style={{ opacity: enter }}>
      {/* 雲と朝日 */}
      {CLOUDS.map((c, i) => (
        <div key={i} style={{
          position: 'absolute', left: ((c.x + g * c.v) % 2400) - 240, top: c.y, width: c.w, height: c.h, borderRadius: '50%',
          background: 'radial-gradient(ellipse at 50% 60%, rgba(255,255,255,0.95) 0%, rgba(255,255,255,0.6) 45%, rgba(255,255,255,0) 70%)', opacity: c.o, filter: 'blur(6px)',
        }} />
      ))}
      <LightLeak k={0.9} x={1500 + 40 * Math.sin(g / 60)} y={200} r={1000} color="255,214,170" />

      {/* ツバメ：右から左へゆっくり → 左下から右上へ */}
      <Glide f={f} from={TL.brk + 6} to={TL.brk + 150} a={[2150, 600]} b={[-240, 360]} size={150} arc={140} flip />
      <Glide f={f} from={TL.one2 + 40} to={TL.one2 + 150} a={[-200, 860]} b={[2150, 240]} size={190} arc={180} />

      {/* 大学生活を、ひとつに。 */}
      <div style={{ position: 'absolute', left: 0, right: 0, top: 380, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
        <Rise segs="大学生活を、" f={f} d={TL.one + 2} exitAt={TL.land - 40} size={128} weight={800} color="#1b2b3c" stagger={3} dur={22} />
        <Rise segs={[{ t: 'ひとつに', grad: true }, { t: '。' }]} f={f} d={TL.one2 + 2} exitAt={TL.land - 36} size={150} weight={900} color="#1b2b3c" stagger={5} dur={22} />
      </div>
      <div style={{ position: 'absolute', left: 0, right: 0, top: 760 }}>
        <Caps text="One app for your whole campus life" f={f} d={TL.one2 + 30} exitAt={TL.land - 34} color="#6b8aa6" align="center" size={20} />
      </div>

      {/* ドロップ：ツバメがアイコンに着地してロゴ */}
      {f >= TL.land - 24 && (
        <div style={{ position: 'absolute', inset: 0, transform: `translateY(${-logoOut * 160}px) scale(${1 - 0.3 * logoOut})`, transformOrigin: '960px 400px', opacity: 1 - logoOut }}>
          <Burst k={r - 2} cx={ICON.cx} cy={ICON.cy} />
          <IconAssembly r={r} size={ICON.size} cx={ICON.cx} cy={ICON.cy} />
          <div style={{ position: 'absolute', top: 600, left: 0, right: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18 }}>
            <Rise segs={[{ t: 'ScienceTokyo ' }, { t: 'App', grad: true }]} f={f} d={TL.land + 6} size={124} weight={900} color="#0e2030" stagger={1.2} />
            <Rise segs="東京科学大学生のための、オールインワン・キャンパスアプリ" f={f} d={TL.land + 20} size={36} weight={600} color="#3a5870" stagger={0.6} blur={8} />
          </div>
        </div>
      )}
    </AbsoluteFill>
  );
};
