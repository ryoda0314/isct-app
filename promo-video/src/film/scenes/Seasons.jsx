import React from 'react';
import { AbsoluteFill, Img, staticFile } from 'remotion';
import { STATUS_H } from '../../promo/Phone.jsx';
import { EASE_IN, EASE_IN_OUT, EASE_OUT, SEASONS, TL, ease, mix } from '../theme.js';
import { FilmFlow, flowTaps, rectOf } from '../Device.jsx';
import { Drift, LightLeak, Sparkle, Vignette } from '../fx.jsx';
import { MapSeq, MapTag, labelPos, pointPos, routeHead } from '../MapSeq.jsx';
import { Caps, Rise } from '../type.jsx';
import { Feature, LiftCard, PhoneAt, SeasonGate, poseAt } from '../stage.jsx';

// 2112–4416：春夏秋冬。端末の画面はすべてアプリを実際に操作した動画（capture/record_film.mjs）。
// 季節の扉（大きな一文字）では、ホームがその季節のテーマ（桜・新緑・紅葉・雪）へ斜めに塗り替わる（設定の画面は見せない）。
// 春：時間割・行事・3Dキャンパスナビ / 夏：締切の通知と課題・空き教室・DM / 秋：工大祭の夜とクーポン / 冬：成績と学年暦

// 季節の扉：その季節のホームを前のテーマのまま出し（前の画面から 10 フレームで重なる。動画の 47 コマ目で止める）、
// 扉の2小節目の頭から 16 フレームかけて、テーマを切り替えたあとのコマ（動画の 48 コマ目〜）が斜めの光の帯とともに塗り込む
const gate = (at, rec) => [
  { at: at + 10, rec, from: 10, until: 47, mode: 'fade', slide: 10 },
  { at: at + 64, rec, from: 64, mode: 'theme', slide: 16 },
];
const COUPON_TAP = TL.fest + 236; // 「店員さんの前で使う」を押す → アプリの「クーポン使用済み」の画面
export const COUPON = { tap: COUPON_TAP, used: COUPON_TAP + 1 };
const FEST = { at: COUPON_TAP - 150, rec: 'rec_fest' }; // 動画の 150 コマ目で押す。端末が画面の外にいる間に切り替わる
const NAVI = { at: TL.naviUI - 40, rec: 'rec_navi' };

// 端末の画面の流れ（季節ごと。前の季節の最後の画面から始まる）
const SPRING_FLOW = [
  ...gate(TL.spring, 'rec_gate_spring'), // ホーム（ツバメ）→ 桜。分解図のあとのホームと同じ画面から始まる
  { at: TL.tt, rec: 'rec_tt', mode: 'fade', slide: 2 }, // ホーム（桜）→ 時間割 → 授業 → 授業のチャット → 投票
  { at: TL.tt + 192, rec: 'rec_events' }, // 行事に「参加」
];
const NAVI_FLOW = [NAVI]; // 検索 → 建物へカメラが飛ぶ → ここへ案内（ルートが伸びる）→ 案内を開始（地図が傾いて追う）
const SUMMER_FLOW = [
  NAVI,
  ...gate(TL.summer, 'rec_gate_summer'), // ホーム（桜）→ 新緑
  { at: TL.asgn, rec: 'rec_asgn', mode: 'fade', slide: 2 }, // 課題タブ → 課題 → やることにチェック → アプリで PDF を提出
  { at: TL.free, rec: 'rec_free' }, // 時限を切り替える → 使用中も表示 → 教室の週間の空き
  { at: TL.social, rec: 'rec_dm' }, // メッセージを打って送る → スタンプ
];
// DM の横の端末：友達 → DM の一覧 → 山田花子とのDM（タップは拍に合わせて 48・84 フレーム目）
const FRIENDS_FLOW = [{ at: TL.social + 8, rec: 'rec_friends' }];
const AUTUMN_FLOW = [
  { at: TL.social, rec: 'rec_dm' },
  ...gate(TL.autumn, 'rec_gate_autumn'), // ホーム（新緑）→ 紅葉
  FEST, // 出店一覧 → 出店 → クーポンを使う
];
const WINTER_FLOW = [
  FEST,
  ...gate(TL.winter, 'rec_gate_winter'), // ホーム（紅葉）→ 雪
  { at: TL.exams, rec: 'rec_grades', mode: 'fade', slide: 2 }, // 成績 → GPA（80 コマ目）
  { at: TL.exams + 172, rec: 'rec_acad' }, // 学年暦
];
// 動画の中でタップした瞬間（効果音）。ナビの最初の検索欄のタップは、端末がまだ画面の下にいるので鳴らさない
export const TAPS = [...new Set([SPRING_FLOW, NAVI_FLOW, SUMMER_FLOW, FRIENDS_FLOW, AUTUMN_FLOW, WINTER_FLOW].flatMap(flowTaps))]
  .filter((at) => at > TL.naviUI || at < TL.navi).sort((a, b) => a - b);
// アプリで提出して「提出しました」が出る瞬間（動画の 216 コマ目で「提出する」→ アップロード・提出・確認の段階を経て 244 コマ目）
export const ASGN_DONE = TL.asgn + 244;

const GATE = { x: 1400, y: 560, s: 0.96, ry: -14 }; // 季節の扉での端末の位置（右）
const sameAs = (f, p) => ({ f, ...p });
const ThemeTag = ({ f, at, until, text, color }) => (
  <div style={{ position: 'absolute', left: GATE.x - 300, width: 600, top: 1016, zIndex: 60 }}>
    <Caps text={text} f={f} d={at} exitAt={until} color={color} size={16} track="0.3em" align="center" />
  </div>
);

// ── 春 ──────────────────────────────────────────────
const SP = SEASONS.spring;
const springPose = (f) => poseAt([
  sameAs(TL.spring - 4, GATE),
  sameAs(TL.tt, GATE),
  { f: TL.tt + 26, x: 1340, y: 560, s: 1.04, ry: -8 },
  { f: TL.navi - 26, x: 1340, y: 560, s: 1.04, ry: -6 },
  { f: TL.navi + 4, x: 1340, y: 1680, s: 0.9, rx: 28, o: 1 },
], f);

export const Spring = ({ f }) => {
  const pose = springPose(f);
  return (
    <AbsoluteFill>
      <SeasonGate f={f} at={TL.spring} until={TL.tt - 14} season={SP} kind="petal" />
      <PhoneAt pose={pose}>
        <FilmFlow f={f} screens={SPRING_FLOW} slide={14} />
      </PhoneAt>
      <ThemeTag f={f} at={TL.spring + 52} until={TL.tt - 10} text="テーマ：桜" color={SP.accent} />

      {/* 時間割 */}
      <Feature f={f} d={TL.tt + 12} exitAt={TL.tt + 176} en="Timetable" x={150} y={210} w={900} size={88}
        lines={['時間割も、教室も、', [{ t: '手のひらに', grad: [[212, 80, 122], [232, 120, 154]] }, { t: '。' }]]}
        body={'履修した授業から、時間割ができあがる。\n授業ごとのチャットにも、そのまま。'} ink={SP.ink} sub={SP.sub} />

      {/* 行事 */}
      <Feature f={f} d={TL.tt + 200} exitAt={TL.navi - 22} en="Events" x={150} y={250} w={900} size={88}
        lines={['入学式も、', 'オリエンテーションも。']} body="大学の行事も、アプリでチェック。" ink={SP.ink} sub={SP.sub} />
      <Drift f={f} kind="petal" n={22} seed={33} k={ease(f, [TL.tt - 20, TL.tt + 20], [0, 0.7]) * (1 - ease(f, [TL.navi - 20, TL.navi], [0, 1]))} fall={1.2} wind={1} size={[10, 22]} />
    </AbsoluteFill>
  );
};

// ── 3Dキャンパスナビ（全画面の地図 → スマホの案内画面）────────────
export const Navi = ({ f }) => {
  const enter = ease(f, [TL.navi - 10, TL.navi + 10], [0, 1]);
  const toUI = ease(f, [TL.naviUI - 8, TL.naviUI + 22], [0, 1], EASE_IN_OUT);
  const head = routeHead(f);
  const sta = labelPos('route', f, '駅:大岡山駅');
  const done = ease(f, [TL.navi + 176, TL.navi + 188], [0, 1]);
  const pose = poseAt([
    { f: TL.naviUI - 30, x: 1260, y: 1700, s: 0.92, rx: 30 },
    { f: TL.naviUI + 14, x: 1260, y: 560, s: 1.04, ry: -10 },
    { f: TL.summer - 30, x: 1260, y: 560, s: 1.04, ry: -8 },
    sameAs(TL.summer, GATE),
  ], f);
  return (
    <AbsoluteFill style={{ opacity: enter }}>
      <div style={{ position: 'absolute', inset: 0, filter: toUI > 0 ? `blur(${toUI * 12}px)` : undefined, transform: `scale(${1 + 0.06 * toUI})`, opacity: 1 - ease(f, [TL.summer - 16, TL.summer], [0, 1]) }}>
        <MapSeq name="route" f={Math.min(f, TL.navi + 204)} style={{ filter: 'saturate(1.15) contrast(1.1)' }} />
        <AbsoluteFill style={{ background: 'linear-gradient(180deg, rgba(255,226,236,0.9) 0%, rgba(255,232,240,0.4) 14%, rgba(255,236,242,0) 30%)' }} />
        <LightLeak k={0.6} x={300} y={-80} r={1100} color="255,206,160" />
        {/* 出発（駅）と、ルートの先端の光 */}
        {sta && f < TL.naviUI && (
          <div style={{ position: 'absolute', left: sta[0], top: sta[1], transform: 'translate(-50%, -50%)', zIndex: 30 }}>
            <div style={{ padding: '8px 16px', borderRadius: 12, background: '#0e2030', color: '#fff', fontSize: 22, fontWeight: 800, whiteSpace: 'nowrap', boxShadow: '0 10px 24px -10px rgba(0,0,0,0.5)' }}>大岡山駅</div>
          </div>
        )}
        {head?.h && head.s > 0.01 && head.s < 0.995 && (
          <div style={{ position: 'absolute', left: head.h[0] - 40, top: head.h[1] - 40, width: 80, height: 80, borderRadius: 40, zIndex: 31, background: 'radial-gradient(circle, rgba(255,255,255,1) 0%, rgba(120,200,255,0.9) 18%, rgba(26,142,240,0.35) 42%, rgba(26,142,240,0) 70%)' }} />
        )}
        <MapTag seq="route" f={f} label="西9号館" title="西9号館" en="徒歩 約4分 · 276m" d={TL.navi + 168} until={TL.naviUI + 30} big accent="#e0628f" lift={34} />
        {done > 0 && (() => {
          const p = labelPos('route', f, '西9号館');
          return p ? <Sparkle x={p[0]} y={p[1] - 40} k={(f - TL.navi - 176) * 1.2} s={2.2} /> : null;
        })()}
        <Vignette k={0.22} color="40,20,30" />
      </div>
      <AbsoluteFill style={{ background: 'rgba(255,246,249,0.45)', opacity: toUI * (1 - ease(f, [TL.summer - 16, TL.summer], [0, 1])) }} />

      <div style={{ position: 'absolute', left: 150, top: 150, zIndex: 60, opacity: 1 - toUI }}>
        <Caps text="3D Campus Navigation" f={f} d={TL.navi + 14} exitAt={TL.navi + 156} color="#a0536f" line />
        <div style={{ marginTop: 14 }}>
          <Rise segs={[{ t: 'もう、' }, { t: '迷わない', grad: [[212, 80, 122], [236, 132, 160]] }, { t: '。' }]} f={f} d={TL.navi + 20} exitAt={TL.navi + 158} size={118} weight={900} color="#3a1f2b" glow="0 4px 30px rgba(255,255,255,0.9)" />
        </div>
        <div style={{ marginTop: 10 }}>
          <Rise segs="教室のある建物まで、3Dで道案内。" f={f} d={TL.navi + 40} exitAt={TL.navi + 158} size={36} weight={600} color="#5b3a48" glow="0 2px 20px rgba(255,255,255,0.9)" stagger={0.8} blur={8} />
        </div>
      </div>

      <PhoneAt pose={pose}>
        <FilmFlow f={f} screens={NAVI_FLOW} />
      </PhoneAt>
      <Feature f={f} d={TL.naviUI + 20} exitAt={TL.summer - 24} en="Navigation" x={150} y={260} w={900} size={88}
        lines={['教室をさがして、', 'そのまま案内。']} body={'残りの距離も、到着時刻も。\n歩きはじめたら、あとはついていくだけ。'} ink={SP.ink} sub={SP.sub} />
    </AbsoluteFill>
  );
};

// ── 夏 ──────────────────────────────────────────────
// 端末の横に大きく出す通知（端末の上の通知と同じ文言）
const BigNote = ({ f, at, until }) => {
  if (f < at - 1 || f > until + 12) return null;
  const p = ease(f, [at, at + 14], [0, 1], EASE_OUT);
  const out = ease(f, [until, until + 10], [0, 1], EASE_IN);
  return (
    <div style={{
      position: 'absolute', left: 1010, top: 360, width: 780, zIndex: 70, opacity: p * (1 - out),
      transform: `translateY(${(1 - p) * -60 - out * 30}px) scale(${0.94 + 0.06 * p})`, filter: out > 0 ? `blur(${out * 8}px)` : undefined,
    }}>
      <div style={{ display: 'flex', gap: 22, padding: '26px 30px', borderRadius: 34, background: 'rgba(255,255,255,0.96)', boxShadow: '0 40px 80px -30px rgba(20,40,26,0.45), 0 0 0 1px rgba(20,40,26,0.06)' }}>
        <Img maxRetries={8} src={staticFile('promo/icon.png')} style={{ width: 76, height: 76, borderRadius: 18, flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 20, color: '#6b7f72', fontWeight: 600 }}>
            <span>ScienceTokyo App</span><span>今</span>
          </div>
          <div style={{ fontSize: 34, fontWeight: 800, color: '#14281a', marginTop: 4 }}>課題の締切</div>
          <div style={{ fontSize: 28, fontWeight: 500, color: '#2b3d31', marginTop: 4 }}>「実験レポート第2回」の締切が明日です</div>
        </div>
      </div>
    </div>
  );
};
const SU = SEASONS.summer;
const summerPose = (f) => poseAt([
  sameAs(TL.summer, GATE),
  sameAs(TL.asgn - 4, GATE),
  { f: TL.asgn + 22, x: 580, y: 560, s: 1.04, ry: 10 },
  { f: TL.free - 22, x: 580, y: 560, s: 1.04, ry: 8 },
  { f: TL.free + 6, x: 1380, y: 560, s: 1.04, ry: -10 },
  { f: TL.social - 22, x: 1380, y: 560, s: 1.04, ry: -8 },
  { f: TL.social + 6, x: 1180, y: 560, s: 1.0, ry: -12 },
  { f: TL.autumn - 26, x: 1180, y: 560, s: 1.0, ry: -10 },
  sameAs(TL.autumn, GATE),
], f);
const friendsPose = (f) => poseAt([
  { f: TL.social - 6, x: 1900, y: 600, s: 0.86, ry: -24, o: 0 },
  { f: TL.social + 16, x: 1600, y: 600, s: 0.86, ry: -22, o: 1 },
  { f: TL.autumn - 26, x: 1600, y: 600, s: 0.86, ry: -20, o: 1 },
  { f: TL.autumn - 6, x: 1900, y: 600, s: 0.86, ry: -24, o: 0 },
], f);

export const Summer = ({ f }) => {
  const pose = summerPose(f);
  return (
    <AbsoluteFill>
      <SeasonGate f={f} at={TL.summer} until={TL.asgn - 14} season={SU} kind="leaf" />
      <LightLeak k={0.5} x={1700} y={-100} r={1000} color="255,240,190" />
      <Drift f={f} kind="mote" n={26} seed={12} k={0.6} fall={-0.5} wind={0.4} size={[4, 10]} blur={false} />
      <PhoneAt pose={friendsPose(f)}>
        <FilmFlow f={f} screens={FRIENDS_FLOW} />
      </PhoneAt>
      <PhoneAt pose={pose}>
        <FilmFlow f={f} screens={SUMMER_FLOW} slide={14} />
      </PhoneAt>
      <ThemeTag f={f} at={TL.summer + 52} until={TL.asgn - 10} text="テーマ：新緑" color={SU.accent} />

      {/* 課題 */}
      <BigNote f={f} at={TL.asgn + 8} until={TL.asgn + 40} />
      <Feature f={f} d={TL.asgn + 48} exitAt={TL.free - 26} en="Assignments" x={1010} y={230} w={860} size={88}
        lines={['締切を、', [{ t: 'もう逃さない', grad: [[46, 139, 87], [92, 178, 96]] }, { t: '。' }]]}
        body={'締切が近づくと通知でお知らせ。\nレポートの提出も、アプリからそのまま。'} ink={SU.ink} sub={SU.sub} />

      {/* 空き教室 */}
      <Feature f={f} d={TL.free + 14} exitAt={TL.social - 24} en="Free Rooms" x={150} y={210} w={700} size={80}
        lines={['空き教室も、', 'すぐ見つかる。']} body={'いま空いている教室と、\nいつまで空いているか。'} ink={SU.ink} sub={SU.sub} />

      {/* DM・友達 */}
      <Feature f={f} d={TL.social + 14} exitAt={TL.autumn - 24} en="Messages" x={150} y={250} w={700} size={84}
        lines={['仲間とも、', 'すぐつながる。']} body="DM、友達、サークルも。" ink={SU.ink} sub={SU.sub} />
    </AbsoluteFill>
  );
};

// ── 秋（工大祭の夜）───────────────────────────────────
const AU = SEASONS.autumn;
const LANTERNS = ['r0', 'r1', 'r2', 'r3', 'r4', 'r5', 'r6', 'r7', 'r8', 'lawnN', 'lawnC', 'lawnS', 'mainF', 'taki', 'lib'];

const autumnPose = (f) => poseAt([
  sameAs(TL.autumn, GATE),
  sameAs(TL.fest - 6, GATE),
  { f: TL.fest + 20, x: 1400, y: 1700, s: 0.9, rx: 26 },
  { f: TL.fest + 110, x: 1400, y: 1700, s: 0.9, rx: 26 },
  { f: TL.fest + 140, x: 620, y: 560, s: 1.04, ry: 10 },
  { f: TL.winter - 30, x: 620, y: 560, s: 1.04, ry: 8 },
], f);

export const Autumn = ({ f }) => {
  const pose = autumnPose(f);
  return (
    <AbsoluteFill>
      <SeasonGate f={f} at={TL.autumn} until={TL.fest - 12} season={AU} kind="maple" dark />

      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 210, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, zIndex: 60 }}>
        <Caps text="Kodaisai — Campus Festival" f={f} d={TL.fest + 16} exitAt={TL.fest + 104} color="#ffc68f" align="center" />
        <Rise segs={[{ t: '工大祭も、' }, { t: 'アプリで', color: '#ffb36b' }, { t: '。' }]} f={f} d={TL.fest + 22} exitAt={TL.fest + 106} size={112} weight={900} color="#fff3e6" glow="0 6px 40px rgba(255,140,60,0.45)" />
      </div>

      <PhoneAt pose={pose} shadow={0.9}>
        <FilmFlow f={f} screens={AUTUMN_FLOW} slide={14} />
      </PhoneAt>
      <ThemeTag f={f} at={TL.autumn + 52} until={TL.fest - 10} text="テーマ：紅葉" color={AU.accent} />
      <Feature f={f} d={TL.fest + 138} exitAt={TL.winter - 24} en="Coupons" x={1010} y={190} w={860} size={80}
        lines={['出店をさがして、', [{ t: '学生限定クーポン', color: '#ffb36b' }, { t: 'も。' }]]}
        body="出店の場所も、メニューも。" ink={AU.ink} sub={AU.sub} />
      <div style={{ position: 'absolute', right: 70, bottom: 170, fontSize: 18, color: 'rgba(255,230,210,0.6)', opacity: ease(f, [TL.fest + 150, TL.fest + 166], [0, 1]) * (1 - ease(f, [TL.winter - 20, TL.winter - 8], [0, 1])), zIndex: 60 }}>
        ※ 画面の出店はサンプルです
      </div>
    </AbsoluteFill>
  );
};

// ── 冬 ──────────────────────────────────────────────
const WI = SEASONS.winter;
const winterPose = (f) => poseAt([
  { f: TL.winter, x: 620, y: 560, s: 1.04, ry: 8 },
  sameAs(TL.winter + 40, GATE),
  sameAs(TL.exams - 4, GATE),
  { f: TL.exams + 22, x: 600, y: 560, s: 1.04, ry: 10 },
  { f: TL.you - 30, x: 600, y: 560, s: 1.04, ry: 8 },
  { f: TL.you, x: 960, y: 560, s: 1.0, ry: 0 },
], f);
const GPA_CARDS = [
  { t: '2.65 GPA', to: { x: 1010, y: 520, s: 1.8 } },
  { t: '111.5 GPT', to: { x: 1250, y: 520, s: 1.8 } },
  { t: '42 修得単位', to: { x: 1490, y: 520, s: 1.8 } },
  { t: '成績分布', to: { x: 1010, y: 730, s: 1.5 } },
];

export const Winter = ({ f }) => {
  const pose = winterPose(f);
  return (
    <AbsoluteFill>
      <Drift f={f} kind="snow" n={90} seed={21} k={ease(f, [TL.winter - 10, TL.winter + 10], [0, 1]) * (1 - ease(f, [TL.you - 20, TL.you], [0, 1]))} fall={1.4} wind={0.35} size={[4, 14]} />
      <SeasonGate f={f} at={TL.winter} until={TL.exams - 12} season={WI} />
      {/* 扉では端末が左から右へ移るので、その間は大きな「冬」より手前に描く */}
      <div style={{ position: 'absolute', inset: 0, zIndex: f < TL.exams ? 61 : undefined }}>
        <PhoneAt pose={pose}>
          <FilmFlow f={f} screens={WINTER_FLOW} slide={14} />
        </PhoneAt>
      </div>
      <ThemeTag f={f} at={TL.winter + 66} until={TL.exams - 10} text="テーマ：雪" color={WI.accent} />

      <Feature f={f} d={TL.exams + 22} exitAt={TL.exams + 160} en="Grades" x={1010} y={210} w={860} size={84}
        lines={['成績も、GPAも、', [{ t: 'ここで', grad: [[74, 128, 180], [120, 170, 214]] }, { t: '。' }]]}
        body="1年の終わりに、ふりかえる。" ink={WI.ink} sub={WI.sub} />
      {GPA_CARDS.map((c, i) => (
        <LiftCard key={c.t} f={f} name="wi_gpa" r={rectOf('wi_gpa', c.t)} pose={winterPose(TL.exams + 96)} to={c.to} at={TL.exams + 96 + i * 8} until={TL.exams + 158} />
      ))}
      <Feature f={f} d={TL.exams + 176} exitAt={TL.you - 24} en="Academic Calendar" x={1010} y={300} w={860} size={84}
        lines={['そして、', '次の1年へ。']} body="学年暦も、アプリの中に。" ink={WI.ink} sub={WI.sub} />
    </AbsoluteFill>
  );
};

// ── 背景の層（端末の場面より下に描く）。秋の夜の地図 → 冬の地図は重ねて切り替える ─────────
// 工大祭の夜の3Dキャンパス：提灯の光と玉ボケ。冬の地図が出きってから消える
export const NightMap = ({ f }) => {
  const night = ease(f, [TL.fest - 8, TL.fest + 18], [0, 1]) * (1 - ease(f, [TL.winter, TL.winter + 2], [0, 1]));
  const dim = ease(f, [TL.fest + 112, TL.fest + 140], [0, 1]);
  return (
    <AbsoluteFill>
      {/* 工大祭の夜の3Dキャンパス：提灯の光と玉ボケ */}
      {night > 0 && (
        <AbsoluteFill style={{ opacity: night }}>
          <div style={{ position: 'absolute', inset: 0, filter: `blur(${dim * 6}px)`, opacity: 1 - 0.45 * dim }}>
            <MapSeq name="night" f={Math.min(f, TL.fest + 206)} style={{ filter: 'brightness(1.75) contrast(1.15) saturate(1.2) sepia(0.28)' }} />
            <AbsoluteFill style={{ background: 'linear-gradient(180deg, rgba(40,16,30,0.85) 0%, rgba(40,16,30,0.25) 22%, rgba(40,16,30,0) 40%)' }} />
            {LANTERNS.map((id, i) => {
              const p = pointPos('night', Math.min(f, TL.fest + 206), id);
              if (!p) return null;
              const tw = 0.75 + 0.25 * Math.sin(f / 7 + i * 1.9);
              const on = ease(f, [TL.fest + 10 + i * 3, TL.fest + 22 + i * 3], [0, 1]);
              return (
                <div key={id} style={{ position: 'absolute', left: p[0] - 90, top: p[1] - 110, width: 180, height: 180, borderRadius: 90, opacity: on * tw, mixBlendMode: 'screen', background: 'radial-gradient(circle, rgba(255,214,150,1) 0%, rgba(255,150,70,0.65) 14%, rgba(255,120,60,0.22) 38%, rgba(255,120,60,0) 70%)' }} />
              );
            })}
            <Drift f={f} kind="mote" n={40} seed={77} k={0.9} colors={['#ffc070', '#ff9a5a', '#ffe0a0']} fall={-0.8} wind={0.3} size={[4, 12]} blur={false} />
          </div>
          <Vignette k={0.6} color="10,4,8" />
        </AbsoluteFill>
      )}
    </AbsoluteFill>
  );
};

// 冬：雪のキャンパス（夜の地図の上に、扉の前から重ねていく）
export const WinterMap = ({ f }) => {
  const map = ease(f, [TL.winter - 16, TL.winter + 2], [0, 1]) * (1 - ease(f, [TL.exams - 16, TL.exams + 10], [0, 1]));
  return (
    <AbsoluteFill>
      {map > 0 && (
        <AbsoluteFill style={{ opacity: map }}>
          <MapSeq name="winter" f={f} style={{ filter: 'saturate(0.7) contrast(1.08) brightness(1.04) hue-rotate(-8deg)' }} />
          <AbsoluteFill style={{ background: 'linear-gradient(180deg, rgba(225,236,247,0.95) 0%, rgba(230,240,248,0.5) 16%, rgba(235,242,250,0) 34%)' }} />
          <AbsoluteFill style={{ background: 'rgba(120,150,190,0.12)', mixBlendMode: 'multiply' }} />
        </AbsoluteFill>
      )}
    </AbsoluteFill>
  );
};
