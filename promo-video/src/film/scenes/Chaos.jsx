import React from 'react';
import { AbsoluteFill, Img, staticFile } from 'remotion';
import { EASE_IN, EASE_IN_OUT, EASE_OUT, TL, ease, mix, sp } from '../theme.js';
import { Rise } from '../type.jsx';

// 768–1344：大学の情報は、あちこちのサイトとログインに散らばっている。
// 窓が拍ごとに増え（後半は倍の速さ）、画面が引いていく。最後にツバメが突き抜けて、窓が吹き飛ぶ。
// 実在のサービスの名前やロゴは使わず、一般的な呼び名だけで描く。

const rnd = (seed) => {
  let s = seed;
  return () => ((s = (s * 9301 + 49297) % 233280) / 233280);
};

const ACCENTS = ['#3b6fd8', '#2a9d6f', '#d9822b', '#8a5cc7', '#d2475a', '#1f8fa8', '#6b7a8f'];
const SITES = ['LMS', 'シラバス', '教務システム', '休講・補講情報', '学内掲示板', '大学メール', '図書館', '施設予約', '学年暦', '新歓情報', '出欠登録', '課題提出', '成績照会', '学内地図'];
const MAILS = ['【重要】休講のお知らせ', '課題の提出について', '履修登録期間のお知らせ', '教室変更のお知らせ', 'アンケートのお願い', '【再送】説明会の案内'];
const TOASTS = ['【重要】休講のお知らせ', '課題の締切が近づいています', 'パスワードの有効期限が近づいています', '教室が変更されました', '履修登録の締切は明日です', '新しいお知らせが3件あります'];

// 窓の一覧（出る時刻・位置・大きさ・種類）。前半は1拍ごと、後半は半拍ごと
const WINS = (() => {
  const r = rnd(42);
  const out = [];
  const add = (at, i) => {
    const kind = i % 7 === 3 ? 'login' : i % 7 === 5 ? 'mail' : i % 11 === 8 ? 'expired' : i % 9 === 6 ? 'pdf' : 'site';
    const w = kind === 'login' || kind === 'expired' ? 430 + r() * 60 : 520 + r() * 260;
    const h = kind === 'login' ? 360 : kind === 'expired' ? 230 : 330 + r() * 200;
    // 仮想の机（3000x1700）に、だんだん外側へ広がるように置く
    const spread = Math.min(1, 0.35 + i / 60);
    const x = 1500 + (r() - 0.5) * 2 * 1300 * spread - w / 2;
    const y = 850 + (r() - 0.5) * 2 * 700 * spread - h / 2;
    out.push({ at, kind, x, y, w, h, rot: (r() - 0.5) * 7, accent: ACCENTS[i % ACCENTS.length], title: SITES[i % SITES.length], seed: i });
  };
  let i = 0;
  for (let at = TL.chaos; at < TL.build; at += 12) add(at, i++);
  for (let at = TL.build; at < TL.build + 144; at += 6) add(at, i++);
  return out;
})();

const Bar = ({ w, c = '#e3e8ef', h = 12, mt = 10 }) => <div style={{ width: w, height: h, borderRadius: h / 2, background: c, marginTop: mt }} />;

const WindowBody = ({ win }) => {
  const r = rnd(win.seed * 31 + 7);
  if (win.kind === 'login' || win.kind === 'expired') {
    return (
      <div style={{ padding: '26px 30px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ fontSize: 26, fontWeight: 800, color: '#1d2733' }}>{win.kind === 'login' ? 'ログイン' : 'セッションの有効期限が切れました'}</div>
        {win.kind === 'login' ? (
          <>
            {['ユーザー名', 'パスワード'].map((t) => (
              <div key={t}>
                <div style={{ fontSize: 15, color: '#6b7684', marginBottom: 6 }}>{t}</div>
                <div style={{ height: 40, borderRadius: 8, border: '1.5px solid #cfd6df', background: '#f8fafc' }} />
              </div>
            ))}
            <div style={{ height: 44, borderRadius: 8, background: win.accent, color: '#fff', fontSize: 18, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: 6 }}>ログイン</div>
          </>
        ) : (
          <>
            <div style={{ fontSize: 17, color: '#4b5563', lineHeight: 1.6 }}>もう一度ログインしてください。</div>
            <div style={{ alignSelf: 'flex-end', height: 40, padding: '0 22px', borderRadius: 8, background: win.accent, color: '#fff', fontSize: 17, fontWeight: 700, display: 'flex', alignItems: 'center' }}>OK</div>
          </>
        )}
      </div>
    );
  }
  if (win.kind === 'mail') {
    return (
      <div style={{ padding: '10px 0' }}>
        {MAILS.map((m, i) => (
          <div key={m} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 22px', borderBottom: '1px solid #eef1f5' }}>
            <div style={{ width: 10, height: 10, borderRadius: 5, background: i < 3 ? win.accent : 'transparent', border: i < 3 ? 'none' : '1.5px solid #cfd6df' }} />
            <div style={{ fontSize: 17, fontWeight: i < 3 ? 700 : 500, color: '#1d2733', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m}</div>
          </div>
        ))}
      </div>
    );
  }
  if (win.kind === 'pdf') {
    return (
      <div style={{ padding: 22, display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 6 }}>
        {Array.from({ length: 25 }).map((_, i) => <div key={i} style={{ height: 34, borderRadius: 4, background: r() < 0.45 ? `${win.accent}2a` : '#f1f4f8' }} />)}
      </div>
    );
  }
  return (
    <div style={{ padding: '20px 26px' }}>
      <div style={{ fontSize: 24, fontWeight: 800, color: '#1d2733' }}>{win.title}</div>
      <Bar w={`${50 + r() * 40}%`} mt={16} />
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} style={{ display: 'flex', gap: 14, marginTop: 16, alignItems: 'center' }}>
          <div style={{ width: 42, height: 42, borderRadius: 10, background: `${win.accent}22` }} />
          <div style={{ flex: 1 }}>
            <Bar w={`${55 + r() * 40}%`} mt={0} c="#d9e0e8" />
            <Bar w={`${30 + r() * 40}%`} mt={8} h={10} />
          </div>
        </div>
      ))}
    </div>
  );
};

const Window = ({ win, f, blow }) => {
  const p = sp(f, win.at, { damping: 13, stiffness: 210, mass: 0.7 });
  if (p <= 0.001) return null;
  return (
    <div style={{
      position: 'absolute', left: win.x, top: win.y, width: win.w, height: win.h, borderRadius: 14, overflow: 'hidden', background: '#ffffff',
      boxShadow: '0 30px 60px -28px rgba(20,30,45,0.45), 0 0 0 1px rgba(20,30,45,0.08)',
      opacity: Math.min(1, p * 1.6) * (1 - blow.o), filter: blow.b > 0.3 ? `blur(${blow.b}px)` : undefined,
      transform: `translate(${blow.x}px, ${blow.y}px) rotate(${win.rot + blow.r}deg) scale(${0.7 + 0.3 * p})`,
    }}>
      <div style={{ height: 44, background: '#f1f4f8', borderBottom: '1px solid #e3e8ef', display: 'flex', alignItems: 'center', gap: 8, padding: '0 16px' }}>
        {['#ff6058', '#ffbd2e', '#28c941'].map((c) => <div key={c} style={{ width: 12, height: 12, borderRadius: 6, background: c }} />)}
        <div style={{ marginLeft: 12, flex: 1, height: 26, borderRadius: 13, background: '#ffffff', border: '1px solid #e3e8ef', display: 'flex', alignItems: 'center', padding: '0 12px', gap: 8, overflow: 'hidden' }}>
          <div style={{ width: 9, height: 11, borderRadius: 2, background: '#9aa5b3' }} />
          <div style={{ fontSize: 14, color: '#6b7684', whiteSpace: 'nowrap' }}>{win.kind === 'mail' ? '大学メール' : win.kind === 'pdf' ? '時間割表.pdf' : win.title}</div>
        </div>
      </div>
      <div style={{ height: 5, background: win.accent }} />
      <WindowBody win={win} />
    </div>
  );
};

// 右上に積み重なる通知
const Toasts = ({ f }) => (
  <div style={{ position: 'absolute', right: 70, top: 160, width: 470, display: 'flex', flexDirection: 'column', gap: 12, zIndex: 30 }}>
    {TOASTS.map((t, i) => {
      const at = 984 + i * 24;
      const p = sp(f, at, { damping: 15, stiffness: 200 });
      if (p <= 0.001) return null;
      const out = ease(f, [TL.build + 150, TL.build + 166], [0, 1], EASE_IN);
      return (
        <div key={t} style={{
          display: 'flex', alignItems: 'center', gap: 14, padding: '14px 18px', borderRadius: 16, background: 'rgba(255,255,255,0.94)',
          boxShadow: '0 18px 36px -18px rgba(20,30,45,0.55)', opacity: Math.min(1, p * 1.5) * (1 - out), transform: `translateX(${(1 - p) * 80}px)`,
        }}>
          <div style={{ width: 38, height: 38, borderRadius: 10, background: ACCENTS[i % ACCENTS.length], flexShrink: 0 }} />
          <div style={{ fontSize: 18, fontWeight: 700, color: '#1d2733', whiteSpace: 'nowrap' }}>{t}</div>
        </div>
      );
    })}
  </div>
);

// ツバメの通り道（左下 → 右上）。窓はツバメが近くを通った瞬間から、道の外側へ吹き飛ぶ
const PATH_A = [-300, 1350];
const PATH_B = [3300, -250];
const SW_FROM = TL.build + 160; // 1312
const SW_LEN = 24;
const blowOf = (win, f) => {
  const cx = win.x + win.w / 2;
  const cy = win.y + win.h / 2;
  const dx = PATH_B[0] - PATH_A[0];
  const dy = PATH_B[1] - PATH_A[1];
  const L = Math.hypot(dx, dy);
  const u = ((cx - PATH_A[0]) * dx + (cy - PATH_A[1]) * dy) / (L * L); // 道に沿った位置 0〜1
  const side = Math.sign((cx - PATH_A[0]) * dy - (cy - PATH_A[1]) * dx) || 1; // 道のどちら側か
  const t0 = SW_FROM + SW_LEN * Math.max(0, Math.min(1, u)) - 2;
  const k = ease(f, [t0, t0 + 22], [0, 1], EASE_IN);
  const nx = (dy / L) * side;
  const ny = (-dx / L) * side;
  const dist = 1400 * k + 120 * k * k;
  return { x: nx * dist + (dx / L) * 300 * k, y: ny * dist + (dy / L) * 300 * k, r: side * 50 * k, o: ease(f, [t0 + 8, t0 + 22], [0, 1]), b: 16 * k };
};

const Swallow = ({ f }) => {
  const u = ease(f, [SW_FROM - 4, SW_FROM + SW_LEN], [0, 1], (x) => x);
  if (u <= 0 || u >= 1) return null;
  const pt = (t) => [mix(-260, 2200, t), mix(1300, -260, t) - 140 * Math.sin(t * Math.PI)];
  return (
    <>
      {[7, 6, 5, 4, 3, 2, 1, 0].map((j) => {
        const t = Math.max(0, u - j * 0.022);
        const [x, y] = pt(t);
        const [x2, y2] = pt(Math.min(1, t + 0.01));
        const ang = (Math.atan2(y2 - y, x2 - x) * 180) / Math.PI + 38;
        return (
          <Img key={j} maxRetries={8} src={staticFile('promo/swallow.png')} style={{
            position: 'absolute', left: x - 150, top: y - 141, width: 300, height: 282, zIndex: 80,
            transform: `rotate(${ang}deg)`, opacity: j === 0 ? 1 : 0.2 * (1 - j / 8), filter: j === 0 ? 'drop-shadow(0 20px 30px rgba(14,32,48,0.35))' : 'blur(2px)',
          }} />
        );
      })}
    </>
  );
};

export const Chaos = ({ f }) => {
  // 机がだんだん引いて、少し傾く
  const zoom = mix(1, 0.8, ease(f, [TL.chaos, TL.build], [0, 1], EASE_IN_OUT)) * mix(1, 0.74, ease(f, [TL.build, SW_FROM], [0, 1], EASE_IN_OUT));
  const tilt = mix(-1.5, 2.5, ease(f, [TL.chaos, SW_FROM], [0, 1], EASE_IN_OUT));
  const shake = f > TL.build + 60 && f < SW_FROM ? Math.sin(f * 1.7) * 2.2 * ease(f, [TL.build + 60, SW_FROM], [0, 1]) : 0;
  const enter = ease(f, [TL.chaos - 8, TL.chaos + 10], [0, 1]);
  return (
    <AbsoluteFill style={{ opacity: enter }}>
      <div style={{
        position: 'absolute', left: 960 - 1500, top: 540 - 850, width: 3000, height: 1700,
        transform: `translate(${shake}px, ${shake * 0.6}px) scale(${zoom}) rotate(${tilt}deg)`, transformOrigin: '1500px 850px',
      }}>
        {WINS.map((w) => <Window key={w.seed} win={w} f={f} blow={blowOf(w, f)} />)}
      </div>
      <Toasts f={f} />
      <Swallow f={f} />

      {/* 文字の後ろを白くにじませて読みやすく */}
      <AbsoluteFill style={{ background: 'radial-gradient(ellipse 48% 30% at 50% 50%, rgba(255,255,255,0.92) 0%, rgba(255,255,255,0.7) 45%, rgba(255,255,255,0) 100%)', opacity: (1 - ease(f, [SW_FROM - 30, SW_FROM - 10], [0, 1])) * enter, zIndex: 40 }} />
      <div style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
        <div style={{ position: 'absolute' }}>
          <Rise segs={[{ t: '情報は、' }, { t: 'あちこち', color: '#c23a4f' }, { t: 'に。' }]} f={f} d={TL.chaos + 14} exitAt={TL.chaos + 168} size={104} color="#1d2733" />
        </div>
        <div style={{ position: 'absolute' }}>
          <Rise segs={[{ t: 'ログインも、' }, { t: '何度も', color: '#c23a4f' }, { t: '。' }]} f={f} d={TL.chaos + 196} exitAt={TL.chaos + 316} size={104} color="#1d2733" />
        </div>
        <div style={{ position: 'absolute' }}>
          <Rise segs={[{ t: '締切、' }, { t: '見落としてない', color: '#c23a4f' }, { t: '？' }]} f={f} d={TL.chaos + 330} exitAt={TL.build + 48} size={104} color="#1d2733" />
        </div>
        <div style={{ position: 'absolute' }}>
          <Rise segs="……もっと、シンプルにできたら。" f={f} d={TL.build + 64} exitAt={SW_FROM - 22} size={72} weight={700} color="#1d2733" stagger={1.6} />
        </div>
      </div>
    </AbsoluteFill>
  );
};
