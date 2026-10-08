import React from 'react';
import { Img, staticFile } from 'remotion';
import { EASE_IN, EASE_OUT, ease, mix, sp } from './theme2.js';
import { SCREEN_W, STATUS_H } from '../promo/Phone.jsx';

// ── ロック画面（プロローグ）と iOS の通知 ───────────────────────────
// 通知の文面は、アプリの通知一覧（デモ）や画面の文言と同じもの
export const LOCK_NOTES = [
  { at: 120, app: '課題の締切', body: '「実験レポート第2回」の締切が明日です' },
  { at: 144, app: '鈴木一郎', body: 'ありがとう！やってみる', kind: 'DM' },
  { at: 168, app: '新しい教材', body: '「データ構造とアルゴリズム」に新しい教材がアップロードされました' },
  { at: 192, app: '工大祭', body: '10/10(土)・11(日) 模擬店・展示・学生限定クーポンをチェック' },
];

const NoteCard = ({ n, style }) => (
  <div style={{
    display: 'flex', gap: 11, alignItems: 'flex-start', padding: '11px 13px', borderRadius: 22, boxSizing: 'border-box',
    background: 'rgba(242,244,250,0.82)', boxShadow: '0 10px 24px -14px rgba(0,0,0,0.5)', ...style,
  }}>
    <Img src={staticFile('promo/icon.png')} style={{ width: 38, height: 38, borderRadius: 9, flexShrink: 0 }} />
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#6a7480', fontWeight: 600 }}>
        <span>ScienceTokyo App{n.kind ? ` · ${n.kind}` : ''}</span><span>今</span>
      </div>
      <div style={{ fontSize: 15, fontWeight: 800, color: '#0e1620', marginTop: 1 }}>{n.app}</div>
      <div style={{ fontSize: 14, color: '#26313c', lineHeight: 1.4, marginTop: 1, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{n.body}</div>
    </div>
  </div>
);

export const LockScreen = ({ f, unlock = 0 }) => {
  // 新しい通知ほど上。届くたびに下の通知が押し下げられる
  const arrived = LOCK_NOTES.filter((n) => f >= n.at - 2);
  const y0 = 300;
  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', background: 'linear-gradient(160deg, #0d1d44 0%, #173b6b 45%, #1d6f7a 100%)', transform: `translateY(${-unlock * 844}px)` }}>
      {/* 壁紙：アイコンの3色をぼかしたもの */}
      {[['#1a9cf0', 60, 180, 260], ['#28c868', 330, 520, 240], ['#f2d21c', 120, 760, 220]].map(([c, x, y, r], i) => (
        <div key={i} style={{ position: 'absolute', left: x - r + 18 * Math.sin(f / 40 + i), top: y - r, width: r * 2, height: r * 2, borderRadius: '50%', background: `radial-gradient(circle, ${c}66 0%, ${c}00 70%)` }} />
      ))}
      <div style={{ position: 'absolute', inset: 0 }}>
        <svg width="18" height="22" viewBox="0 0 18 22" style={{ position: 'absolute', left: SCREEN_W / 2 - 9, top: STATUS_H + 6 }}>
          <rect x="1.5" y="9" width="15" height="11.5" rx="3" fill="#fff" />
          <path d="M5 9V6.2a4 4 0 018 0V9" fill="none" stroke="#fff" strokeWidth="2.2" />
        </svg>
        <div style={{ position: 'absolute', left: 0, right: 0, top: STATUS_H + 40, textAlign: 'center', color: 'rgba(255,255,255,0.88)', fontSize: 20, fontWeight: 600 }}>6月17日 水曜日</div>
        <div style={{ position: 'absolute', left: 0, right: 0, top: STATUS_H + 62, textAlign: 'center', color: '#fff', fontSize: 104, fontWeight: 500, letterSpacing: '-0.03em', lineHeight: 1.1 }}>8:40</div>
        {arrived.map((n) => {
          const idx = arrived.length - 1 - arrived.indexOf(n); // 0 = いちばん新しい
          const p = sp(f, n.at, { damping: 17, stiffness: 190 });
          // 自分より新しい通知が届いた分だけ下へ
          const push = arrived.filter((m) => m.at > n.at).reduce((s, m) => s + sp(f, m.at, { damping: 18, stiffness: 170 }) * 96, 0);
          return (
            <div key={n.at} style={{
              position: 'absolute', left: 12, width: SCREEN_W - 24, top: y0 + push, zIndex: 10 - idx,
              opacity: Math.min(1, p * 1.6), transform: `translateY(${(1 - p) * -40}px) scale(${0.9 + 0.1 * p})`,
            }}>
              <NoteCard n={n} />
            </div>
          );
        })}
        <div style={{ position: 'absolute', bottom: 7, left: SCREEN_W / 2 - 67, width: 134, height: 5, borderRadius: 3, background: '#fff' }} />
      </div>
    </div>
  );
};

// 端末の外にはみ出して降りてくる通知（Phone の outside に置く）
export const Banner = ({ f, at, until, app, body, kind, width = 430 }) => {
  if (f < at - 1 || f > until + 12) return null;
  const p = sp(f, at, { damping: 15, stiffness: 160 });
  const out = ease(f, [until, until + 10], [0, 1], EASE_IN);
  return (
    <div style={{
      position: 'absolute', left: (414 - width) / 2, top: -150 + 166 * p - 170 * out, width, zIndex: 200,
      opacity: ease(f, [at, at + 4], [0, 1]) * (1 - out),
      filter: 'drop-shadow(0 28px 30px rgba(14,32,48,0.35))',
    }}>
      <NoteCard n={{ app, body, kind }} style={{ background: 'rgba(250,251,253,0.97)', borderRadius: 26, padding: '13px 15px' }} />
    </div>
  );
};

// ── 課題の提出シート（views/AsgnView.jsx の SubmitSheet と同じ見た目・文言）────────
// デモモードでは提出できないので、アプリの画面構成をそのまま描いて動かす
const TS = { bg2: '#f6fafd', bg3: '#e0ecf6', bd: '#c8dcea', bdL: '#b8cedf', accent: '#28c868', green: '#28c868', txH: '#0e2030', txD: '#7898b0' };
const FileIcon = ({ c }) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><path d="M14 2v6h6" /></svg>
);
const Check = ({ c = '#fff', s = 22 }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
);

// t: シートが出てからのフレーム。pick: ファイルを選んだ時刻、press: 提出を押した時刻、done: 提出完了の時刻
export const SubmitSheet = ({ t, pick = 18, press = 34, done = 52 }) => {
  if (t < 0) return null;
  const p = sp(t, 0, { damping: 22, stiffness: 190 });
  const picked = t >= pick;
  const busy = t >= press && t < done;
  const finished = t >= done;
  const phase = t < press + 6 ? 'アップロード中...' : t < press + 12 ? '提出中...' : '確認中...';
  const row = { padding: '10px 12px', borderRadius: 8, background: TS.bg3, border: `1px solid ${TS.bd}`, marginBottom: 6 };
  const fileIn = ease(t, [pick, pick + 6], [0, 1], EASE_OUT);
  const doneP = sp(t, done, { damping: 12, stiffness: 220 });
  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 60 }}>
      <div style={{ position: 'absolute', inset: 0, background: `rgba(0,0,0,${0.5 * Math.min(1, p)})` }} />
      <div style={{
        position: 'absolute', left: 0, right: 0, bottom: 0, background: TS.bg2, borderRadius: '16px 16px 0 0', border: `1px solid ${TS.bd}`,
        padding: '18px 18px 62px', boxShadow: '0 -4px 24px rgba(0,0,0,.4)', transform: `translateY(${(1 - p) * 460}px)`,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: TS.txH }}>課題を提出</span>
          <svg width="18" height="18" viewBox="0 0 24 24" stroke={TS.txD} strokeWidth="2" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
        </div>
        <div style={{ fontSize: 13, fontWeight: 600, color: TS.txH, marginBottom: 12, lineHeight: 1.5 }}>実験レポート第2回</div>
        {!finished ? (
          <>
            <div style={{ ...row, marginBottom: 12 }}><div style={{ fontSize: 11, color: TS.txD }}>まだ提出していません</div></div>
            <div style={{ fontSize: 11, color: TS.txD, marginBottom: 8 }}>受付形式: pdf · 最大 20 MB</div>
            <div style={{
              width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '11px 0', borderRadius: 8, boxSizing: 'border-box',
              border: `1.5px dashed ${TS.bdL}`, color: TS.accent, fontSize: 13, fontWeight: 600, marginBottom: picked ? 8 : 12,
              transform: `scale(${t >= pick - 3 && t < pick + 3 ? 0.97 : 1})`,
            }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={TS.accent} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48" /></svg>
              ファイルを選択
            </div>
            {picked && (
              <div style={{ opacity: fileIn, transform: `translateY(${(1 - fileIn) * 10}px)` }}>
                <div style={{ fontSize: 11, color: TS.txD, marginBottom: 6 }}>ファイル名は変更できます（拡張子は固定）</div>
                <div style={row}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <FileIcon c={TS.accent} />
                    <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', background: TS.bg2, border: `1px solid ${TS.bd}`, borderRadius: 6, padding: '6px 8px' }}>
                      <span style={{ flex: 1, fontSize: 13, color: TS.txH, whiteSpace: 'nowrap', overflow: 'hidden' }}>実験レポート第2回_藤原陽翔</span>
                      <span style={{ fontSize: 13, color: TS.txD }}>.pdf</span>
                    </div>
                  </div>
                  <div style={{ fontSize: 11, color: TS.txD, marginTop: 4, paddingLeft: 26 }}>1.2 MB</div>
                </div>
              </div>
            )}
            <div style={{
              width: '100%', padding: '12px 0', borderRadius: 8, textAlign: 'center', marginTop: 4, fontSize: 14, fontWeight: 700,
              background: picked && !busy ? TS.accent : TS.bg3, color: picked && !busy ? '#fff' : TS.txD,
              transform: `scale(${t >= press - 3 && t < press + 3 ? 0.97 : 1})`,
            }}>{busy ? phase : '提出する'}</div>
          </>
        ) : (
          <div style={{ textAlign: 'center', padding: '12px 0' }}>
            <div style={{ display: 'inline-flex', width: 48, height: 48, borderRadius: 24, background: `${TS.green}18`, alignItems: 'center', justifyContent: 'center', marginBottom: 10, transform: `scale(${doneP})` }}>
              <Check c={TS.green} />
            </div>
            <div style={{ fontSize: 15, fontWeight: 700, color: TS.txH, marginBottom: 4 }}>提出しました</div>
            <div style={{ fontSize: 12, color: TS.txD, marginBottom: 14 }}>締切前なら再提出で上書きできます</div>
            <div style={{ ...row, display: 'flex', alignItems: 'center', gap: 8, textAlign: 'left' }}>
              <FileIcon c={TS.green} />
              <span style={{ flex: 1, fontSize: 13, color: TS.txH }}>実験レポート第2回_藤原陽翔.pdf</span>
              <span style={{ fontSize: 11, color: TS.txD }}>1.2 MB</span>
            </div>
            <div style={{ marginTop: 10, width: '100%', padding: '11px 0', borderRadius: 8, background: TS.accent, color: '#fff', fontSize: 14, fontWeight: 600 }}>閉じる</div>
          </div>
        )}
      </div>
    </div>
  );
};

// ── クーポン使用済み画面（views/FestivalView.jsx の UsedOverlay と同じ見た目・文言）────
// 時計が動き続けるので、スクリーンショットの使い回しと区別できる
const COUPON = '#e11d48';
const pad2 = (n) => String(n).padStart(2, '0');
export const CouponUsed = ({ t, title = 'トッピング1つ無料', name = 'タピオカミルクティー', base = [12, 20, 4] }) => {
  if (t < 0) return null;
  const p = ease(t, [0, 8], [0, 1], EASE_OUT);
  const card = sp(t, 3, { damping: 14, stiffness: 190 });
  const sec = base[2] + Math.floor(Math.max(0, t) / 30);
  const hh = base[0];
  const mm = base[1] + Math.floor(sec / 60);
  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 70, background: COUPON, opacity: p, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ width: '100%', background: '#fff', borderRadius: 18, overflow: 'hidden', color: '#111', textAlign: 'center', transform: `scale(${0.86 + 0.14 * card})`, opacity: Math.min(1, card * 1.4) }}>
        <div style={{ height: 14, background: `repeating-linear-gradient(135deg, ${COUPON} 0 14px, #fda4af 14px 28px)`, backgroundSize: '56px 14px', backgroundPosition: `${(t * 56 / 30) % 56}px 0` }} />
        <div style={{ padding: '22px 20px 18px' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: COUPON, letterSpacing: 2 }}>クーポン使用済み</div>
          <div style={{ fontSize: 26, fontWeight: 900, marginTop: 8, lineHeight: 1.3 }}>{title}</div>
          <div style={{ fontSize: 14, color: '#555', marginTop: 6 }}>{name}</div>
          <div style={{ fontSize: 44, fontWeight: 800, fontVariantNumeric: 'tabular-nums', marginTop: 18, letterSpacing: 1 }}>{pad2(hh)}:{pad2(mm % 60)}:{pad2(sec % 60)}</div>
          <div style={{ fontSize: 12, color: '#777', marginTop: 4 }}>使用 10/10 {pad2(base[0])}:{pad2(base[1])}</div>
          <div style={{ fontSize: 12, color: '#777', marginTop: 14, lineHeight: 1.6, whiteSpace: 'pre-line' }}>{'この画面を店員さんに見せてください。\n時計が動いていることを確認してもらえます。'}</div>
          <div style={{ marginTop: 16, width: '100%', padding: '12px 0', borderRadius: 10, background: '#111', color: '#fff', fontSize: 14, fontWeight: 700 }}>閉じる</div>
        </div>
      </div>
    </div>
  );
};

// タップ位置を示す丸（v1 と同じ考え方）
export const Tap = ({ x, y, f, at, size = 46 }) => {
  const k = f - at;
  if (k < -8 || k > 18) return null;
  const appear = ease(k, [-8, -3], [0, 1]);
  const press = k < 0 ? 0 : Math.exp(-k / 4);
  const fade = 1 - ease(k, [6, 14], [0, 1]);
  const ring = ease(k, [0, 16], [0, 1]);
  return (
    <div style={{ position: 'absolute', left: x, top: y, zIndex: 150, pointerEvents: 'none' }}>
      <div style={{
        position: 'absolute', left: -size / 2, top: -size / 2, width: size, height: size, borderRadius: '50%',
        background: 'rgba(14,32,48,0.22)', border: '2.5px solid rgba(255,255,255,0.95)', boxSizing: 'border-box',
        opacity: appear * fade, transform: `scale(${1 - 0.22 * press})`,
      }} />
      {k >= 0 && (
        <div style={{
          position: 'absolute', left: -size, top: -size, width: size * 2, height: size * 2, borderRadius: '50%',
          border: '2px solid rgba(40,200,104,0.7)', boxSizing: 'border-box', opacity: 1 - ring, transform: `scale(${0.4 + 0.6 * ring})`,
        }} />
      )}
    </div>
  );
};

export { mix };
