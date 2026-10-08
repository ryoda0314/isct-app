import React from 'react';
import { AbsoluteFill } from 'remotion';
import { EASE_IN_OUT, TL, ease, sp } from '../theme.js';
import { RecCrop, RecScreen, recCard } from '../Device.jsx';
import { ExplodedPhone, Feature, PhoneAt, poseAt } from '../stage.jsx';

// 1800–2112：ロゴのあと、端末が下から現れてホーム（実際の操作の動画：スクロールして戻る）。
// そのあと端末が斜めに向きを変え、画面の中のカード（お知らせ・天気・チャット・締切）が層になって拍ごとに手前へ浮き上がる（分解図）。
const REC = 'rec_home';
const REC_AT = TL.home - 26; // 動画の 0 コマ目を映像のこのフレームに
const BASE = 112; // 分解図の土台にするコマ（スクロールが戻って止まったところ。撮影時にカードの位置を記録してある）
const EXP_FROM = TL.home + 86; // 分解図に切り替わる（端末が正面を向いて止まっている間）
const EXP_TO = TL.spring - 26;

export const homePose = (f) => poseAt([
  { f: TL.home - 26, x: 700, y: 1500, s: 0.9, rx: 32, rz: -6 },
  { f: TL.home + 14, x: 700, y: 560, s: 1.0 },
  { f: EXP_FROM + 4, x: 700, y: 560, s: 1.0 },
  { f: EXP_FROM + 36, x: 690, y: 572, s: 0.98, rx: 16, ry: 32, rz: -5 },
  { f: TL.spring - 58, x: 720, y: 572, s: 0.98, rx: 13, ry: 38, rz: -4, ease: (x) => x },
  { f: EXP_TO, x: 700, y: 560, s: 1.0 },
  // 春の扉へ：端末は右へ移る
  { f: TL.spring, x: 1400, y: 560, s: 0.96, ry: -14 },
], f);

const card = (t) => recCard(REC, BASE, t);
const union = (...rs) => {
  const v = rs.filter(Boolean);
  if (!v.length) return null;
  const x = Math.min(...v.map((r) => r.x));
  const y = Math.min(...v.map((r) => r.y));
  return { x, y, w: Math.max(...v.map((r) => r.x + r.w)) - x, h: Math.max(...v.map((r) => r.y + r.h)) - y };
};
const LAYERS = [
  { r: card('工大祭 10/10'), z: 90, label: 'お知らせ' },
  { r: card('晴れ'), z: 170, label: '天気' },
  { r: union(card('テスト広場'), card('情報理工学院'), card('CSC 情報工学系')), z: 250, label: 'チャット' },
  { r: card('計算機科学実験第一'), z: 330, label: '締切' },
];
// 層 i の浮き上がり（端末が向きを変え終わる拍から、拍ごとに1枚ずつ。終わりは上の層から順に戻る）
export const LIFTS = [0, 1, 2, 3].map((i) => EXP_FROM + 34 + i * 12);
const lift = (f) => (i) => sp(f, LIFTS[i], { damping: 15, stiffness: 120 }) * (1 - ease(f, [TL.spring - 60 + (3 - i) * 3, TL.spring - 34 + (3 - i) * 3], [0, 1], EASE_IN_OUT));

export const Home = ({ f }) => {
  const pose = homePose(f);
  const exploded = f >= EXP_FROM && f < EXP_TO;
  return (
    <AbsoluteFill>
      {exploded ? (
        <ExplodedPhone pose={pose} screen={<RecScreen name={REC} frame={BASE} />} layers={LAYERS} k={lift(f)} labelColor="#3a6a8e"
          card={(l) => <RecCrop name={REC} frame={BASE} r={l.r} radius={14} />} />
      ) : (
        <PhoneAt pose={pose}><RecScreen name={REC} frame={Math.min(f - REC_AT, BASE)} taps /></PhoneAt>
      )}
      <Feature f={f} d={TL.home + 24} exitAt={TL.spring - 62} en="Home" x={1150} y={250} w={720} size={84}
        lines={['今日のすべてが、', [{ t: 'ひと目で', grad: true }, { t: '。' }]]}
        body={'天気、お知らせ、チャット、締切。\n開いた瞬間に、今日がわかる。'} ink="#0e2030" sub="#5b7a94" />
    </AbsoluteFill>
  );
};
