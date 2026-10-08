import React from 'react';
import { AbsoluteFill, Img, staticFile } from 'remotion';
import { BEAT, EASE_IN, EASE_IN_OUT, EASE_OUT, TL, ease, mix, sp } from '../theme.js';
import { FilmScreen, RecScreen, recMeta } from '../Device.jsx';
import { Drift, LightLeak, Sparkle } from '../fx.jsx';
import { Caps, Rise } from '../type.jsx';
import { SCREEN_H, SCREEN_W } from '../../promo/Phone.jsx';
import { Burst, IconAssembly } from '../../promo/scenes/Reveal.jsx';
import { Icon } from '../../promo/icons.jsx';

// 4800–5184：機能の壁。傾いた大きな壁に実画面が並び、拍ごとに光の波が走る。言葉を拍ごとに重ねて「大学生活の、ぜんぶ。」
// 操作動画がある機能の画面は、壁の中でもその動画が流れ続ける（縮小版。最後まで行ったら頭から）
// 5184–：最後の4小節。また春の空。ツバメが横切り、アイコンとURL。曲の最後の一打（TL.hit）で締める。

const WALL = [
  'wall_home', 'sp_tt', 'su_tasks', 'su_free', 'wall_attendance', 'su_dm_chat', 'wall_calendar', 'au_fest_grid', 'wi_gpa',
  'sp_navi_route', 'wall_circles', 'wall_reviews', 'wall_gym', 'au_booth', 'wall_notif', 'wall_pomo', 'sp_events', 'wall_pocket',
  'th_dark', 'wall_friends', 'wi_acadcal', 'su_asgn', 'wall_library', 'th_koyo', 'wall_moreMenu', 'sp_navi_guide', 'wall_profile',
  'wall_grades', 'th_titech', 'au_booth_coupon', 'su_attendance', 'wall_events', 'su_free_modal', 'th_sakura', 'wall_pdftools', 'wall_qr',
  'wall_acadCal', 'th_lavender', 'wall_timetable', 'sp_navi_map', 'wall_tasks', 'th_mint', 'au_home', 'wall_freshman', 'th_scitokyo',
];
// 壁の画面 → 流す操作動画（ほかは静止画のまま）
const LIVE = {
  wall_home: 'rec_home', sp_tt: 'rec_tt', su_free: 'rec_free', su_dm_chat: 'rec_dm', au_fest_grid: 'rec_fest', wi_gpa: 'rec_grades',
  sp_navi_route: 'rec_navi', th_dark: 'rec_themes', wall_friends: 'rec_friends', wi_acadcal: 'rec_acad', su_asgn: 'rec_asgn',
  th_koyo: 'rec_gate_autumn', sp_events: 'rec_events', th_sakura: 'rec_gate_spring', th_mint: 'rec_langs', th_titech: 'rec_gate_summer',
  th_scitokyo: 'rec_gate_winter',
};
const COLS = 9;
const S = 0.44; // 画面の縮尺
const GAP = 34;
const CW = SCREEN_W * S;
const CH = SCREEN_H * S;
const WORDS = [
  [TL.all, '授業も。'], [TL.all + BEAT * 2, '課題も。'], [TL.all + BEAT * 4, 'キャンパスも。'], [TL.all + BEAT * 6, 'まつりも。'],
];

export const All = ({ f }) => {
  const g = f - TL.all;
  const enter = ease(g, [-10, 20], [0, 1], EASE_OUT);
  const rush = ease(f, [TL.outro - 40, TL.outro], [0, 1], EASE_IN);
  const rows = Math.ceil(WALL.length / COLS);
  const W = COLS * (CW + GAP);
  const Hh = rows * (CH + GAP);
  // カメラ：壁の上をゆっくり滑り、最後に壁へ飛び込む
  const ty = mix(260, -140, ease(g, [0, 384], [0, 1], EASE_IN_OUT));
  const rx = mix(56, 40, ease(g, [0, 300], [0, 1], EASE_IN_OUT)) - 30 * rush;
  const sc = mix(1.08, 1.0, ease(g, [0, 300], [0, 1])) * (1 + 2.6 * rush * rush);
  return (
    <AbsoluteFill style={{ opacity: enter * (1 - ease(f, [TL.outro - 10, TL.outro + 4], [0, 1])) }}>
      {/* 夜のオーロラ */}
      {[['26,156,240', 380, 380, 760], ['40,200,104', 1560, 330, 700], ['242,210,28', 980, 980, 640]].map(([c, x, y, r], i) => (
        <div key={i} style={{ position: 'absolute', left: x + 160 * Math.sin(f / 50 + i * 2) - r, top: y + 90 * Math.cos(f / 60 + i) - r, width: r * 2, height: r * 2, borderRadius: '50%', background: `radial-gradient(circle, rgba(${c},0.26) 0%, rgba(${c},0) 66%)` }} />
      ))}
      <div style={{ position: 'absolute', inset: 0, perspective: 1600, perspectiveOrigin: '960px 300px' }}>
        <div style={{
          position: 'absolute', left: 960 - W / 2, top: 540 - Hh / 2 + ty, width: W, height: Hh, transformStyle: 'preserve-3d',
          transform: `rotateX(${rx}deg) rotateZ(${-14 + 6 * ease(g, [0, 384], [0, 1])}deg) scale(${sc})`, transformOrigin: '50% 50%',
          filter: rush > 0 ? `blur(${rush * 8}px)` : undefined,
        }}>
          {WALL.map((name, i) => {
            const c = i % COLS;
            const r = Math.floor(i / COLS);
            // 拍ごとに、左から右へ光の波が通る
            const wave = Math.max(0, Math.cos(((g / BEAT) * 2 - c * 0.35 - r * 0.2) % (Math.PI * 2)));
            const pop = sp(g, (c + r) * 1.5, { damping: 16, stiffness: 120 });
            return (
              <div key={i} style={{
                position: 'absolute', left: c * (CW + GAP), top: r * (CH + GAP), width: CW, height: CH, borderRadius: 52 * S + 3, overflow: 'hidden',
                boxShadow: `0 30px 60px -20px rgba(0,0,0,0.7), 0 0 0 2px rgba(255,255,255,${0.1 + 0.3 * wave})`,
                filter: `brightness(${0.62 + 0.38 * wave})`, opacity: Math.min(1, pop * 1.4), transform: `translateZ(${(1 - pop) * -300}px)`,
              }}>
                <div style={{ width: SCREEN_W, height: SCREEN_H, transform: `scale(${S})`, transformOrigin: '0 0', position: 'relative' }}>
                  {LIVE[name]
                    ? <RecScreen name={LIVE[name]} frame={(g + i * 23) % recMeta(LIVE[name]).frames} thumb />
                    : <FilmScreen name={name} thumb />}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <AbsoluteFill style={{ background: 'radial-gradient(ellipse 60% 42% at 50% 46%, rgba(5,8,22,0.82) 0%, rgba(5,8,22,0.5) 55%, rgba(5,8,22,0) 100%)', opacity: 1 - rush }} />

      {/* 言葉：1つずつ → 大学生活の、ぜんぶ。 */}
      <div style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
        {WORDS.map(([at, w], i) => (
          <div key={w} style={{ position: 'absolute' }}>
            <Rise segs={w} f={f} d={at} exitAt={(WORDS[i + 1]?.[0] ?? TL.all + BEAT * 8) - 8} size={120} weight={900} color="#ffffff" stagger={1} dur={12} />
          </div>
        ))}
        <div style={{ position: 'absolute', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
          <Rise segs="大学生活の、" f={f} d={TL.all + BEAT * 8} exitAt={TL.outro - 34} size={96} weight={800} color="#ffffff" stagger={2} />
          <Rise segs={[{ t: 'ぜんぶ', grad: true }, { t: '。' }]} f={f} d={TL.all + BEAT * 10} exitAt={TL.outro - 30} size={190} weight={900} color="#ffffff" stagger={4} dur={20} />
          <div style={{ marginTop: 18 }}>
            <Caps text="30+ features, one app" f={f} d={TL.all + BEAT * 14} exitAt={TL.outro - 30} color="#9fb3cc" align="center" />
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};

// ── エンドカード ─────────────────────────────────────
const ICON = { cx: 960, cy: 300, size: 230 };

const FlyBy = ({ e }) => {
  const u = ease(e, [2, 64], [0, 1], (x) => x);
  if (u <= 0 || u >= 1) return null;
  const pt = (t) => [mix(-220, 2160, t), 720 - 760 * t - 180 * Math.sin(t * Math.PI)];
  return (
    <>
      {[5, 4, 3, 2, 1, 0].map((j) => {
        const t = Math.max(0, u - j * 0.018);
        const [x, y] = pt(t);
        const [x2, y2] = pt(Math.min(1, t + 0.01));
        const ang = (Math.atan2(y2 - y, x2 - x) * 180) / Math.PI + 38;
        return (
          <Img key={j} maxRetries={8} src={staticFile('promo/swallow.png')} style={{
            position: 'absolute', left: x - 70, top: y - 66, width: 140, height: 132,
            transform: `rotate(${ang}deg) scaleY(${1 + 0.12 * Math.sin(e * 1.3)})`, opacity: j === 0 ? 0.9 : 0.16 * (1 - j / 6),
          }} />
        );
      })}
    </>
  );
};

export const Outro = ({ f }) => {
  const e = f - TL.outro;
  const hit = f >= TL.hit ? Math.exp(-(f - TL.hit) / 7) : 0; // 最後の一打
  const enter = ease(e, [-6, 14], [0, 1]);
  const urlP = sp(e, 30, { damping: 14, stiffness: 160 });
  const qrP = sp(e, 44, { damping: 15, stiffness: 150 });
  return (
    <AbsoluteFill style={{ opacity: enter }}>
      <LightLeak k={0.8} x={1500} y={160} r={1000} color="255,214,170" />
      <Drift f={f} kind="petal" n={36} seed={99} k={ease(e, [0, 30], [0, 0.85])} fall={1.4} wind={1.2} size={[10, 26]} />
      <FlyBy e={e} />
      <Burst k={e - 2} cx={ICON.cx} cy={ICON.cy} />
      <Burst k={f - TL.hit} cx={ICON.cx} cy={ICON.cy} />
      {[[520, 240, 0], [1400, 210, 6], [1600, 520, 12], [360, 600, 18]].map(([x, y, d], i) => (
        <Sparkle key={i} x={x} y={y} k={(f - TL.hit) - d} s={1.4} />
      ))}
      <div style={{ position: 'absolute', inset: 0, transform: `scale(${1 + 0.05 * hit})`, transformOrigin: `${ICON.cx}px ${ICON.cy}px` }}>
        <IconAssembly r={e} size={ICON.size} cx={ICON.cx} cy={ICON.cy} flight={false} />
      </div>
      <div style={{ position: 'absolute', top: 450, left: 0, right: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
        <Rise segs={[{ t: 'ScienceTokyo ' }, { t: 'App', grad: true }]} f={e} d={8} size={108} weight={900} color="#0e2030" stagger={1} />
        <Rise segs="大学生活を、ひとつに。" f={e} d={18} size={44} weight={800} color="#1b2b3c" stagger={1.5} blur={10} />
      </div>
      <div style={{ position: 'absolute', top: 720, left: 0, right: 0, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 34 }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 16, padding: '14px 18px 14px 34px', borderRadius: 50, background: '#fff',
          boxShadow: `0 26px 50px -26px rgba(14,32,48,0.45), 0 0 0 1px rgba(14,32,48,0.06), 0 0 0 ${10 * hit}px rgba(40,200,104,${0.25 * hit})`,
          opacity: ease(e, [30, 36], [0, 1]), transform: `translateY(${(1 - urlP) * 24}px) scale(${(0.85 + 0.15 * urlP) * (1 + 0.04 * hit)})`,
        }}>
          <span style={{ fontSize: 36, fontWeight: 800, color: '#0e2030', letterSpacing: '0.01em' }}>sciencetokyo.app</span>
          <div style={{ width: 52, height: 52, borderRadius: 26, background: '#28c868', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="arr" size={26} color="#fff" sw={2.6} />
          </div>
        </div>
        <div style={{ padding: 10, borderRadius: 16, background: '#fff', boxShadow: '0 20px 40px -24px rgba(14,32,48,0.5)', opacity: Math.min(1, qrP * 1.4), transform: `scale(${0.8 + 0.2 * qrP})` }}>
          <Img maxRetries={8} src={staticFile('film/qr.png')} style={{ width: 112, height: 112, display: 'block' }} />
        </div>
      </div>
      <div style={{ position: 'absolute', top: 870, left: 0, right: 0, textAlign: 'center', fontSize: 26, fontWeight: 700, color: '#3a5870', opacity: ease(e, [50, 62], [0, 1]) }}>
        スマホでも、PCでも。
      </div>
      <div style={{ position: 'absolute', top: 980, left: 0, right: 0, textAlign: 'center', fontSize: 20, color: '#7898b0', opacity: ease(e, [60, 72], [0, 1]) }}>
        ※ 東京科学大学の学生アカウントが必要です
      </div>
    </AbsoluteFill>
  );
};
