import React from 'react';
import { C, COURSE, alpha, ease } from '../theme.js';
import { Icon, WeatherIcon, CloudIcon } from '../icons.jsx';
import { AppHeader } from '../Phone.jsx';
import { Body, SectionTitle, Tag, rise } from './common.jsx';

const HOURS = [['Now', 22], ['10時', 23], ['11時', 24], ['12時', 24], ['13時', 25], ['14時', 24]];

const ChatRow = ({ name, sub, col }) => (
  <div style={{
    display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', borderRadius: 12, background: C.bg2,
    border: `1px solid ${C.bd}`, borderLeft: `3px solid ${col}`, marginBottom: 8,
  }}>
    <div style={{ width: 38, height: 38, borderRadius: 10, background: col, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <Icon name="chat" size={18} sw={2} />
    </div>
    <div style={{ flex: 1 }}>
      <div style={{ fontSize: 14.5, fontWeight: 700, color: C.txH }}>{name}</div>
      <div style={{ fontSize: 11.5, color: C.txD, marginTop: 1 }}>{sub}</div>
    </div>
    <Icon name="arr" size={15} color={C.txD} />
  </div>
);

const DeadlineCard = ({ course, title, left, leftCol, pct }) => (
  <div style={{
    padding: '10px 14px', borderRadius: 12, background: C.bg2, border: `1px solid ${C.bd}`,
    borderLeft: `3px solid ${leftCol}`, marginBottom: 8, position: 'relative',
  }}>
    <Tag text={course.code} col={course.col} />
    {pct && <div style={{ position: 'absolute', right: 14, top: 12, fontSize: 11, color: C.txD }}>{pct}</div>}
    <div style={{ fontSize: 14.5, fontWeight: 700, color: C.txH, marginTop: 5 }}>{title}</div>
    <div style={{ fontSize: 13, fontWeight: 800, color: leftCol, marginTop: 2 }}>{left}</div>
  </div>
);

export const HomeScreen = ({ f }) => {
  const scroll = ease(f, [70, 170], [0, -92]);
  return (
    <Body>
      <AppHeader style={rise(f, 0, 12)} right={
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, color: C.tx }}>
          <div style={{ position: 'relative' }}>
            <Icon name="bell" size={22} />
            <div style={{ position: 'absolute', top: -6, right: -7, width: 17, height: 17, borderRadius: 9, background: '#e0393e', color: '#fff', fontSize: 10.5, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>3</div>
          </div>
          <Icon name="search" size={21} />
          <div style={{ width: 32, height: 32, borderRadius: 16, background: 'linear-gradient(135deg,#6375f0,#a855c7)', color: '#fff', fontSize: 14, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>Y</div>
        </div>
      }>
        <div style={{ fontSize: 20, fontWeight: 800, color: C.txH, letterSpacing: '-0.01em' }}>ScienceTokyo App</div>
      </AppHeader>

      <div style={{ padding: '14px 14px 0', transform: `translateY(${scroll}px)` }}>
        {/* 日付＋天気 */}
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', ...rise(f, 4) }}>
          <div style={{ width: 74, paddingLeft: 4 }}>
            <div style={{ fontSize: 31, fontWeight: 800, color: C.txH, letterSpacing: '-0.03em', lineHeight: 1.1 }}>10/7</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#4a80b4', marginTop: 4 }}>水曜日</div>
            <div style={{ fontSize: 17, fontWeight: 800, color: C.accent, marginTop: 2 }}>9:41</div>
          </div>
          <div style={{
            flex: 1, borderRadius: 18, padding: '10px 12px 9px', background: 'linear-gradient(135deg,#fff7ea,#fffdf8)',
            border: '1px solid #f2e2c4', boxShadow: '0 6px 18px -10px rgba(208,128,64,0.35)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 44, height: 44, borderRadius: 12, background: '#fdecd2', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <WeatherIcon size={36} spin={f * 0.6} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                  <span style={{ fontSize: 27, fontWeight: 800, color: C.txH, letterSpacing: '-0.02em' }}>22°</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#e8952c' }}>晴れ</span>
                </div>
                <div style={{ fontSize: 11.5, fontWeight: 600, color: C.tx }}><span style={{ color: '#e5534b' }}>↑25°</span>　<span style={{ color: '#4a8fd8' }}>↓16°</span></div>
              </div>
              <div style={{ fontSize: 12, fontWeight: 700, color: C.tx, alignSelf: 'flex-start' }}>東京</div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 7 }}>
              {HOURS.map(([h, t], i) => (
                <div key={h} style={{
                  width: 34, padding: '3px 0', borderRadius: 8, textAlign: 'center', background: i === 0 ? '#fdecd2' : 'transparent',
                  opacity: ease(f, [10 + i * 2, 16 + i * 2], [0, 1]),
                }}>
                  <div style={{ fontSize: 9.5, fontWeight: 700, color: i === 0 ? '#e8952c' : C.txD }}>{h}</div>
                  <div style={{ display: 'flex', justifyContent: 'center', margin: '1px 0' }}>{i === 0 ? <WeatherIcon size={18} /> : <CloudIcon size={18} />}</div>
                  <div style={{ fontSize: 10.5, fontWeight: 700, color: C.txH }}>{t}°</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* 今日の授業回 */}
        <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 8, ...rise(f, 9) }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 10px', borderRadius: 9, background: alpha(C.accent, 0.13), color: C.accentDeep, fontSize: 13, fontWeight: 700 }}>
            <Icon name="book" size={14} sw={2} /> 3Q 水曜授業 第2回
          </div>
          <Icon name="arr" size={15} color={C.txD} />
        </div>

        {/* カレンダー / イベント */}
        <div style={{ display: 'flex', gap: 8, marginTop: 12, ...rise(f, 13) }}>
          {[['cal', 'カレンダー', true], ['event', 'イベント', false]].map(([ic, label, on]) => (
            <div key={label} style={{
              flex: 1, height: 44, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              background: on ? alpha(C.accent, 0.1) : C.bg2, border: `1px solid ${on ? alpha(C.accent, 0.35) : C.bd}`,
              color: C.txH, fontSize: 14, fontWeight: 700,
            }}>
              <Icon name={ic} size={18} color={on ? C.accent : C.tx} /> {label}
            </div>
          ))}
        </div>

        <div style={{ marginTop: 16, ...rise(f, 17) }}>
          <SectionTitle title="学院学系チャット" link="すべて" />
          <ChatRow name="情報理工学院" sub="学院チャット" col="#a855c7" />
          <ChatRow name="CSC 情報工学系" sub="学系チャット" col="#c678dd" />
        </div>

        <div style={{ marginTop: 10, ...rise(f, 21) }}>
          <SectionTitle title="直近の締切" link="すべて" />
          <DeadlineCard course={COURSE.T273} title="実験レポート第2回" left="2h" leftCol={C.orange} pct="33%" />
          <DeadlineCard course={COURSE.T243} title="第3回レポート: ソートアルゴリズムの比較" left="1d2h" leftCol={C.orange} />
          <DeadlineCard course={COURSE.T223} title="線形代数 問題セット5" left="2d14h" leftCol={C.yellow} />
        </div>
      </div>
    </Body>
  );
};
