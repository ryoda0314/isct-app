import React from 'react';
import { AbsoluteFill, spring } from 'remotion';
import { C, EASE_IN_OUT, FPS, T, alpha, ease, sp } from '../theme.js';
import { Icon } from '../icons.jsx';
import { AppHeader, BEZEL, PHONE_H, PHONE_W, Phone, SCREEN_W, STATUS_H, StatusBar, TabBar } from '../Phone.jsx';
import { ChapterLabel, Headline, SubCopy } from '../text.jsx';
import { HomeScreen } from '../screens/HomeScreen.jsx';
import { NEXT_CLASS, TimetableScreen } from '../screens/TimetableScreen.jsx';
import { NotificationBanner, TasksScreen } from '../screens/TasksScreen.jsx';
import { ChatScreen } from '../screens/ChatScreen.jsx';
import { MapWorld } from '../MapWorld.jsx';

export const PHONE_SCALE = 1.06;
const CY = 540;

// 端末が中央にいるときの画面左上（グローバル座標）。マップの全画面化と位置を合わせるのに使う。
export const MAP_SCREEN = {
  x: 960 - (PHONE_W / 2 - BEZEL) * PHONE_SCALE,
  y: CY - (PHONE_H / 2 - BEZEL) * PHONE_SCALE,
  w: (PHONE_W - BEZEL * 2) * PHONE_SCALE,
  h: (PHONE_H - BEZEL * 2) * PHONE_SCALE,
};

// 課題画面のローカル時間の起点（通知音の位置合わせに AppPromo でも使う）
export const TASKS_ORIGIN = T.tasks - 10;

const SCENES = [
  {
    start: T.home, x: 1330, tab: 'home', side: 'left', num: '01', label: 'HOME', origin: T.home + 2,
    head: [[{ t: '開いた瞬間、' }], [{ t: '今日', grad: true }, { t: 'がわかる。' }]],
    sub: '次の授業、天気、締切まで。\nホームを開けば、ひと目でわかる。',
  },
  {
    start: T.timetable, x: 590, tab: 'timetable', side: 'right', num: '02', label: 'TIMETABLE', origin: T.timetable - 10,
    head: [[{ t: '時間割は、' }], [{ t: '自動', grad: true }, { t: 'でそろう。' }]],
    sub: '大学のLMS（Moodle）と連携して自動で取得。\n教室の場所まで、すぐわかる。',
  },
  {
    start: T.tasks, x: 1330, tab: 'tasks', side: 'left', num: '03', label: 'DEADLINES', origin: TASKS_ORIGIN,
    head: [[{ t: '締切を、' }], [{ t: 'もう' }, { t: '忘れない', grad: true }, { t: '。' }]],
    sub: '提出期限が近づくと、\nプッシュ通知でお知らせ。',
  },
  {
    start: T.social, x: 590, tab: 'dm', side: 'right', num: '04', label: 'SOCIAL', origin: T.social - 10,
    head: [[{ t: '授業の仲間と、' }], [{ t: 'すぐ' }, { t: 'つながる', grad: true }, { t: '。' }]],
    sub: '学院・学系のチャットに、DMやサークルも。\n学内の仲間だけの場所。',
  },
  { start: T.map, x: 960, tab: 'map', origin: T.map - 10 },
];

const SCREENS = [HomeScreen, TimetableScreen, TasksScreen, ChatScreen, null];

// 端末の位置・傾き。境界の少し手前から動き出し、小節頭で着地する。
const phonePose = (f) => {
  let x = SCENES[0].x;
  let tilt = 0;
  let dip = 0;
  for (let i = 1; i < SCENES.length; i++) {
    const B = SCENES[i].start;
    const last = i === SCENES.length - 1;
    const p = last
      ? ease(f, [B - 10, B + 6], [0, 1], EASE_IN_OUT)
      : spring({ frame: f - (B - 9), fps: FPS, config: { damping: 20, stiffness: 120, mass: 1 } });
    const dx = SCENES[i].x - SCENES[i - 1].x;
    x += dx * p;
    const bump = Math.sin(Math.PI * Math.max(0, Math.min(1, p)));
    tilt += Math.sign(dx) * bump * (last ? 6 : 15);
    dip += bump;
  }
  const entry = sp(f, T.home - 4, { damping: 17, stiffness: 130 });
  const scale = PHONE_SCALE * (0.42 + 0.58 * entry) * (1 - 0.06 * dip);
  const opacity = ease(f, [T.home - 4, T.home + 2], [0, 1]);
  const settledToMap = ease(f, [T.map - 10, T.map + 6], [0, 1]);
  const float = 7 * Math.sin(f / 38) * (1 - settledToMap);
  return { x, y: CY + float, tilt, scale, opacity };
};

// マップ画面（端末内）のヘッダーと検索欄。全画面化の直前まで MapScene と同じ見た目にする。
export const MapPhoneUI = () => (
  <div style={{ position: 'absolute', top: STATUS_H, left: 0, right: 0 }}>
    <AppHeader style={{ background: 'rgba(246,250,253,0.95)' }}>
      <Icon name="back" size={22} color={C.txH} sw={2.2} />
      <div style={{ fontSize: 21, fontWeight: 800, color: C.txH }}>キャンパスナビ</div>
    </AppHeader>
    <div style={{
      margin: '10px 12px 0', height: 48, borderRadius: 24, background: '#fff', border: `1px solid ${C.bd}`,
      boxShadow: '0 8px 20px -12px rgba(14,32,48,0.35)', display: 'flex', alignItems: 'center', gap: 10, padding: '0 16px', color: C.txD, fontSize: 15,
    }}>
      <Icon name="search" size={18} color={C.txD} /> スポットを検索...
    </div>
  </div>
);

const MapPreview = () => (
  <>
    <div style={{
      position: 'absolute', left: 0, top: 0, width: 1920, height: 1080, transformOrigin: '0 0',
      transform: `translate(${-MAP_SCREEN.x / PHONE_SCALE}px, ${-MAP_SCREEN.y / PHONE_SCALE}px) scale(${1 / PHONE_SCALE})`,
    }}>
      <MapWorld f={T.map} labels={1} />
    </div>
    <MapPhoneUI />
  </>
);

const ScreenStack = ({ f }) => (
  <>
    {SCENES.map((s, i) => {
      const next = SCENES[i + 1];
      const B = s.start;
      const first = i === 0;
      const visible = (first || f >= B - 9) && (!next || f < next.start + 4);
      if (!visible) return null;
      // アプリの画面遷移のように、新しい画面が右から不透明のまま滑り込む
      const tIn = first ? 1 : ease(f, [B - 9, B + 3], [0, 1]);
      const tOut = next ? ease(f, [next.start - 9, next.start + 3], [0, 1]) : 0;
      const Comp = SCREENS[i];
      return (
        <div key={i} style={{
          position: 'absolute', inset: 0, background: C.bg, overflow: 'hidden',
          transform: `translateX(${(1 - tIn) * SCREEN_W - tOut * 90}px)`,
          boxShadow: tIn < 1 ? '-24px 0 40px -18px rgba(14,32,48,0.35)' : 'none',
        }}>
          {Comp ? <Comp f={f - s.origin} /> : <MapPreview />}
          {tOut > 0 && <div style={{ position: 'absolute', inset: 0, background: `rgba(14,32,48,${0.14 * tOut})` }} />}
        </div>
      );
    })}
  </>
);

const tabState = (f) => {
  for (let i = SCENES.length - 1; i >= 1; i--) {
    const B = SCENES[i].start;
    if (f >= B - 6) return { from: SCENES[i - 1].tab, to: SCENES[i].tab, t: ease(f, [B - 6, B + 2], [0, 1]) };
  }
  return { from: 'home', to: 'home', t: 1 };
};

// 時間割シーン：今日の「次の授業」を端末の外に引き出して見せる
const NextClassCallout = ({ f, pose }) => {
  const g = f - T.timetable;
  if (g < 112 || g > 196) return null;
  const p = sp(g, 118, { damping: 15, stiffness: 160 });
  const out = ease(g, [182, 190], [0, 1]);
  // 水曜3限のセル中心（端末内座標 → グローバル）
  const cellX = 42 + NEXT_CLASS.day * 69 + 32.5;
  const cellY = STATUS_H + 100 + NEXT_CLASS.period * 119 + 117;
  const ox = pose.x - (PHONE_W / 2) * pose.scale + (BEZEL + cellX) * pose.scale;
  const oy = pose.y - (PHONE_H / 2) * pose.scale + (BEZEL + cellY) * pose.scale;
  const card = { x: 860, y: 790, w: 420 };
  const lineP = ease(g, [114, 124], [0, 1]);
  const ex = ox + (card.x - ox) * lineP;
  const ey = oy + (card.y + 62 - oy) * lineP;
  return (
    <>
      <svg width="1920" height="1080" style={{ position: 'absolute', inset: 0, opacity: 1 - out }}>
        <line x1={ox} y1={oy} x2={ex} y2={ey} stroke={C.orange} strokeWidth="3" strokeDasharray="2 9" strokeLinecap="round" />
        <circle cx={ox} cy={oy} r={7 * Math.min(1, lineP * 3)} fill={C.orange} stroke="#fff" strokeWidth="3" />
      </svg>
      <div style={{
        position: 'absolute', left: card.x, top: card.y, width: card.w, boxSizing: 'border-box', padding: '20px 24px',
        borderRadius: 22, background: '#fff', borderLeft: `6px solid ${C.orange}`,
        boxShadow: '0 30px 60px -24px rgba(14,32,48,0.4), 0 0 0 1px rgba(14,32,48,0.05)',
        opacity: ease(g, [118, 124], [0, 1]) * (1 - out), transform: `translateX(${(1 - p) * -30}px) scale(${0.85 + 0.15 * p})`, transformOrigin: '0% 50%',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 18, fontWeight: 800 }}>
          <span style={{ padding: '3px 10px', borderRadius: 8, background: alpha(C.orange, 0.14), color: '#b8641f' }}>次の授業</span>
          <span style={{ color: C.tx }}>3限 13:30〜</span>
        </div>
        <div style={{ fontSize: 27, fontWeight: 900, color: C.txH, marginTop: 10 }}>計算機科学実験第一</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 19, fontWeight: 600, color: C.tx, marginTop: 6 }}>
          <Icon name="pin" size={18} sw={2.2} color={C.teal} /> S3-115 ・ 南3号館
        </div>
      </div>
    </>
  );
};

const SceneText = ({ f }) => (
  <>
    {SCENES.slice(0, 4).map((s, i) => {
      const next = SCENES[i + 1];
      const g = f - s.start;
      const dur = next.start - s.start;
      if (g < -2 || g > dur + 2) return null;
      const exitAt = dur - 13;
      const left = s.side === 'left' ? 150 : 1010;
      return (
        <div key={i} style={{ position: 'absolute', left, top: 296, width: 820 }}>
          <ChapterLabel num={s.num} label={s.label} f={g} d={0} exitAt={exitAt} />
          <div style={{ marginTop: 26 }}>
            <Headline lines={s.head} f={g} d={3} exitAt={exitAt} size={104} />
          </div>
          <div style={{ marginTop: 30 }}>
            <SubCopy text={s.sub} f={g} d={12} exitAt={exitAt - 2} size={30} />
          </div>
        </div>
      );
    })}
  </>
);

export const Showcase = ({ f }) => {
  const pose = phonePose(f);
  const tasksOrigin = SCENES[2].origin;
  const tabs = tabState(f);
  return (
    <AbsoluteFill>
      <SceneText f={f} />
      <div style={{ position: 'absolute', inset: 0, perspective: 2200 }}>
        <Phone
          style={{
            left: pose.x - PHONE_W / 2, top: pose.y - PHONE_H / 2, opacity: pose.opacity,
            transform: `rotateY(${pose.tilt}deg) scale(${pose.scale})`,
          }}
          outside={f >= T.tasks - 6 && f < T.social ? <NotificationBanner f={f - tasksOrigin} /> : null}
        >
          <ScreenStack f={f} />
          <StatusBar />
          <TabBar from={tabs.from} to={tabs.to} t={tabs.t} />
        </Phone>
      </div>
      <NextClassCallout f={f} pose={pose} />
    </AbsoluteFill>
  );
};
