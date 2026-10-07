import React from 'react';
import { C, COURSE, alpha, ease } from '../theme.js';
import { Icon } from '../icons.jsx';
import { AppHeader } from '../Phone.jsx';
import { Body, pop, rise } from './common.jsx';

const DAYS = ['月', '火', '水', '木', '金'];
const PERIODS = [['1限', '8:50', '10:30'], ['2限', '10:45', '12:25'], ['3限', '13:30', '15:10'], ['4限', '15:25', '17:05'], ['5限', '17:15', '18:55']];
const TODAY = 2; // 水

// [曜日, 開始限, 何コマ, 科目, 課題数]
const SLOTS = [
  [0, 1, 1, COURSE.T243, 2],
  [1, 0, 1, COURSE.T223, 1],
  [1, 2, 1, COURSE.T253, 2],
  [2, 0, 1, COURSE.A101, 1],
  [2, 2, 2, COURSE.T273, 1],
  [3, 1, 1, COURSE.T213, 2],
  [4, 0, 1, COURSE.T263, 1],
  [4, 2, 1, COURSE.C103, 0],
];

const GX = 8 + 34;      // グリッド左端
const COL_W = 65;
const GAP = 4;
const GY = 100;         // グリッド上端（Body 内）
const ROW_H = 115;

export const NEXT_CLASS = { day: 2, period: 2 }; // 「次の授業」として強調するコマ

const Cell = ({ course, count, rows, f, d, glow }) => (
  <div style={{
    position: 'absolute', inset: 0, borderRadius: 10, padding: '6px 5px 5px', boxSizing: 'border-box', overflow: 'hidden',
    background: `linear-gradient(180deg, ${alpha(course.col, 0.13)}, ${alpha(course.col, 0.07)}), #fbfdff`,
    border: `1.5px solid ${alpha(course.col, 0.38)}`, borderTop: `3px solid ${course.col}`,
    boxShadow: glow > 0 ? `0 0 0 ${2 + glow * 5}px ${alpha(course.col, 0.32 * glow)}, 0 10px 24px -8px ${alpha(course.col, 0.6 * glow)}` : 'none',
    ...pop(f, d, 0.4),
  }}>
    <div style={{ fontSize: 12, fontWeight: 800, color: course.col, letterSpacing: '0.01em' }}>{course.short}</div>
    {count > 0 && (
      <div style={{ position: 'absolute', top: 4, right: 4, width: 17, height: 17, borderRadius: 9, background: '#e0393e', color: '#fff', fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{count}</div>
    )}
    <div style={{
      fontSize: 10.5, fontWeight: 700, color: C.txH, lineHeight: 1.28, marginTop: rows > 1 ? 30 : 2,
      display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
    }}>{course.name}</div>
    <div style={{ display: 'flex', alignItems: 'center', gap: 2, fontSize: 9.5, color: C.txD, marginTop: 3 }}>
      <Icon name="pin" size={9} sw={2.4} />{course.room}
    </div>
    <div style={{ display: 'inline-block', marginTop: 4, padding: '2px 5px', borderRadius: 6, background: 'rgba(45,157,143,0.14)', color: C.teal, fontSize: 9.5, fontWeight: 800, whiteSpace: 'nowrap' }}>
      {course.bldg}
    </div>
  </div>
);

export const TimetableScreen = ({ f }) => {
  const syncing = f < 32;
  const toastIn = rise(f, 4, 20);
  const toastOut = ease(f, [104, 114], [1, 0]);
  const glow = f > 124 ? 0.55 + 0.45 * Math.sin((f - 124) / 4.2) : 0;
  return (
    <Body>
      <AppHeader style={rise(f, 0, 12)} right={
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 10px', borderRadius: 10, border: `1px solid ${C.bd}`, background: C.bg2, color: C.txH, fontSize: 13, fontWeight: 700 }}>
          <div style={{ transform: `rotate(${syncing ? f * 14 : 0}deg)` }}><Icon name="refresh" size={14} sw={2.2} /></div>更新
        </div>
      }>
        <div style={{ fontSize: 22, fontWeight: 800, color: C.txH }}>時間割</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 3, padding: '3px 8px', borderRadius: 8, background: alpha(C.accent, 0.12), color: C.accentDeep, fontSize: 13, fontWeight: 800 }}>3Q <Icon name="chevDown" size={12} sw={2.4} /></div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 3, padding: '3px 8px', borderRadius: 8, background: C.bg3, color: C.tx, fontSize: 13, fontWeight: 700 }}>2026年度 <Icon name="chevDown" size={12} sw={2.4} /></div>
      </AppHeader>

      {/* 曜日 */}
      {DAYS.map((d, i) => (
        <div key={d} style={{
          position: 'absolute', top: 64, left: GX + i * (COL_W + GAP), width: COL_W, height: 30, borderRadius: 9,
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 800,
          background: i === TODAY ? C.accent : 'transparent', color: i === TODAY ? '#fff' : C.txH, ...rise(f, 2 + i, 10),
        }}>{d}</div>
      ))}

      {/* 時限 */}
      {PERIODS.map(([p, s, e], r) => (
        <div key={p} style={{ position: 'absolute', left: 6, width: 36, top: GY + r * (ROW_H + GAP) + 30, textAlign: 'center', ...rise(f, 3 + r, 10) }}>
          <div style={{ fontSize: 12.5, fontWeight: 800, color: C.txH }}>{p}</div>
          <div style={{ fontSize: 8.5, color: C.txD, lineHeight: 1.3, marginTop: 2 }}>{s}<br />~<br />{e}</div>
        </div>
      ))}

      {/* 空きコマ */}
      {DAYS.map((_, c) => PERIODS.map((__, r) => (
        <div key={`${c}-${r}`} style={{
          position: 'absolute', left: GX + c * (COL_W + GAP), top: GY + r * (ROW_H + GAP), width: COL_W, height: ROW_H, borderRadius: 10,
          background: c === TODAY ? 'rgba(40,200,104,0.06)' : 'rgba(255,255,255,0.5)', border: '1px solid rgba(200,220,234,0.55)', boxSizing: 'border-box',
          opacity: ease(f, [4 + c, 12 + c], [0, 1]),
        }} />
      )))}

      {/* 授業（LMS から取得 → 1コマずつ埋まる） */}
      {SLOTS.map(([c, r, rows, course, count]) => {
        const isNext = c === NEXT_CLASS.day && r === NEXT_CLASS.period;
        return (
          <div key={course.code} style={{
            position: 'absolute', left: GX + c * (COL_W + GAP), top: GY + r * (ROW_H + GAP),
            width: COL_W, height: ROW_H * rows + GAP * (rows - 1), zIndex: isNext ? 5 : 1,
          }}>
            <Cell course={course} count={count} rows={rows} f={f} d={30 + c * 4 + r * 3} glow={isNext ? glow : 0} />
          </div>
        );
      })}

      {/* 同期トースト */}
      <div style={{
        position: 'absolute', bottom: 14, left: 0, right: 0, display: 'flex', justifyContent: 'center', zIndex: 20,
        opacity: toastIn.opacity * toastOut, transform: toastIn.transform,
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8, padding: '9px 16px', borderRadius: 22, background: 'rgba(14,32,48,0.92)', color: '#fff',
          fontSize: 13, fontWeight: 700, boxShadow: '0 12px 24px -10px rgba(14,32,48,0.6)',
        }}>
          {syncing ? (
            <>
              <div style={{ width: 14, height: 14, borderRadius: 7, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', transform: `rotate(${f * 18}deg)` }} />
              LMSと同期中…
            </>
          ) : (
            <>
              <div style={{ width: 18, height: 18, borderRadius: 9, background: C.accent, display: 'flex', alignItems: 'center', justifyContent: 'center', transform: `scale(${ease(f, [32, 40], [0.4, 1])})` }}>
                <Icon name="check" size={12} sw={3.2} color="#fff" />
              </div>
              8科目を取得しました
            </>
          )}
        </div>
      </div>
    </Body>
  );
};
