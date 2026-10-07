import React from 'react';
import { Img, staticFile } from 'remotion';
import { C, COURSE, alpha, ease, sp } from '../theme.js';
import { Icon } from '../icons.jsx';
import { AppHeader } from '../Phone.jsx';
import { Body, Tag, rise } from './common.jsx';

const STATUS = {
  doing: { text: '進行中', col: C.accent },
  todo: { text: '未着手', col: '#6b7f94' },
};

const GROUPS = [
  { date: '10/7', day: '今日', left: '2h', col: C.orange, course: COURSE.T273, status: 'doing', title: '実験レポート第2回', due: '10/7 11:59' },
  { date: '10/8', day: '木曜日', left: '1d2h', col: C.orange, course: COURSE.T243, status: 'todo', title: '第3回レポート: ソートアルゴリズムの比較', due: '10/8 11:59' },
  { date: '10/9', day: '金曜日', left: '2d14h', col: C.yellow, course: COURSE.T223, status: 'todo', title: '線形代数 問題セット5', due: '10/9 23:59' },
  { date: '10/10', day: '土曜日', left: '3日', col: C.yellow, course: COURSE.T213, status: 'todo', kind: 'テスト', title: '確率統計 小テスト3', due: '10/10 23:59' },
];

export const BANNER_AT = 46; // 通知が降りてくるローカルフレーム（＝4拍目。効果音もここ）

export const TasksScreen = ({ f }) => {
  const glow = f > BANNER_AT + 14 ? 0.5 + 0.5 * Math.sin((f - BANNER_AT - 14) / 4.2) : 0;
  return (
    <Body>
      <AppHeader style={rise(f, 0, 12)}>
        <div style={{ fontSize: 22, fontWeight: 800, color: C.txH }}>課題管理</div>
      </AppHeader>

      <div style={{ padding: '10px 14px 0' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, ...rise(f, 2, 12) }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 3, padding: '4px 10px', borderRadius: 8, background: alpha(C.accent, 0.12), color: C.accentDeep, fontSize: 13, fontWeight: 800 }}>3Q <Icon name="chevDown" size={12} sw={2.4} /></div>
          <div style={{ fontSize: 13, color: C.txD }}>13件</div>
          <div style={{ flex: 1 }} />
          <div style={{ padding: '5px 10px', borderRadius: 9, border: `1px solid ${C.bd}`, fontSize: 12, color: C.tx, fontWeight: 600 }}>月表示</div>
          <div style={{ padding: '5px 10px', borderRadius: 9, border: `1.5px solid ${C.accent}`, background: alpha(C.accent, 0.1), fontSize: 12, color: C.accentDeep, fontWeight: 800 }}>タイムライン</div>
        </div>

        <div style={{ display: 'flex', gap: 8, marginTop: 10, ...rise(f, 4, 12) }}>
          <div style={{ flex: 1, display: 'flex', padding: 3, borderRadius: 11, background: C.bg3 }}>
            <div style={{ flex: 1, padding: '7px 0', borderRadius: 9, background: '#fff', boxShadow: '0 2px 6px rgba(14,32,48,0.08)', fontSize: 13, fontWeight: 800, color: C.txH, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              未完了 <span style={{ padding: '0 7px', borderRadius: 8, background: alpha(C.accent, 0.15), color: C.accentDeep, fontSize: 12 }}>10</span>
            </div>
            <div style={{ flex: 1, padding: '7px 0', fontSize: 13, fontWeight: 600, color: C.txD, textAlign: 'center' }}>マイタスク</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '0 10px', borderRadius: 11, border: `1px solid ${C.bd}`, fontSize: 12.5, color: C.tx, fontWeight: 600 }}>
            <Icon name="check" size={13} sw={2.4} /> 提出済 <span style={{ padding: '0 6px', borderRadius: 7, background: C.bg3, fontSize: 11.5 }}>3</span>
          </div>
        </div>

        <div style={{ marginTop: 6 }}>
          {GROUPS.map((g, i) => {
            const first = i === 0;
            return (
              <div key={g.title} style={{ ...rise(f, 6 + i * 4) }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '12px 2px 7px' }}>
                  <span style={{ fontSize: 16, fontWeight: 800, color: g.col }}>{g.date}</span>
                  <span style={{ fontSize: 13, color: C.txD }}>{g.day}</span>
                  <span style={{ fontSize: 13, fontWeight: 800, color: g.col }}>{g.left}</span>
                  <div style={{ flex: 1, height: 1, background: C.bd }} />
                </div>
                <div style={{
                  position: 'relative', padding: '11px 14px', borderRadius: 13, background: C.bg2, border: `1px solid ${C.bd}`,
                  borderLeft: `3px solid ${g.course.col}`,
                  boxShadow: first && glow > 0 ? `0 0 0 ${2 + glow * 4}px ${alpha(C.orange, 0.28 * glow)}, 0 12px 26px -12px ${alpha(C.orange, 0.7 * glow)}` : 'none',
                }}>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <Tag text={g.course.code} col={g.course.col} />
                    {g.kind && <Tag text={g.kind} col={C.yellow} />}
                    <Tag text={STATUS[g.status].text} col={STATUS[g.status].col} />
                  </div>
                  <div style={{ position: 'absolute', right: 12, top: 12, color: C.txD }}><Icon name="x" size={16} /></div>
                  <div style={{ fontSize: 15, fontWeight: 800, color: C.txH, marginTop: 6 }}>{g.title}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: C.txD, marginTop: 3 }}>
                    <Icon name="clock" size={12} sw={2.2} />{g.due}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </Body>
  );
};

// iOS 風のプッシュ通知（端末の外側へ少しはみ出して描く）
// 文言はサーバー実装（lib/deadline-notify.js）が送るものと同じ。
export const NotificationBanner = ({ f, width = 426 }) => {
  const p = sp(f, BANNER_AT, { damping: 15, stiffness: 160 });
  const out = ease(f, [BANNER_AT + 104, BANNER_AT + 116], [0, 1]);
  const y = -150 + 166 * p - 170 * out;
  if (f < BANNER_AT - 1 || out >= 1) return null;
  return (
    <div style={{
      position: 'absolute', left: (414 - width) / 2, top: y, width, zIndex: 200,
      padding: '13px 15px', boxSizing: 'border-box', borderRadius: 26,
      background: 'rgba(255,255,255,0.94)', backdropFilter: 'blur(14px)',
      boxShadow: '0 28px 50px -18px rgba(14,32,48,0.45), 0 0 0 1px rgba(14,32,48,0.06)',
      display: 'flex', gap: 12, alignItems: 'flex-start', opacity: ease(f, [BANNER_AT, BANNER_AT + 4], [0, 1]) * (1 - out),
    }}>
      <Img src={staticFile('promo/icon.png')} style={{ width: 42, height: 42, borderRadius: 10, flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, color: C.txD, fontWeight: 600 }}>
          <span>ScienceTokyo App</span><span>今</span>
        </div>
        <div style={{ fontSize: 15.5, fontWeight: 800, color: C.txH, marginTop: 1 }}>課題の締切</div>
        <div style={{ fontSize: 14, color: C.tx, lineHeight: 1.45, marginTop: 1 }}>「実験レポート第2回」の提出期限がまもなく（3時間以内）です</div>
      </div>
    </div>
  );
};
