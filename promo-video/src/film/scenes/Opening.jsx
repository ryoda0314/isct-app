import React from 'react';
import { AbsoluteFill } from 'remotion';
import { EASE_IN, EASE_IN_OUT, EASE_OUT, TL, ease, mix } from '../theme.js';
import { Drift, LightLeak, Vignette } from '../fx.jsx';
import { Caps, Rise } from '../type.jsx';
import { MapSeq, MapTag, labelPos } from '../MapSeq.jsx';

// 0–768：暗闇に「4月。」→ 真上から見た春のキャンパスがにじみ出て、ビートと同時に建物が立ち上がる → 低く滑る → 迷う

// 冒頭（0–192）：暗闇に文字だけ
export const Open = ({ f }) => (
  <AbsoluteFill style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 26 }}>
    <Rise segs="4月。" f={f} d={14} exitAt={118} size={168} weight={300} color="#ffffff" stagger={4} dur={26} blur={22} track="0.02em" />
    <Rise segs="はじめての、大岡山。" f={f} d={62} exitAt={122} size={46} weight={500} color="rgba(255,255,255,0.82)" stagger={1.6} track="0.12em" />
  </AbsoluteFill>
);

// 地図の色づけ：遠く（画面の上）を春の霞の色に、左上から朝日。迷う場面では少し冷たく
const SpringGrade = ({ f }) => {
  const maze = ease(f, [TL.maze - 20, TL.maze + 30], [0, 1], EASE_IN_OUT);
  return (
    <>
      <AbsoluteFill style={{ background: 'rgba(240,170,196,0.07)', mixBlendMode: 'multiply' }} />
      <AbsoluteFill style={{ background: `linear-gradient(180deg, rgba(255,222,234,${0.95 - 0.3 * maze}) 0%, rgba(255,230,238,${0.5 - 0.2 * maze}) 14%, rgba(255,236,242,0) 30%)` }} />
      <LightLeak k={0.9 - 0.4 * maze} x={160} y={-60} r={1250} color="255,206,160" />
      <AbsoluteFill style={{ background: `rgba(90,110,140,${0.1 * maze})`, mixBlendMode: 'multiply' }} />
    </>
  );
};

// 建物の名前の札（本館・駅・図書館・西9号館・講堂）
const TAGS = [
  { label: '本館', en: 'MAIN BUILDING', d: 300, big: true },
  { label: '駅:大岡山駅', title: '大岡山駅', en: 'OOKAYAMA STA.', d: 318 },
  { label: '西9号館', en: 'WEST 9', d: 336 },
  { label: '南2号館', en: 'SOUTH 2', d: 354 },
];

// 迷う場面（576–768）：建物の上に「？」が拍ごとに増えていく
const QS = [
  { label: '西9号館', t: 'W9-32？', at: 600 },
  { label: '南2号館', t: 'S2-203？', at: 612 },
  { label: '本館講義棟', t: 'H121？', at: 624 },
  { label: '西5号館', t: 'W5-21？', at: 636 },
  { label: '南4号館', t: '第2演習室？', at: 648 },
  { label: '西講義棟1', t: 'WL1-301？', at: 660 },
  { label: '石川台1号館', t: 'I1-256？', at: 672 },
  { label: '東1号館', t: '休講？', at: 684 },
  { label: '西8号館', t: '何号館？', at: 696 },
  { label: '南5号館', t: 'どっち？', at: 708 },
];

const Question = ({ f, q }) => {
  const pos = labelPos('hero', f, q.label);
  if (!pos || f < q.at) return null;
  const p = ease(f, [q.at, q.at + 8], [0, 1], EASE_OUT);
  const pop = 1 + 0.25 * Math.exp(-(f - q.at) / 4) * Math.sin((f - q.at) / 1.6);
  const out = ease(f, [TL.chaos - 10, TL.chaos], [0, 1], EASE_IN);
  return (
    <div style={{
      position: 'absolute', left: pos[0], top: pos[1] - 26, transform: `translate(-50%, -100%) scale(${p * pop})`, opacity: p * (1 - out),
      padding: '8px 16px', borderRadius: 14, background: '#ffffff', color: '#0e2030', fontSize: 26, fontWeight: 800, whiteSpace: 'nowrap',
      boxShadow: '0 16px 30px -14px rgba(14,32,48,0.5)', zIndex: 45,
    }}>
      {q.t}
      <div style={{ position: 'absolute', left: '50%', bottom: -8, width: 16, height: 16, marginLeft: -8, background: '#ffffff', transform: 'rotate(45deg)', borderRadius: 3 }} />
    </div>
  );
};

export const Hero = ({ f }) => {
  const fadeIn = ease(f, [TL.hero, TL.hero + 44], [0, 1], EASE_IN_OUT);
  // 立ち上がりの瞬間（192）に、ほんの少し押し込まれるような寄り
  const punch = f >= TL.rise ? 0.018 * Math.exp(-(f - TL.rise) / 10) : 0;
  const petals = ease(f, [TL.hero, TL.rise + 40], [0, 1]) * (1 - ease(f, [TL.maze + 60, TL.chaos - 20], [0, 0.6]));
  return (
    <AbsoluteFill style={{ opacity: fadeIn, overflow: 'hidden' }}>
      <div style={{ position: 'absolute', inset: 0, transform: `scale(${1 + punch})`, filter: `blur(${(1 - fadeIn) * 10}px)` }}>
        <MapSeq name="hero" f={f} style={{ filter: 'saturate(1.2) contrast(1.12) brightness(0.98)' }} />
        <SpringGrade f={f} />
      </div>

      {/* 立ち上がりの瞬間に、光が地面をなでる */}
      <AbsoluteFill style={{
        background: `linear-gradient(105deg, rgba(255,255,255,0) ${mix(-30, 130, ease(f, [TL.rise - 4, TL.rise + 40], [0, 1]))}%, rgba(255,250,240,0.5) ${mix(-20, 140, ease(f, [TL.rise - 4, TL.rise + 40], [0, 1]))}%, rgba(255,255,255,0) ${mix(-10, 150, ease(f, [TL.rise - 4, TL.rise + 40], [0, 1]))}%)`,
        opacity: f >= TL.rise - 4 && f < TL.rise + 44 ? 1 : 0, mixBlendMode: 'screen',
      }} />

      {TAGS.map((t) => (
        <MapTag key={t.label} seq="hero" f={f} label={t.label} title={t.title} en={t.en} d={t.d} until={434 + (t.d - 300) / 3} big={t.big} accent="#e0628f" />
      ))}
      {QS.map((q) => <Question key={q.t} f={f} q={q} />)}

      <Drift f={f} kind="petal" n={44} seed={7} k={petals} fall={1.6} wind={1.4} size={[12, 30]} />
      <Vignette k={0.28 + 0.2 * ease(f, [TL.maze, TL.maze + 60], [0, 1])} color="40,20,30" />

      {/* 下の帯：キャンパスの名前 */}
      <div style={{ position: 'absolute', left: 150, bottom: 190, zIndex: 60 }}>
        <Caps text="Science Tokyo — Ookayama Campus" f={f} d={222} exitAt={290} color="#a0536f" line size={18} />
        <div style={{ marginTop: 12 }}>
          <Rise segs="東京科学大学 大岡山キャンパス" f={f} d={230} exitAt={292} size={58} weight={800} color="#3a1f2b" glow="0 2px 26px rgba(255,255,255,0.95)" stagger={1} />
        </div>
      </div>

      {/* 見出し：はじめての春は、わからないことだらけ。 */}
      <div style={{ position: 'absolute', left: 150, top: 200, zIndex: 60 }}>
        <Rise segs="はじめての春は、" f={f} d={452} exitAt={556} size={86} weight={800} color="#3a1f2b" glow="0 2px 30px rgba(255,255,255,0.8)" />
        <Rise segs={[{ t: 'わからないこと', color: '#c2386a' }, { t: 'だらけ。' }]} f={f} d={466} exitAt={560} size={86} weight={800} color="#3a1f2b" glow="0 2px 30px rgba(255,255,255,0.8)" />
      </div>

      {/* 迷う：授業は、どこ？（文字の下を暗くして読みやすく） */}
      <AbsoluteFill style={{ background: 'linear-gradient(0deg, rgba(30,14,28,0.62) 0%, rgba(30,14,28,0.3) 24%, rgba(30,14,28,0) 46%)', opacity: ease(f, [TL.maze - 6, TL.maze + 14], [0, 1]) * (1 - ease(f, [TL.chaos - 14, TL.chaos], [0, 1])), zIndex: 50 }} />
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 200, textAlign: 'center', zIndex: 60, display: 'flex', justifyContent: 'center' }}>
        <Rise segs="授業は、どこ？" f={f} d={TL.maze + 4} exitAt={TL.maze + 92} size={92} weight={900} color="#ffffff" glow="0 6px 40px rgba(20,10,30,0.55)" />
      </div>
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 200, textAlign: 'center', zIndex: 60, display: 'flex', justifyContent: 'center' }}>
        <Rise segs="この教室、何号館？" f={f} d={TL.maze + 100} exitAt={TL.chaos - 12} size={92} weight={900} color="#ffffff" glow="0 6px 40px rgba(20,10,30,0.55)" />
      </div>
    </AbsoluteFill>
  );
};
