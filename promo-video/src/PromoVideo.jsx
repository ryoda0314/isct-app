import { AbsoluteFill, Audio, Img, Sequence, useCurrentFrame, useVideoConfig, staticFile, interpolate } from 'remotion';
import { useMemo } from 'react';

// ── キャラ配色（プレースホルダー用）─────────────────────
const CHARS = {
  zundamon: { name: 'ずんだもん', body: '#28c868', dark: '#1c9e50', side: 'right' },
  metan:    { name: '四国めたん', body: '#e85a9b', dark: '#c43e7d', side: 'left' },
};

// ── 本物の立ち絵PNGを使う場合はここにパスを設定（public/からの相対）──
// 口開き/口閉じの2枚があると口パクします。1枚だけでもOK（揺れのみ）。
// 例: zundamon: { closed: 'assets/zunda_close.png', open: 'assets/zunda_open.png' }
// 立ち絵PNGは {slug}_{expr}_{close|open}.png（convert_psd.py が生成）。
// 表情キー: normal / happy / excited / surprised / troubled / doya
const EXPRS = ['normal', 'happy', 'excited', 'surprised', 'troubled', 'doya'];
const SLUG = { zundamon: 'zunda', metan: 'metan' };
function assetSrc(char, expr, open) {
  const slug = SLUG[char];
  const e = EXPRS.includes(expr) ? expr : 'normal';
  return `assets/${slug}_${e}_${open ? 'open' : 'close'}.png`;
}
const USE_ASSETS = true; // false にすると簡易プレースホルダー描画
const CHAR_HEIGHT = 760;  // 立ち絵の表示高さ(px)

// 章ごとの背景グラデーション
const PALETTE = [
  ['#eef5fb', '#d6e9f7'],
  ['#eafaf0', '#cdeedd'],
  ['#fdeef6', '#f7d6e9'],
  ['#fff7e6', '#ffe9bf'],
  ['#eef0fb', '#dad9f7'],
];

// タイムラインから各セグメントの開始フレーム・尺(フレーム)を前計算
function layout(segments, fps) {
  let cursor = 0;
  return segments.map((s) => {
    const startFrame = Math.round(cursor * fps);
    const durFrames = Math.max(1, Math.round(s.duration * fps));
    cursor += s.duration + (s.gapAfter || 0);
    return { ...s, startFrame, durFrames };
  });
}

// 立ち絵（表情つきPNG。USE_ASSETS=false なら簡易図形）
function Character({ char, active, expr, mouthOpen, frame }) {
  const c = CHARS[char];
  const bob = active ? Math.sin(frame / 3.2) * 10 : 0;
  const breathe = active ? 1 + Math.sin(frame / 18) * 0.012 : 0.92;
  const wrap = {
    position: 'relative',
    transform: `translateY(${bob}px) scale(${breathe})`,
    opacity: active ? 1 : 0.5,
    filter: active ? 'none' : 'grayscale(0.4) brightness(0.95)',
  };

  // 表情つき立ち絵PNG
  if (USE_ASSETS) {
    // 発話中は segment の表情、待機中は normal の口閉じ
    const useExpr = active ? expr : 'normal';
    const open = active && mouthOpen;
    return (
      <div style={wrap}>
        <Img src={staticFile(assetSrc(char, useExpr, open))} style={{ height: CHAR_HEIGHT, objectFit: 'contain' }} />
      </div>
    );
  }

  // プレースホルダー
  const mouthH = active && mouthOpen ? 46 : 8;
  return (
    <div style={wrap}>
      {/* 体 */}
      <div style={{ width: 300, height: 340, borderRadius: '46% 46% 38% 38%', background: c.body, boxShadow: `inset 0 -30px 0 ${c.dark}33`, position: 'relative' }}>
        {/* 目 */}
        <div style={{ position: 'absolute', top: 120, left: 70, width: 34, height: 44, borderRadius: '50%', background: '#1a1a1a' }} />
        <div style={{ position: 'absolute', top: 120, right: 70, width: 34, height: 44, borderRadius: '50%', background: '#1a1a1a' }} />
        {/* ほっぺ */}
        <div style={{ position: 'absolute', top: 180, left: 40, width: 46, height: 26, borderRadius: '50%', background: '#ff9bb6aa' }} />
        <div style={{ position: 'absolute', top: 180, right: 40, width: 46, height: 26, borderRadius: '50%', background: '#ff9bb6aa' }} />
        {/* 口（開閉） */}
        <div style={{ position: 'absolute', top: 210, left: '50%', transform: 'translateX(-50%)', width: 70, height: mouthH, borderRadius: mouthOpen ? '40%' : '8px', background: '#7a2230' }} />
      </div>
      {/* 名札 */}
      <div style={{ marginTop: 14, textAlign: 'center', fontWeight: 800, fontSize: 30, color: c.dark }}>{c.name}</div>
    </div>
  );
}

export const PromoVideo = ({ timeline }) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const segs = useMemo(() => layout(timeline.segments, fps), [timeline, fps]);

  // 章 → パレット
  const chapterColor = useMemo(() => {
    const map = {};
    let i = 0;
    for (const s of timeline.segments) if (!(s.chapter in map)) map[s.chapter] = PALETTE[i++ % PALETTE.length];
    return map;
  }, [timeline]);

  // 現在のセグメント
  const current = segs.find((s) => frame >= s.startFrame && frame < s.startFrame + s.durFrames)
    || segs.reduce((a, s) => (s.startFrame <= frame ? s : a), segs[0]);

  // 口パク判定
  const localSec = (frame - current.startFrame) / fps;
  const mouthOpen = (current.mouth || []).some(([a, b]) => localSec >= a && localSec <= b);

  const bg = chapterColor[current.chapter] || PALETTE[0];

  // 字幕ポップイン
  const localFrame = frame - current.startFrame;
  const subProgress = interpolate(localFrame, [0, 7], [0, 1], { extrapolateRight: 'clamp', extrapolateLeft: 'clamp' });

  // タイプライター：発話に合わせて文字を出す（尺の約7割で出し切る）
  const revealFrames = Math.max(10, (current.durFrames || 30) * 0.7);
  const revealCount = Math.ceil(
    interpolate(localFrame, [5, revealFrames], [0, current.text.length], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
  );
  const shownText = current.text.slice(0, revealCount);
  const typing = revealCount < current.text.length;

  const cc = CHARS[current.speaker];

  return (
    <AbsoluteFill style={{ fontFamily: '"Inter","Hiragino Sans","Yu Gothic",sans-serif', background: `linear-gradient(135deg, ${bg[0]}, ${bg[1]})` }}>
      {/* 音声（各セグメントをオフセット配置）*/}
      {segs.map((s) => s.audio ? (
        <Sequence key={s.seq} from={s.startFrame} durationInFrames={s.durFrames + 4}>
          <Audio src={staticFile(s.audio)} />
        </Sequence>
      ) : null)}

      {/* 章タイトル */}
      <div style={{ position: 'absolute', top: 48, left: 0, right: 0, textAlign: 'center', fontSize: 40, fontWeight: 800, color: '#2a3b4d', textShadow: '0 2px 8px #fff8' }}>
        {current.chapter}
      </div>

      {/* テロップ（箇条書き）*/}
      {current.telop && current.telop.length > 0 && (
        <div style={{ position: 'absolute', top: 140, left: 80, maxWidth: 760, background: '#ffffffdd', borderRadius: 20, padding: '24px 30px', boxShadow: '0 10px 40px #0002' }}>
          {current.telop.map((t, i) => {
            const op = interpolate(frame - current.startFrame, [i * 4, i * 4 + 8], [0, 1], { extrapolateRight: 'clamp', extrapolateLeft: 'clamp' });
            return <div key={i} style={{ fontSize: 30, lineHeight: 1.6, color: '#22303f', opacity: op, fontWeight: i === 0 && !/^[-・]/.test(t) ? 800 : 500 }}>{/^[-・]/.test(t) ? t : `・${t}`}</div>;
          })}
        </div>
      )}

      {/* キャラ（めたん左／ずんだもん右）*/}
      <div style={{ position: 'absolute', bottom: 240, left: 140 }}>
        <Character char="metan" active={current.speaker === 'metan'} expr={current.expr} mouthOpen={current.speaker === 'metan' && mouthOpen} frame={frame} />
      </div>
      <div style={{ position: 'absolute', bottom: 240, right: 140 }}>
        <Character char="zundamon" active={current.speaker === 'zundamon'} expr={current.expr} mouthOpen={current.speaker === 'zundamon' && mouthOpen} frame={frame} />
      </div>

      {/* 字幕 */}
      <div
        style={{
          position: 'absolute', bottom: 64, left: '50%',
          transform: `translateX(-50%) translateY(${(1 - subProgress) * 18}px)`,
          opacity: subProgress, width: width * 0.82, boxSizing: 'border-box',
          background: 'linear-gradient(180deg, rgba(16,24,34,0.93), rgba(22,33,46,0.96))',
          borderRadius: 26, padding: '34px 46px 32px',
          border: `3px solid ${cc.body}`,
          boxShadow: `0 16px 44px rgba(0,0,0,0.45), inset 0 0 0 1px rgba(255,255,255,0.06)`,
        }}
      >
        {/* 名前バッジ */}
        <div
          style={{
            position: 'absolute', top: -26, left: 40,
            padding: '7px 24px', borderRadius: 999,
            background: `linear-gradient(135deg, ${cc.body}, ${cc.dark})`,
            color: '#fff', fontSize: 26, fontWeight: 800, letterSpacing: 1.5,
            boxShadow: `0 6px 16px ${cc.dark}88`,
            WebkitTextStroke: `0.5px ${cc.dark}`,
          }}
        >
          {cc.name}
        </div>
        {/* 本文（縁取り＋タイプライター）*/}
        <div
          style={{
            fontSize: 47, lineHeight: 1.5, fontWeight: 800, color: '#fff',
            letterSpacing: 0.5, paintOrder: 'stroke fill',
            WebkitTextStroke: `5px ${cc.dark}`,
            textShadow: `0 3px 10px rgba(0,0,0,0.55)`,
          }}
        >
          {shownText}
          {/* 入力カーソル */}
          {typing && (
            <span style={{ opacity: frame % 16 < 8 ? 0.9 : 0.2, WebkitTextStroke: 0, color: cc.body, marginLeft: 2 }}>▍</span>
          )}
        </div>
      </div>
    </AbsoluteFill>
  );
};
