import React from 'react';
import { AbsoluteFill } from 'remotion';
import { C, EASE_IN, T, alpha, ease, sp } from '../theme.js';
import { Icon } from '../icons.jsx';
import { Headline, SubCopy } from '../text.jsx';

// アプリに実在する機能（campus-sns/i18n.js の nav.* / tool.* の表記）
const FEATURES = [
  ['時間割', 'grid'], ['課題', 'tasks'], ['成績', 'bar'], ['出欠管理', 'attend'], ['履修登録', 'clipboard'],
  ['期末試験', 'fileText'], ['学年暦', 'event'], ['マイ教科書', 'book'], ['成績割合', 'percent'], ['授業レビュー', 'star'],
  ['空き教室', 'door'], ['キャンパスナビ', 'map'], ['電車', 'train'], ['図書館', 'library'], ['トレセン', 'dumbbell'],
  ['カレンダー', 'cal'], ['イベント', 'mega'], ['サークル', 'users'], ['語学コミュニティ', 'globe'], ['友達', 'userPlus'],
  ['DM', 'mail'], ['新入生掲示板', 'grad'], ['通知', 'bell'], ['検索', 'search'], ['ブックマーク', 'bmark'],
  ['ポケット', 'inbox'], ['手書きノート', 'pen'], ['PDF結合・解除', 'file'], ['ポモドーロ', 'timer'], ['ミュージック', 'music'],
];
const COLS = ['#1a9cf0', '#d4843e', '#a855c7', '#3dae72', '#6375f0', '#e5534b', '#2d9d8f', '#c75d8e', '#c99a14', '#20a35a'];

const N_COL = 10;
const TILE = 150;
const GAP = 20;
const X0 = (1920 - (N_COL * TILE + (N_COL - 1) * GAP)) / 2;
const Y0 = 410;

export const Wall = ({ f }) => {
  const w = f - T.wall;
  return (
    <AbsoluteFill>
      <div style={{ position: 'absolute', top: 136, left: 0, right: 0 }}>
        <Headline lines={[[{ t: 'まだまだ、' }, { t: 'ぜんぶ入り', grad: true }, { t: '。' }]]} f={w} d={1} exitAt={86} size={108} align="center" />
        <div style={{ marginTop: 24 }}>
          <SubCopy text="30以上の機能が、ひとつのアプリに。" f={w} d={10} exitAt={84} size={32} align="center" />
        </div>
      </div>
      {FEATURES.map(([label, icon], i) => {
        const c = i % N_COL;
        const r = Math.floor(i / N_COL);
        const dist = Math.hypot(c - 4.5, (r - 1) * 1.6);
        const delay = 3 + dist * 2.3;
        const p = sp(w, delay, { damping: 13, stiffness: 180 });
        const outT = ease(w, [84 + (5.4 - dist) * 1.1, 92 + (5.4 - dist) * 1.1], [0, 1], EASE_IN);
        const col = COLS[i % COLS.length];
        const bob = 3 * Math.sin((w + i * 9) / 11);
        return (
          <div key={label} style={{
            position: 'absolute', left: X0 + c * (TILE + GAP), top: Y0 + r * (TILE + GAP + 20), width: TILE, height: TILE + 6,
            boxSizing: 'border-box', borderRadius: 34, background: '#fff',
            boxShadow: '0 18px 36px -20px rgba(14,32,48,0.35), 0 0 0 1px rgba(14,32,48,0.05)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12,
            opacity: Math.min(1, p * 1.4) * (1 - outT),
            transform: `translateY(${(1 - p) * 50 + bob + outT * 30}px) rotate(${(1 - p) * -14}deg) scale(${(0.3 + 0.7 * p) * (1 - 0.25 * outT)})`,
          }}>
            <div style={{ width: 64, height: 64, borderRadius: 20, background: alpha(col, 0.13), color: col, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Icon name={icon} size={32} sw={1.9} />
            </div>
            <div style={{ fontSize: label.length >= 7 ? 15 : 17, fontWeight: 800, color: C.txH, letterSpacing: '-0.02em', whiteSpace: 'nowrap' }}>{label}</div>
          </div>
        );
      })}
    </AbsoluteFill>
  );
};
