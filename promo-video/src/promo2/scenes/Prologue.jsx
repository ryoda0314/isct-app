import React from 'react';
import { AbsoluteFill } from 'remotion';
import { BEAT, EASE_IN, EASE_IN_OUT, T2, ease, mix, sp } from '../theme2.js';
import { CharPop } from '../../promo/text.jsx';
import { Phone3D, RealScreen } from '../Device.jsx';
import { LockScreen } from '../overlays.jsx';

// 0〜384f（曲のブレイク8小節。ベースがなく静か）：夜明けの空 → ロック画面に通知 → 機能の言葉が端末へ吸い込まれる → ロック解除して画面に飛び込む
const WORDS = [
  { t: '時間割', x: 420, y: 300 },
  { t: '課題', x: 1500, y: 300 },
  { t: '成績', x: 330, y: 560 },
  { t: '地図', x: 1590, y: 560 },
  { t: '友だち', x: 420, y: 820 },
  { t: '工大祭', x: 1500, y: 820, grad: true },
];
const SUCK = [T2.words + 72, T2.words + 86];
const PX = 960;
const PY = 560;

export const Prologue = ({ f }) => {
  // 端末：下から上がってきて、最後はカメラごと画面に飛び込む
  const rise = sp(f, T2.lock - 8, { damping: 18, stiffness: 90, mass: 1.1 });
  const unlock = ease(f, [T2.unlock + 8, T2.unlock + 26], [0, 1], EASE_IN_OUT);
  const dive = ease(f, [T2.unlock + 30, T2.logo - 2], [0, 1], EASE_IN);
  const pulse = f >= SUCK[1] ? Math.exp(-(f - SUCK[1]) / 6) : 0;
  const phoneY = mix(1500, PY, rise);
  const scale = 0.94 * (1 + 0.04 * pulse) * (1 + 5.5 * dive * dive);
  const rx = (1 - rise) * 24;
  return (
    <AbsoluteFill>
      {/* 冒頭の一文 */}
      {f < T2.lock + 20 && (
        <div style={{ position: 'absolute', left: 0, right: 0, top: 380, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, opacity: 1 - ease(f, [T2.lock - 6, T2.lock + 14], [0, 1]) }}>
          <CharPop segs="今日も、" f={f} d={8} stagger={2.2} size={64} color="rgba(255,255,255,0.82)" weight={600} />
          <CharPop segs={[{ t: 'キャンパスの1日', grad: true }, { t: 'がはじまる。' }]} f={f} d={34} stagger={2} size={92} color="#ffffff" />
        </div>
      )}

      {/* 機能の言葉（拍ごとに現れ、最後に端末へ吸い込まれる） */}
      {f >= T2.words - 2 && f < SUCK[1] + 2 && WORDS.map((w, i) => {
        const at = T2.words + i * BEAT;
        const p = sp(f, at, { damping: 12, stiffness: 190, mass: 0.8 });
        const q = ease(f, SUCK, [0, 1], EASE_IN);
        const x = mix(w.x, PX, q);
        const y = mix(w.y, PY, q);
        if (f < at - 1) return null;
        return (
          <div key={w.t} style={{
            position: 'absolute', left: x, top: y, transform: `translate(-50%, -50%) scale(${(0.6 + 0.4 * p) * (1 - 0.85 * q)})`,
            opacity: Math.min(1, p * 1.6) * (1 - ease(f, [SUCK[1] - 4, SUCK[1]], [0, 1])),
            fontSize: 104, fontWeight: 900, letterSpacing: '-0.02em', whiteSpace: 'nowrap', color: '#fff',
            textShadow: '0 0 40px rgba(120,190,255,0.55)',
            ...(w.grad ? { backgroundImage: 'linear-gradient(95deg, #5fc1ff 0%, #4fe08f 58%, #d8f04a 100%)', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent', textShadow: 'none' } : {}),
          }}>{w.t}</div>
        );
      })}

      {/* 吸い込まれたあとの一文（端末の左右に分けて置く） */}
      {f >= SUCK[1] - 2 && f < T2.logo && (
        <>
          <div style={{ position: 'absolute', left: 0, width: PX - 250, top: 500, display: 'flex', justifyContent: 'flex-end', opacity: 1 - ease(f, [T2.unlock + 26, T2.unlock + 40], [0, 1]) }}>
            <CharPop segs="毎日のぜんぶを、" f={f} d={SUCK[1] + 2} stagger={1.6} size={68} color="#ffffff" />
          </div>
          <div style={{ position: 'absolute', left: PX + 250, top: 500, opacity: 1 - ease(f, [T2.unlock + 26, T2.unlock + 40], [0, 1]) }}>
            <CharPop segs={[{ t: 'ひとつのアプリ', grad: true }, { t: 'で。' }]} f={f} d={SUCK[1] + 14} stagger={1.6} size={68} color="#ffffff" />
          </div>
        </>
      )}

      {f >= T2.lock - 10 && (
        <Phone3D x={PX} y={phoneY} scale={scale} rx={rx} glare={0.6} shadow={1 - dive}>
          {unlock > 0 && <RealScreen name="home" />}
          {unlock < 1 && <LockScreen f={f} unlock={unlock} />}
          {/* 言葉が吸い込まれた瞬間に画面が光る */}
          {pulse > 0.01 && <div style={{ position: 'absolute', inset: 0, background: `rgba(255,255,255,${0.5 * pulse})`, zIndex: 110 }} />}
        </Phone3D>
      )}

      {/* 画面に飛び込む直前の白 */}
      <AbsoluteFill style={{ background: '#fff', opacity: ease(f, [T2.logo - 10, T2.logo - 1], [0, 1]) }} />
    </AbsoluteFill>
  );
};
