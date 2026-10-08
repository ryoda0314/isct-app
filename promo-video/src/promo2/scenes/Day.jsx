import React from 'react';
import { AbsoluteFill, spring } from 'remotion';
import { C, EASE_IN, EASE_IN_OUT, FPS, T2, ease, mix, sp } from '../theme2.js';
import { Headline, SubCopy } from '../../promo/text.jsx';
import { Phone3D, RealScreen, ScreenFlow, ShotCrop, STATUS_H } from '../Device.jsx';
import { Banner, SubmitSheet, Tap } from '../overlays.jsx';

// ── 共通 ────────────────────────────────────────
const springIn = (f, at, cfg = {}) => spring({ frame: f - at, fps: FPS, config: { damping: 19, stiffness: 120, mass: 1, ...cfg } });

// 見出し＋説明（v1 と同じ組み方。tone: dark = 明るい空の上、light = 暗い空の上）
export const SceneText = ({ g, side = 'left', head, sub, exitAt, top = 300, tone = 'dark', note }) => {
  const left = side === 'left' ? 150 : 1080;
  const color = tone === 'dark' ? C.txH : '#ffffff';
  const subColor = tone === 'dark' ? C.tx : 'rgba(255,255,255,0.86)';
  return (
    <div style={{ position: 'absolute', left, top, width: 760 }}>
      <Headline lines={head} f={g} d={3} exitAt={exitAt} size={100} color={color} />
      {sub && (
        <div style={{ marginTop: 30 }}>
          <SubCopy text={sub} f={g} d={12} exitAt={exitAt - 2} size={30} color={subColor} />
        </div>
      )}
      {note && (
        <div style={{ marginTop: 18 }}>
          <SubCopy text={note} f={g} d={22} exitAt={exitAt - 2} size={20} color={tone === 'dark' ? C.txD : 'rgba(255,255,255,0.6)'} />
        </div>
      )}
    </div>
  );
};

// 画面の一部を切り出して、端末から浮き上がらせたカード
export const Lift = ({ g, at, until, name, crop, x, y, scale = 1.6, from = [0, 0], tilt = -10 }) => {
  if (g < at - 1 || g > until + 10) return null;
  const p = sp(g, at, { damping: 15, stiffness: 150 });
  const out = ease(g, [until, until + 9], [0, 1], EASE_IN);
  return (
    <div style={{
      position: 'absolute', left: x, top: y, zIndex: 40,
      opacity: Math.min(1, p * 1.6) * (1 - out),
      transform: `perspective(1600px) translate(${(1 - p) * from[0]}px, ${(1 - p) * from[1]}px) rotateY(${tilt * (1 - p)}deg) scale(${0.75 + 0.25 * p - 0.08 * out})`,
      transformOrigin: '50% 50%',
      filter: 'drop-shadow(0 34px 34px rgba(14,32,48,0.3)) drop-shadow(0 6px 10px rgba(14,32,48,0.12))',
    }}>
      <ShotCrop name={name} {...crop} scale={scale} radius={16} />
    </div>
  );
};

// ── 8:40 ホーム ──────────────────────────────────
export const Home = ({ f }) => {
  const g = f - T2.home;
  const inP = springIn(g, -8);
  const dive = ease(g, [124, 144], [0, 1], EASE_IN);
  const x = mix(2150, 1440, inP) + mix(0, 960 - 1440, dive);
  const ry = mix(-50, -12, inP) + 5 * ease(g, [10, 120], [0, 1]) + 12 * dive;
  const scale = mix(1, 2.6, dive);
  const scroll = ease(g, [44, 112], [0, 300], EASE_IN_OUT);
  return (
    <AbsoluteFill>
      <SceneText g={g} side="left" head={[[{ t: '開けば、' }], [{ t: '今日', grad: true }, { t: 'がわかる。' }]]}
        sub={'天気、締切、学内のお知らせまで。\nホームを開けば、ひと目で。'} exitAt={118} />
      <Phone3D x={x} y={548 + 6 * Math.sin(f / 30)} ry={ry} scale={scale} opacity={1 - ease(g, [134, 144], [0, 1])}>
        <RealScreen name="home_tall" scroll={scroll} />
      </Phone3D>
      <Lift g={g} at={20} until={110} name="home" crop={{ x: 8, y: 132, w: 374, h: 142 }} x={930} y={300} scale={1.42} from={[300, 0]} />
      <Lift g={g} at={56} until={116} name="home" crop={{ x: 10, y: 622, w: 370, h: 96 }} x={960} y={690} scale={1.42} from={[300, -40]} />
    </AbsoluteFill>
  );
};

// ── 8:50 1限：時間割と出欠 ──────────────────────────
export const Class = ({ f }) => {
  const g = f - T2.cls;
  const a = springIn(g, -10);
  const b = springIn(g, 4);
  const out = ease(g, [128, 144], [0, 1], EASE_IN);
  return (
    <AbsoluteFill>
      <SceneText g={g} side="left" head={[[{ t: '授業のことは、' }], [{ t: 'ぜんぶ', grad: true }, { t: 'ここに。' }]]}
        sub={'時間割は大学のLMSと連携して自動でそろう。\n出欠の残り回数も、ひと目で。'} exitAt={120} />
      <Phone3D x={mix(2300, 1690, b)} y={590 + 760 * out} scale={0.82} ry={mix(-40, -24, b)} z={-160} opacity={1 - out} shadow={0.7}>
        <RealScreen name="attendance" />
      </Phone3D>
      <Phone3D x={mix(2200, 1290, a)} y={548 + 6 * Math.sin(f / 32) + 760 * out} ry={mix(-46, -12, a)} opacity={1 - out}>
        <RealScreen name="timetable" />
        {/* いまの授業（水曜1限）を光らせる */}
        <div style={{
          position: 'absolute', left: 178, top: STATUS_H + 82, width: 70, height: 74, borderRadius: 10, zIndex: 30,
          boxShadow: `0 0 0 ${3 + 2 * Math.sin(g / 5)}px rgba(40,200,104,${0.8 * ease(g, [24, 32], [0, 1])})`,
        }} />
      </Phone3D>
      <Lift g={g} at={30} until={118} name="timetable" crop={{ x: 178, y: 82, w: 70, h: 74 }} x={930} y={380} scale={2.7} from={[320, -60]} tilt={-14} />
      <Lift g={g} at={64} until={120} name="attendance" crop={{ x: 12, y: 318, w: 366, h: 56 }} x={880} y={700} scale={1.45} from={[420, 0]} />
    </AbsoluteFill>
  );
};

// ── 12:40 昼休み：空き教室と DM ──────────────────────
export const Lunch = ({ f }) => {
  const g = f - T2.lunch;
  const inP = springIn(g, -10);
  const out = ease(g, [128, 144], [0, 1], EASE_IN);
  return (
    <AbsoluteFill>
      <SceneText g={g} side="right" head={[[{ t: '昼休みは、' }], [{ t: '空き教室', grad: true }, { t: 'で。' }]]}
        sub={'いま空いている教室をすぐに探して、\n友だちにはそのままDM。'} exitAt={120} />
      <Phone3D x={mix(-300, 620, inP)} y={548 + 6 * Math.sin(f / 30) + 760 * out} ry={mix(46, 12, inP)} opacity={1 - out}>
        <ScreenFlow f={g} screens={[{ at: 0, name: 'freeroom' }, { at: 74, name: 'dm_chat' }]} />
      </Phone3D>
      <Lift g={g} at={26} until={70} name="freeroom" crop={{ x: 8, y: 602, w: 376, h: 104 }} x={1080} y={700} scale={1.5} from={[-420, 0]} tilt={12} />
      <Lift g={g} at={86} until={122} name="dm_chat" crop={{ x: 98, y: 224, w: 288, h: 76 }} x={1080} y={700} scale={1.7} from={[-420, 0]} tilt={12} />
    </AbsoluteFill>
  );
};

// ── 17:20 放課後：締切の通知 → アプリから提出 ─────────────
const SHEET_AT = 54; // 提出シートが出る（場面先頭から）
export const SUBMIT = { pick: SHEET_AT + 16, press: SHEET_AT + 36, done: SHEET_AT + 54 };

export const Tasks = ({ f }) => {
  const g = f - T2.tasks;
  const inP = springIn(g, -10);
  const out = ease(g, [130, 144], [0, 1], EASE_IN);
  const t = g - SHEET_AT;
  return (
    <AbsoluteFill>
      <SceneText g={g} side="left" head={[[{ t: '締切も、' }], [{ t: '提出', grad: true }, { t: 'も、ここで。' }]]}
        sub={'締切が近づくと通知でお知らせ。\nファイルを選んで、アプリから提出。'} exitAt={122} />
      <Phone3D x={mix(2150, 1330, inP)} y={560 + 6 * Math.sin(f / 30) + 700 * out} ry={mix(-46, -12, inP)} opacity={1 - out}
        outside={<Banner f={g} at={6} until={46} app="課題の締切" body="「実験レポート第2回」の締切が明日です" />}>
        <ScreenFlow f={g} screens={[{ at: 0, name: 'tasks' }, { at: 40, name: 'asgn_detail' }]} />
        <SubmitSheet t={t} pick={SUBMIT.pick - SHEET_AT} press={SUBMIT.press - SHEET_AT} done={SUBMIT.done - SHEET_AT} />
        <Tap x={140} y={STATUS_H + 272} f={g} at={32} />
        <Tap x={195} y={STATUS_H + 560} f={g} at={SUBMIT.pick} />
        <Tap x={195} y={STATUS_H + 700} f={g} at={SUBMIT.press} />
      </Phone3D>
    </AbsoluteFill>
  );
};
