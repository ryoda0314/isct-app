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
const CHAR_HEIGHT = 660;  // 立ち絵の表示高さ(px)

// ── BGM（任意）──────────────────────────────────────
// public/bgm/ に音源を置き、ファイル名を BGM に設定するとループ再生する。
// 例: const BGM = 'bgm/track.mp3';  （未設定なら無音）
const BGM = 'bgm/昼下がり気分.mp3';  // もう1曲: 'bgm/soundorbis - Hey So Jungle [Country Release].mp3'
const BGM_VOLUME = 0.14;  // 声を邪魔しない控えめな音量
const BGM_FADE = 30;      // フェードイン/アウトのフレーム数

// ── 効果音（任意）──────────────────────────────────
// public/se/ に短い効果音を置き、ファイル名を設定すると自動で鳴る。
//   transition: 章の切り替わり（場面転換）  例: 'se/transition.mp3'
//   telop:      テロップ表示時（ポンッ）     例: 'se/pop.mp3'
const SE = { transition: null, telop: null };
const SE_VOLUME = 0.5;

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
  const { fps, width, height, durationInFrames } = useVideoConfig();
  const segs = useMemo(() => layout(timeline.segments, fps), [timeline, fps]);

  // 章 → パレット
  const chapterColor = useMemo(() => {
    const map = {};
    let i = 0;
    for (const s of timeline.segments) if (!(s.chapter in map)) map[s.chapter] = PALETTE[i++ % PALETTE.length];
    return map;
  }, [timeline]);

  // 効果音のトリガフレーム（章替わり／テロップ出現）
  const seTriggers = useMemo(() => {
    const transition = [], telop = [];
    segs.forEach((s, i) => {
      const prev = segs[i - 1];
      if (!prev || prev.chapter !== s.chapter) transition.push(s.startFrame);
      const tp = JSON.stringify(s.telop || []);
      const prevTp = prev ? JSON.stringify(prev.telop || []) : '[]';
      if ((s.telop || []).length && tp !== prevTp) telop.push(s.startFrame);
    });
    return { transition, telop };
  }, [segs]);

  // 各セグメントの「実画像の表示開始フレーム」（同じ画像が続く区間の先頭）
  const imageStarts = useMemo(() => {
    const arr = [];
    segs.forEach((s, i) => { arr[i] = (i > 0 && segs[i - 1].image === s.image) ? arr[i - 1] : s.startFrame; });
    return arr;
  }, [segs]);

  // 現在のセグメント（インデックスで保持）
  let curIdx = segs.findIndex((s) => frame >= s.startFrame && frame < s.startFrame + s.durFrames);
  if (curIdx < 0) { curIdx = 0; for (let i = 0; i < segs.length; i++) if (segs[i].startFrame <= frame) curIdx = i; }
  const current = segs[curIdx];

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

  // 章バナー／コンテンツカードの出現アニメ用の起点フレーム
  const chapterStart = Math.max(0, ...seTriggers.transition.filter((f) => f <= frame));
  const telopHits = seTriggers.telop.filter((f) => f <= frame);
  const telopStart = telopHits.length ? telopHits[telopHits.length - 1] : current.startFrame;
  const chapterProg = interpolate(frame - chapterStart, [0, 12], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const telopProg = interpolate(frame - telopStart, [0, 10], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const imageStart = imageStarts[curIdx] ?? current.startFrame;
  const imageProg = interpolate(frame - imageStart, [0, 12], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  // テロップ: 1行目=見出し、2行目以降=箇条書き
  const telopLines = current.telop || [];
  const telopHead = telopLines[0];
  const telopItems = telopLines.slice(1).map((t) => t.replace(/^[-・]\s*/, ''));

  const BRAND = '#28c868', BRAND_DARK = '#1c9e50', INK = '#22303f';

  return (
    <AbsoluteFill style={{ fontFamily: '"Inter","Hiragino Sans","Yu Gothic",sans-serif', background: `linear-gradient(135deg, ${bg[0]}, ${bg[1]})` }}>
      {/* BGM（ループ＋フェードイン/アウト）*/}
      {BGM && (
        <Audio
          src={staticFile(BGM)}
          loop
          volume={(f) =>
            BGM_VOLUME *
            interpolate(f, [0, BGM_FADE, durationInFrames - BGM_FADE, durationInFrames], [0, 1, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
          }
        />
      )}

      {/* 効果音（章替わり＝場面転換／テロップ出現＝ポンッ）*/}
      {SE.transition && seTriggers.transition.map((f, i) => (
        <Sequence key={'set' + i} from={f} durationInFrames={fps * 3}>
          <Audio src={staticFile(SE.transition)} volume={SE_VOLUME} />
        </Sequence>
      ))}
      {SE.telop && seTriggers.telop.map((f, i) => (
        <Sequence key={'sep' + i} from={f + 3} durationInFrames={fps * 2}>
          <Audio src={staticFile(SE.telop)} volume={SE_VOLUME} />
        </Sequence>
      ))}

      {/* 音声（各セグメントをオフセット配置）*/}
      {segs.map((s) => s.audio ? (
        <Sequence key={s.seq} from={s.startFrame} durationInFrames={s.durFrames + 4}>
          <Audio src={staticFile(s.audio)} />
        </Sequence>
      ) : null)}

      {/* 章タイトル（バナー）*/}
      <div
        style={{
          position: 'absolute', top: 44, left: '50%',
          transform: `translateX(-50%) translateY(${(1 - chapterProg) * -14}px)`,
          opacity: chapterProg,
          padding: '12px 40px', borderRadius: 999,
          background: `linear-gradient(135deg, ${BRAND}, ${BRAND_DARK})`,
          color: '#fff', fontSize: 36, fontWeight: 800, letterSpacing: 1.5,
          boxShadow: `0 10px 28px ${BRAND_DARK}66`, border: '3px solid rgba(255,255,255,0.55)',
          whiteSpace: 'nowrap',
        }}
      >
        {current.chapter}
      </div>

      {/* 実画像ショーケース（アプリのスクショ等）*/}
      {current.image && (
        <div
          style={{
            position: 'absolute', top: 134, left: '50%',
            transform: `translateX(-50%) translateY(${(1 - imageProg) * 18}px) scale(${interpolate(imageProg, [0, 1], [0.96, 1])})`,
            opacity: imageProg, textAlign: 'center',
          }}
        >
          <Img
            src={staticFile(current.image)}
            style={{ display: 'block', maxHeight: 548, maxWidth: width * 0.5, borderRadius: 22, objectFit: 'contain', boxShadow: '0 24px 60px rgba(0,0,0,0.32)' }}
          />
          {telopHead && (
            <div style={{ marginTop: 14, display: 'inline-block', background: `linear-gradient(135deg, ${BRAND}, ${BRAND_DARK})`, color: '#fff', fontSize: 26, fontWeight: 800, padding: '8px 26px', borderRadius: 999, boxShadow: `0 6px 16px ${BRAND_DARK}66` }}>{telopHead}</div>
          )}
        </div>
      )}

      {/* コンテンツカード（テロップ）※実画像があるときは画像を優先 */}
      {!current.image && telopLines.length > 0 && (
        telopItems.length === 0 ? (
          // 見出しのみ → 中央の大見出し
          <div
            style={{
              position: 'absolute', top: 250, left: '50%',
              transform: `translateX(-50%) scale(${interpolate(telopProg, [0, 1], [0.94, 1])})`,
              opacity: telopProg, maxWidth: width * 0.52, textAlign: 'center',
              background: '#fffffff2', borderRadius: 24, padding: '30px 50px',
              boxShadow: '0 18px 50px rgba(0,0,0,0.18)', border: `3px solid ${BRAND}`,
              fontSize: 44, fontWeight: 800, color: INK, lineHeight: 1.4,
            }}
          >
            {telopHead}
          </div>
        ) : (
          // 見出し＋箇条書き → コンテンツパネル
          <div
            style={{
              position: 'absolute', top: 150, left: '50%',
              transform: `translateX(-50%) translateY(${(1 - telopProg) * 16}px)`,
              opacity: telopProg, width: width * 0.5,
              background: '#fffffff5', borderRadius: 26, overflow: 'hidden',
              boxShadow: '0 20px 55px rgba(0,0,0,0.2)', border: '1px solid #00000010',
            }}
          >
            {/* ヘッダー帯 */}
            <div style={{ background: `linear-gradient(135deg, ${BRAND}, ${BRAND_DARK})`, color: '#fff', fontSize: 38, fontWeight: 800, padding: '18px 34px', letterSpacing: 0.5 }}>
              {telopHead}
            </div>
            {/* 箇条書き */}
            <div style={{ padding: '20px 34px 26px' }}>
              {telopItems.map((t, i) => {
                const op = interpolate(frame - telopStart, [10 + i * 5, 18 + i * 5], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
                const dx = interpolate(frame - telopStart, [10 + i * 5, 18 + i * 5], [18, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
                return (
                  <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 14, fontSize: 35, lineHeight: 1.5, color: INK, fontWeight: 600, opacity: op, transform: `translateX(${dx}px)`, marginBottom: i === telopItems.length - 1 ? 0 : 10 }}>
                    <span style={{ color: BRAND, fontWeight: 900, flexShrink: 0 }}>✓</span>
                    <span>{t}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )
      )}

      {/* キャラ（めたん左／ずんだもん右）*/}
      <div style={{ position: 'absolute', bottom: 150, left: 60 }}>
        <Character char="metan" active={current.speaker === 'metan'} expr={current.expr} mouthOpen={current.speaker === 'metan' && mouthOpen} frame={frame} />
      </div>
      <div style={{ position: 'absolute', bottom: 150, right: 60 }}>
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
