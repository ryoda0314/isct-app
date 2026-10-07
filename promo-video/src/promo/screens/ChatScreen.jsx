import React from 'react';
import { C, PEOPLE, ease, sp } from '../theme.js';
import { Icon } from '../icons.jsx';
import { AppHeader, SCREEN_H, STATUS_H, TAB_H } from '../Phone.jsx';
import { Body, rise } from './common.jsx';

const MISAKI = { name: '田中美咲', avatar: 'M', col: '#3dae72' };

// at: 表示されるローカルフレーム（null = 最初から表示）
const MSGS = [
  { who: PEOPLE.ichiro, text: '来週のグループ発表、資料どうする？', at: null },
  { who: 'me', text: 'スライドは分担しよう！', at: null },
  { who: MISAKI, text: '実験データ、共有フォルダに上げたよ', at: null },
  { who: 'me', text: 'ありがとう！助かる', at: null },
  { who: PEOPLE.hanako, text: '明日のレポート、どこまで進んだ？', at: 8 },
  { who: PEOPLE.kenta, text: '考察がまだ全然…', at: 30 },
  { who: 'me', text: '16時から図書館でいっしょにやろう！', at: 86 },
  { who: PEOPLE.hanako, text: 'いいね！図書館の前に集合で', at: 124 },
  { who: PEOPLE.ichiro, text: '自分も行く！', at: 148 },
];
const TYPED = MSGS[6].text;
const TYPE_START = 52;
const TYPING = { from: 100, to: 124, who: PEOPLE.hanako };

const BUBBLE_MAX = 264;
const lines = (t) => Math.max(1, Math.ceil((t.length * 14) / BUBBLE_MAX));
const msgH = (m) => (m.who === 'me' ? 0 : 17) + lines(m.text) * 21 + 17 + 12;

const COMPOSER_H = 58;

const Avatar = ({ p, size = 30 }) => (
  <div style={{ width: size, height: size, borderRadius: size / 2, background: p.col, color: '#fff', fontSize: size * 0.45, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{p.avatar}</div>
);

const Bubble = ({ m }) => {
  const me = m.who === 'me';
  return (
    <div style={{ display: 'flex', justifyContent: me ? 'flex-end' : 'flex-start', gap: 8, alignItems: 'flex-end' }}>
      {!me && <Avatar p={m.who} />}
      <div style={{ maxWidth: BUBBLE_MAX + 24 }}>
        {!me && <div style={{ fontSize: 11, color: C.txD, margin: '0 0 3px 4px' }}>{m.who.name}</div>}
        <div style={{
          padding: '8px 12px', borderRadius: me ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
          background: me ? C.accent : C.bg3, color: me ? '#fff' : C.txH, fontSize: 14, lineHeight: 1.5,
        }}>{m.text}</div>
      </div>
    </div>
  );
};

export const ChatScreen = ({ f }) => {
  const bodyH = SCREEN_H - STATUS_H - TAB_H;
  const bottom = bodyH - COMPOSER_H - 10;

  // 新しいメッセージが下から押し上げる：各メッセージの出現度 p を高さに掛けて積む
  const prog = MSGS.map((m) => (m.at === null ? 1 : sp(f, m.at, { damping: 18, stiffness: 170 })));
  const typingP = Math.min(sp(f, TYPING.from, { damping: 20 }), 1 - sp(f, TYPING.to - 4, { damping: 22 }));
  const typingH = 46 * Math.max(0, typingP);

  let y = bottom - typingH;
  const placed = [];
  for (let i = MSGS.length - 1; i >= 0; i--) {
    const h = msgH(MSGS[i]) * prog[i];
    y -= h;
    placed[i] = y;
  }

  const typedN = Math.max(0, Math.min(TYPED.length, Math.floor((f - TYPE_START) / 1.4)));
  const sent = f >= MSGS[6].at - 2;
  const draft = sent ? '' : TYPED.slice(0, typedN);

  return (
    <Body>
      <AppHeader style={rise(f, 0, 12)} right={<Icon name="users" size={20} color={C.tx} />}>
        <Icon name="back" size={22} color={C.accent} sw={2.2} />
        <div style={{ width: 34, height: 34, borderRadius: 10, background: '#a855c7', color: '#fff', fontWeight: 700, fontSize: 15, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>C</div>
        <div>
          <div style={{ fontSize: 15.5, fontWeight: 800, color: C.txH, lineHeight: 1.2 }}>CSC 勉強会</div>
          <div style={{ fontSize: 11, color: C.txD }}>4人のメンバー</div>
        </div>
      </AppHeader>

      <div style={{ position: 'absolute', top: 56, left: 0, right: 0, bottom: COMPOSER_H, overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: Math.min(14, placed[0] - 56 - 30), left: 0, right: 0, display: 'flex', justifyContent: 'center' }}>
          <div style={{ padding: '3px 12px', borderRadius: 10, background: C.bg3, color: C.txD, fontSize: 11, fontWeight: 600 }}>今日</div>
        </div>
        {MSGS.map((m, i) => {
          const p = prog[i];
          if (p <= 0.001) return null;
          const me = m.who === 'me';
          return (
            <div key={i} style={{
              position: 'absolute', left: 14, right: 14, top: placed[i] - 56,
              opacity: m.at === null ? 1 : ease(f, [m.at, m.at + 5], [0, 1]),
              transform: `scale(${0.7 + 0.3 * p})`, transformOrigin: me ? '100% 100%' : '0% 100%',
            }}>
              <Bubble m={m} />
            </div>
          );
        })}
        {typingP > 0.01 && (
          <div style={{
            position: 'absolute', left: 14, top: bottom - typingH - 56 + 6, display: 'flex', alignItems: 'center', gap: 8,
            opacity: typingP, transform: `scale(${0.8 + 0.2 * typingP})`, transformOrigin: '0% 100%',
          }}>
            <Avatar p={TYPING.who} size={26} />
            <div style={{ display: 'flex', gap: 4, padding: '10px 12px', borderRadius: '14px 14px 14px 4px', background: C.bg3 }}>
              {[0, 1, 2].map((k) => (
                <div key={k} style={{ width: 7, height: 7, borderRadius: 4, background: C.txD, transform: `translateY(${-3 * Math.max(0, Math.sin((f - k * 3) / 2.6))}px)` }} />
              ))}
            </div>
            <div style={{ fontSize: 11, color: C.txD }}>{TYPING.who.name}が入力中…</div>
          </div>
        )}
      </div>

      {/* 入力欄 */}
      <div style={{
        position: 'absolute', left: 0, right: 0, bottom: 0, height: COMPOSER_H, padding: '9px 12px', boxSizing: 'border-box',
        display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(246,250,253,0.97)', borderTop: `1px solid ${C.bd}`,
      }}>
        <Icon name="plus" size={22} color={C.txD} />
        <div style={{ flex: 1, height: 38, borderRadius: 19, border: `1px solid ${C.bd}`, background: '#fff', padding: '0 14px', display: 'flex', alignItems: 'center', fontSize: 14, color: draft ? C.txH : C.txD, whiteSpace: 'nowrap', overflow: 'hidden' }}>
          {draft || 'メッセージを入力'}
          {draft && <span style={{ width: 1.5, height: 18, background: C.accent, marginLeft: 1, opacity: Math.floor(f / 8) % 2 ? 1 : 0.2 }} />}
        </div>
        <div style={{
          width: 36, height: 36, borderRadius: 18, display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: draft ? C.accent : 'transparent', color: draft ? '#fff' : C.txD,
          transform: `scale(${f >= MSGS[6].at - 6 && f < MSGS[6].at ? 0.86 : 1})`,
        }}>
          <Icon name="send" size={17} />
        </div>
      </div>
    </Body>
  );
};

