import React from 'react';
import { AbsoluteFill, Img, staticFile, useCurrentFrame } from 'remotion';
import '../promo/fonts.js';
import { BGF, EASE_IN, EASE_IN_OUT, EASE_OUT, FONT, SONG_F, SW, TF, ease, mix, sp } from './theme.js';
import { Background, Caption, Lift, NewBadge, Pill, SongTrack, Sparkle } from '../story/parts.jsx';
import { CharPop } from '../promo/text.jsx';
import { Icon } from '../promo/icons.jsx';
import { Burst, IconAssembly } from '../promo/scenes/Reveal.jsx';
import { Phone3D, RealScreen, ScreenFlow, STATUS_H } from '../promo2/Device.jsx';
import { Banner, CouponUsed, Tap } from '../promo2/overlays.jsx';
import RECTS from './rects.json';

// 工大祭に出店する団体むけ「出店を宣伝しませんか？」の縦動画（約23.6秒）。
// アプリの「工大祭 出店」ページで、出店ページの掲載・学生限定クーポン・申請（メンバー用QR・下書きの自動保存）ができることを伝える。
// 画面はデモモードで撮った実画面（capture/capture_fest.mjs）。出店の中身はデモのサンプル。

const GOLD = '#ffc46b';
const g = (t) => ({ t, color: GOLD });

// 夜空のきらめき（工大祭のテーマ「Sparkle」）
const SPARKS = [
  [120, 300, 0], [960, 260, 7], [860, 760, 14], [140, 980, 21], [1000, 1180, 28], [70, 1460, 35],
  [900, 1640, 42], [300, 1720, 49], [620, 200, 11], [480, 1560, 25], [40, 640, 39], [1030, 520, 53],
];
const Sparkles = ({ f, strength = 1 }) => (
  <AbsoluteFill style={{ opacity: strength }}>
    {SPARKS.map(([x, y, d], i) => <Sparkle key={i} x={x} y={y} k={(f - d + 600) % 60} s={i % 3 === 0 ? 1.3 : 0.85} />)}
  </AbsoluteFill>
);

// 画面の中の要素を囲んで光らせる（座標は撮影時に記録した CSS px）
const Ring = ({ f, at, x, y, w, h, color = '#28c868' }) => {
  const k = f - at;
  if (k < 0) return null;
  const p = ease(k, [0, 6], [0, 1], EASE_OUT);
  return (
    <div style={{
      position: 'absolute', left: x - 6, top: y - 6, width: w + 12, height: h + 12, borderRadius: 12, zIndex: 40, pointerEvents: 'none',
      boxShadow: `0 0 0 ${2.5 + 1.5 * Math.sin(k / 4)}px ${color}, 0 0 22px ${color}88`, opacity: p,
    }} />
  );
};

// 冒頭の背景に漂う、出店のポスター（デモのサンプル画像を一覧から撮ったもの）
const POSTERS = [
  { i: 0, x: 70, y: 1230, r: -8, d: 2 },
  { i: 3, x: 650, y: 470, r: -6, d: 6 },
  { i: 1, x: 640, y: 1330, r: 7, d: 10 },
  { i: 2, x: 60, y: 430, r: 6, d: 14 },
  { i: 4, x: 360, y: 1560, r: 4, d: 18 },
];
const Posters = ({ f }) => {
  if (f > TF.drop + 4) return null;
  const out = ease(f, [TF.drop - 8, TF.drop], [0, 1], EASE_IN);
  return (
    <AbsoluteFill>
      {POSTERS.map(({ i, x, y, r, d }) => {
        const p = sp(f, d, { damping: 16, stiffness: 90 });
        const drift = -f * 0.9;
        return (
          <div key={i} style={{
            position: 'absolute', left: x, top: y + drift + (1 - p) * 120, width: 360, height: 266, borderRadius: 22, overflow: 'hidden',
            opacity: Math.min(1, p) * 0.62 * (1 - out), transform: `rotate(${r + 3 * Math.sin((f + d * 9) / 40)}deg) scale(${0.9 + 0.1 * p})`,
            boxShadow: '0 30px 60px -20px rgba(0,0,0,0.6)',
          }}>
            <Img src={staticFile(`fest/posters/poster_${i}.png`)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          </div>
        );
      })}
    </AbsoluteFill>
  );
};

// ── 0–96 問いかけ（曲はベースの無い2小節）──
const Hook = ({ f }) => {
  if (f >= TF.drop + 6) return null;
  const outA = ease(f, [TF.ask - 8, TF.ask], [0, 1], EASE_IN);
  const outB = ease(f, [TF.drop - 4, TF.drop + 2], [0, 1], EASE_IN);
  return (
    <AbsoluteFill>
      <Pill g={f} d={4} exitAt={TF.drop - 8} top={250} bg="rgba(255,255,255,0.12)" color="#ffffff">
        <span style={{ display: 'inline-flex', width: 46, height: 46, borderRadius: 23, background: GOLD, alignItems: 'center', justifyContent: 'center', color: '#3a1d4f', fontSize: 26 }}>✦</span>
        工大祭2026「Sparkle」・10/10(土)・11(日)
      </Pill>
      <div style={{ position: 'absolute', left: 0, right: 0, top: 760, display: 'flex', flexDirection: 'column', alignItems: 'center', opacity: 1 - outA, transform: `translateY(${-outA * 50}px)` }}>
        <CharPop segs="工大祭に出店する" f={f} d={2} stagger={1.7} size={100} color="#ffffff" />
        <CharPop segs="みなさんへ。" f={f} d={14} stagger={2} size={120} color="#ffffff" />
      </div>
      {f >= TF.ask - 2 && (
        <div style={{ position: 'absolute', left: 0, right: 0, top: 740, display: 'flex', flexDirection: 'column', alignItems: 'center', opacity: 1 - outB, transform: `scale(${1 + 0.15 * outB})` }}>
          <CharPop segs="その出店、アプリで" f={f - TF.ask} d={0} stagger={1.5} size={96} color="#ffffff" />
          <CharPop segs={[g('宣伝'), { t: 'しませんか？' }]} f={f - TF.ask} d={12} stagger={2} size={116} color="#ffffff" />
        </div>
      )}
    </AbsoluteFill>
  );
};

// ── 96–528 スマホ1台。中身は ScreenFlow で切り替える ──
const MINE = RECTS.fx_mine;
const FORM = RECTS.fx_form;
const MINE_SCROLL = 340; // 出店ページを下までめくったところ（「マップで見る」まで見える）
const COUNT_SCROLL = 295; // クーポン欄が画面のまんなかに来るところ
const FORM_SCROLL = 1630; // 申請フォームのいちばん下
const PhoneF = ({ f }) => {
  if (f < TF.drop - 4 || f > TF.end + 14) return null;
  const enter = sp(f, TF.drop - 2, { damping: 14, stiffness: 120, mass: 0.9 });
  const exit = ease(f, [TF.end - 8, TF.end + 12], [0, 1], EASE_IN);
  const beats = [TF.page, TF.map, TF.coupon, TF.count, TF.form, TF.members, TF.listed];
  const bump = beats.reduce((m, b) => (f >= b && f < b + 16 ? Math.max(m, Math.exp(-(f - b) / 4) * Math.sin(((f - b) / 16) * Math.PI)) : m), 0);
  const scale = 1.17 * (1 + 0.025 * bump);
  const y = mix(2350, 1175, enter) + exit * 1400 + 7 * Math.sin(f / 28);
  const ry = mix(-16, 0, enter) + 4 * Math.sin(f / 46);
  const rx = mix(14, 2, enter) + 2 * Math.sin(f / 38);
  const [cx, cy, cw, ch] = MINE.used;
  const [ax, ay, aw, ah] = FORM.autosave;
  const shots = [
    { at: TF.drop, name: 'fx_top', scroll: (k) => ease(k, [TF.drop + 16, TF.page - 6], [0, 430], EASE_IN_OUT) },
    { at: TF.page + 6, name: 'fx_mine', scroll: (k) => ease(k, [TF.page + 22, TF.map - 16], [0, MINE_SCROLL], EASE_IN_OUT) },
    { at: TF.map + 4, name: 'fx_map' },
    { at: TF.coupon + 4, el: <RealScreen name="booth_coupon"><CouponUsed t={f - (TF.coupon + 22)} /></RealScreen> },
    {
      at: TF.count + 4,
      el: (
        <RealScreen name="fx_mine" scroll={COUNT_SCROLL}>
          <Ring f={f} at={TF.count + 10} x={cx - 6} y={STATUS_H + cy - COUNT_SCROLL - 7} w={cw + 12} h={ch + 14} />
        </RealScreen>
      ),
    },
    {
      at: TF.form + 4,
      el: (
        <RealScreen name="fx_form" scroll={ease(f, [TF.form + 8, TF.members - 10], [0, FORM_SCROLL], EASE_IN_OUT)}>
          <Ring f={f} at={TF.members - 12} x={ax} y={STATUS_H + ay - FORM_SCROLL - 4} w={aw} h={ah + 8} />
        </RealScreen>
      ),
    },
    { at: TF.members + 4, name: 'fx_qr' },
    { at: TF.listed + 4, name: 'fx_applied' },
    { at: TF.listed + 34, name: 'fx_mine' },
  ];
  const [mx, my, mw, mh] = MINE.map;
  return (
    <Phone3D x={SW / 2} y={y} scale={scale} rx={rx} ry={ry} opacity={1 - ease(f, [TF.end + 2, TF.end + 14], [0, 1])} shadow={0.9}
      outside={<Banner f={f} at={TF.listed + 18} until={TF.end - 6} app="工大祭" body="『ソース焼きそば屋』が工大祭の出店ページに掲載されました" />}>
      <ScreenFlow f={f} screens={shots} />
      {/* 「マップで見る」→ キャンパスナビ */}
      <Tap x={mx + mw / 2} y={STATUS_H + my + mh / 2 - MINE_SCROLL} f={f} at={TF.map - 6} />
      {/* 学生が「店員さんの前で使う」を押す */}
      <Tap x={195} y={STATUS_H + 356} f={f} at={TF.coupon + 18} />
    </Phone3D>
  );
};

// 小節ごとの見出し
const Scene = ({ f, at, len = 48, lines, note }) => {
  const k = f - at;
  if (k < -4 || k > len + 4) return null;
  return (
    <AbsoluteFill>
      <Caption g={k} lines={lines} exitAt={len - 8} light size={100} top={336} />
      {note && (
        <div style={{ position: 'absolute', left: 0, right: 0, top: 596, textAlign: 'center', fontSize: 22, fontWeight: 600, color: 'rgba(255,255,255,0.6)', opacity: ease(k, [8, 14], [0, 1]) * (1 - ease(k, [len - 8, len - 2], [0, 1])) }}>
          {note}
        </div>
      )}
    </AbsoluteFill>
  );
};

// ドロップ：白く光って、アプリ名のラベル
const Drop = ({ f }) => {
  const k = f - TF.drop;
  if (k < 0 || k > 52) return null;
  return (
    <AbsoluteFill>
      <AbsoluteFill style={{ background: '#fff', opacity: 0.85 * (1 - ease(k, [0, 12], [0, 1])) }} />
      <Burst k={k} cx={540} cy={470} />
      <Pill g={k} d={2} exitAt={42} top={250}>
        <Img src={staticFile('promo/icon.png')} style={{ width: 52, height: 52, borderRadius: 13 }} />
        ScienceTokyo App
      </Pill>
    </AbsoluteFill>
  );
};

// ── 528〜 エンドカード。曲の最後の一打（660f）で締める ──
const STEPS = ['団体メンバー3人以上がアプリに登録', '代表者がメンバーのQRを読み取って申請', '運営が確認したら、工大祭ページに掲載'];
const End = ({ f }) => {
  const e = f - TF.end;
  if (e < -2) return null;
  const hit = f >= SONG_F.stop ? Math.exp(-(f - SONG_F.stop) / 7) : 0;
  const urlP = sp(e, 74, { damping: 14, stiffness: 160 });
  return (
    <AbsoluteFill>
      <Burst k={e - 16} cx={540} cy={520} />
      <Burst k={f - SONG_F.stop} cx={540} cy={520} />
      <div style={{ position: 'absolute', inset: 0, transform: `scale(${1 + 0.04 * hit})`, transformOrigin: '540px 520px' }}>
        <IconAssembly r={e - 14} size={240} cx={540} cy={520} />
      </div>
      <NewBadge g={e} d={34} x={736} y={402} text="掲載無料" bg={GOLD} color="#3a1d4f" size={32} />
      <div style={{ position: 'absolute', left: 0, right: 0, top: 690, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <CharPop segs="工大祭の出店、" f={e} d={18} stagger={1.4} size={88} color="#ffffff" />
        <CharPop segs={[{ t: 'アプリで' }, g('宣伝'), { t: 'しよう。' }]} f={e} d={26} stagger={1.6} size={96} color="#ffffff" />
      </div>
      <div style={{ position: 'absolute', left: 110, right: 90, top: 950 }}>
        {STEPS.map((s, i) => {
          const p = sp(e, 40 + i * 8, { damping: 16, stiffness: 170 });
          return (
            <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 22, marginBottom: 26, opacity: Math.min(1, p * 1.5), transform: `translateX(${(1 - p) * 60}px)` }}>
              <span style={{ width: 62, height: 62, borderRadius: 31, background: GOLD, color: '#3a1d4f', fontSize: 34, fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{i + 1}</span>
              <span style={{ fontSize: 36, fontWeight: 800, color: '#ffffff', letterSpacing: '-0.01em' }}>{s}</span>
            </div>
          );
        })}
      </div>
      <div style={{ position: 'absolute', left: 0, right: 0, top: 1262, display: 'flex', justifyContent: 'center', opacity: ease(e, [66, 74], [0, 1]) }}>
        <div style={{ padding: '10px 24px', borderRadius: 30, background: 'rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.92)', fontSize: 30, fontWeight: 700 }}>
          アプリ ▸ 工大祭 出店 ▸ <span style={{ color: GOLD }}>掲載を申請する</span>
        </div>
      </div>
      <div style={{ position: 'absolute', top: 1352, left: 0, right: 0, display: 'flex', justifyContent: 'center' }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 18, padding: '14px 16px 14px 36px', borderRadius: 56, background: '#fff',
          boxShadow: `0 26px 50px -26px rgba(0,0,0,0.6), 0 0 0 ${12 * hit}px rgba(255,196,107,${0.35 * hit})`,
          opacity: ease(e, [74, 80], [0, 1]), transform: `translateY(${(1 - urlP) * 24}px) scale(${(0.85 + 0.15 * urlP) * (1 + 0.04 * hit)})`,
        }}>
          <span style={{ fontSize: 42, fontWeight: 800, color: '#0e2030', letterSpacing: '0.01em' }}>sciencetokyo.app</span>
          <div style={{ width: 58, height: 58, borderRadius: 29, background: '#28c868', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="arr" size={28} color="#fff" sw={2.6} />
          </div>
        </div>
      </div>
      <div style={{ position: 'absolute', top: 1484, left: 0, right: 0, textAlign: 'center', fontSize: 22, lineHeight: 1.6, color: 'rgba(255,255,255,0.62)', opacity: ease(e, [84, 94], [0, 1]) }}>
        ※ 東京科学大学の学生アカウントが必要です<br />※ 画面の出店はサンプルです
      </div>
    </AbsoluteFill>
  );
};

// ── 音 ──
const pop = (at, volume = 0.24) => ({ src: 'promo/sfx/pop.wav', at, volume, duck: 0, len: 4 });
const SFX = [
  { src: 'promo/sfx/whoosh.wav', at: TF.drop - 10, volume: 0.45, duck: 0.15, len: 20 },
  pop(TF.map - 6),
  pop(TF.coupon + 18),
  { src: 'promo/sfx/success.wav', at: TF.coupon + 22, volume: 0.3, duck: 0.3, len: 26 },
  pop(TF.listed + 18, 0.26),
  { src: 'promo/sfx/whoosh.wav', at: TF.end - 10, volume: 0.4, duck: 0.15, len: 20 },
  { src: 'promo/sfx/chime.wav', at: TF.end + 16, volume: 0.36, duck: 0.3, len: 36 },
];

export const FestPromo = () => {
  const f = useCurrentFrame();
  return (
    <AbsoluteFill style={{ fontFamily: FONT, overflow: 'hidden' }}>
      <Background f={f} keys={BGF} />
      <Sparkles f={f} strength={f < TF.drop ? 1 : f >= TF.end ? 1 : 0.55} />
      <Posters f={f} />
      <PhoneF f={f} />
      <Hook f={f} />
      <Drop f={f} />
      <Scene f={f} at={TF.drop} lines={[[{ t: 'あなたの出店を、' }], [{ t: 'アプリに' }, g('掲載'), { t: '。' }]]} />
      <Scene f={f} at={TF.page} len={96} lines={[[{ t: '写真もメニューも、' }], [{ t: '1ページで' }, g('伝わる'), { t: '。' }]]} note="※ 画面の出店はサンプルです" />
      <Scene f={f} at={TF.map} lines={[[{ t: 'マップで、' }], [{ t: 'お店まで' }, g('道案内'), { t: '。' }]]} />
      <Scene f={f} at={TF.coupon} lines={[[{ t: '学生限定' }, g('クーポン'), { t: 'で、' }], [{ t: 'お客さんを呼べる。' }]]} />
      <Scene f={f} at={TF.count} lines={[[{ t: '使われた数も、' }], [g('ひと目'), { t: 'でわかる。' }]]} />
      <Scene f={f} at={TF.form} lines={[[{ t: '申請はアプリで。' }], [{ t: '下書きも' }, g('自動保存'), { t: '。' }]]} />
      <Scene f={f} at={TF.members} lines={[[{ t: 'メンバー3人以上で、' }], [g('QR'), { t: 'を読み取るだけ。' }]]} />
      <Scene f={f} at={TF.listed} lines={[[{ t: '運営が確認して、' }], [g('掲載スタート'), { t: '。' }]]} />
      {/* 出店者に見える利用数・確認済みのメンバー（画面の一部を大きく） */}
      <Lift f={f} at={TF.count + 12} until={TF.form - 8} name="fx_mine" crop={{ x: 16, y: 491, w: 358, h: 139 }} x={146} y={1330} scale={2.2} from={[0, 90]} />
      <Lift f={f} at={TF.members + 14} until={TF.listed - 8} name="fx_form" crop={{ x: 16, y: 154, w: 358, h: 296 }} x={272} y={1250} scale={1.5} from={[0, 90]} />
      <End f={f} />
      <SongTrack song={SONG_F} sfx={SFX} />
    </AbsoluteFill>
  );
};
