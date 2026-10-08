import React from 'react';
import { AbsoluteFill } from 'remotion';
import { EASE_IN, EASE_OUT, T2, ease, mix } from '../theme2.js';
import { CharPop, SubCopy } from '../../promo/text.jsx';
import { RealScreen, SCREEN_H, SCREEN_W } from '../Device.jsx';

// 夜：アプリの実画面（テーマ違いも混ぜる）が輪になって回る →「まだまだ、ぜんぶ入り。」
const ITEMS = [
  'home', 'timetable', 'theme_dark', 'wall_grades', 'navi_route', 'wall_gym', 'theme_sakura', 'tasks',
  'wall_notif', 'freeroom', 'theme_titech', 'wall_pomo', 'festival_grid', 'wall_pdftools', 'theme_koyo', 'dm_chat',
  'wall_reviews', 'attendance',
];
const N = ITEMS.length;
const R = 960;
const S = 0.54; // 画面の縮尺

export const Wall = ({ f }) => {
  const g = f - T2.wall;
  const inP = ease(g, [-8, 26], [0, 1], EASE_OUT);
  const exit = ease(g, [120, 144], [0, 1], EASE_IN);
  // 回転：入りは速く、だんだんゆっくり。最後にまた加速して抜ける
  const spin = -40 + 70 * ease(g, [-8, 120], [0, 1], (x) => 1 - (1 - x) ** 2) + 160 * exit * exit;
  const lift = mix(140, 0, inP);
  return (
    <AbsoluteFill style={{ opacity: ease(g, [-8, 4], [0, 1]) * (1 - ease(g, [136, 144], [0, 1])) }}>
      <div style={{ position: 'absolute', inset: 0, perspective: 1900, perspectiveOrigin: '960px 520px' }}>
        <div style={{
          position: 'absolute', left: 960, top: 715 + lift, width: 0, height: 0, transformStyle: 'preserve-3d',
          transform: `translateZ(${-R - 260 + 380 * inP - 900 * exit}px) rotateX(-6deg) rotateY(${spin}deg)`,
        }}>
          {ITEMS.map((name, i) => {
            const a = (i / N) * 360;
            // 手前に来ている画面ほど明るく
            const rel = ((a + spin) % 360 + 360) % 360;
            const front = Math.cos((rel * Math.PI) / 180);
            const w = SCREEN_W * S;
            const h = SCREEN_H * S;
            return (
              <div key={name} style={{
                position: 'absolute', left: -w / 2, top: -h / 2, width: w, height: h, borderRadius: 52 * S + 4, overflow: 'hidden',
                transform: `rotateY(${a}deg) translateZ(${R}px)`, backfaceVisibility: 'hidden',
                boxShadow: '0 30px 60px -20px rgba(0,0,0,0.6), 0 0 0 2px rgba(255,255,255,0.12)',
                filter: `brightness(${0.45 + 0.55 * Math.max(0, front)})`,
              }}>
                <div style={{ width: SCREEN_W, height: SCREEN_H, transform: `scale(${S})`, transformOrigin: '0 0', position: 'relative' }}>
                  <RealScreen name={name} />
                </div>
              </div>
            );
          })}
        </div>
      </div>
      {/* 文字の後ろを少し暗くして読みやすく */}
      <div style={{ position: 'absolute', left: 360, top: 90, width: 1200, height: 420, background: 'radial-gradient(ellipse 50% 50% at 50% 50%, rgba(5,8,22,0.7) 0%, rgba(5,8,22,0.4) 50%, rgba(5,8,22,0) 100%)', opacity: inP * (1 - exit) }} />
      <div style={{ position: 'absolute', left: 0, right: 0, top: 96, display: 'flex', flexDirection: 'column', alignItems: 'center', opacity: 1 - exit }}>
        <CharPop segs="まだまだ、" f={g} d={6} stagger={1.8} size={78} color="#ffffff" />
        <div style={{ marginTop: 2 }}>
          <CharPop segs={[{ t: 'ぜんぶ入り', grad: true }, { t: '。' }]} f={g} d={18} stagger={2.2} size={132} color="#ffffff" />
        </div>
        <div style={{ marginTop: 14 }}>
          <SubCopy text="30以上の機能と、17のテーマ。" f={g} d={40} size={34} align="center" color="rgba(255,255,255,0.86)" />
        </div>
      </div>
    </AbsoluteFill>
  );
};

