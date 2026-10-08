import React from 'react';
import { Img, staticFile } from 'remotion';
import { SCREEN_H, SCREEN_W, STATUS_H } from '../promo/Phone.jsx';
import { StatusBar2 } from '../promo2/Device.jsx';
import SCREENS from './screens.json';
import RECTS from './rects.json';
import RECS from './recs.json';
import { Tap } from '../promo2/overlays.jsx';

// 最高傑作版で撮ったアプリの実画面（public/film/screens）を端末やカードにして見せる部品
export const SHOT_H = 770;
const HOME_STRIP = SCREEN_H - STATUS_H - SHOT_H; // 20

export const shotSrc = (name, thumb = false) => staticFile(thumb ? `film/thumbs/${name}.jpg` : `film/screens/${name}.png`);
export const metaOf = (name) => SCREENS[name] || { css_h: SHOT_H, top: '#f6fafd', bottom: '#f6fafd', dark: false, header: 54, tab_top: 720 };

// 画面の中のカード（撮影時に記録した、角丸で背景のある箱）を文字で探す。いちばん小さいもの
export const rectOf = (name, text, { minW = 0 } = {}) => {
  const list = (RECTS[name] || []).filter((r) => r.t.includes(text) && r.w >= minW);
  list.sort((a, b) => a.w * a.h - b.w * b.h);
  return list[0] || null;
};

// 実画面1枚（ステータスバーとホームインジケータは描く）。縦長の画面は見出しとタブバーを固定して中身を scroll(px) する
// thumb: 小さく見せるとき（機能の壁など）は 1倍の縮小版を使う（大きい画像を何十枚も読むと書き出しのメモリが足りなくなる）
export const FilmScreen = ({ name, scroll = 0, thumb = false, children }) => {
  const m = metaOf(name);
  const src = shotSrc(name, thumb);
  const tall = m.css_h > SHOT_H + 1;
  const ink = m.dark ? '#ffffff' : '#0e2030';
  const head = m.header || 54;
  const tab = m.tab_top ? m.css_h - m.tab_top : 50;
  return (
    <div style={{ position: 'absolute', inset: 0, background: m.top, overflow: 'hidden' }}>
      {!tall ? (
        <Img maxRetries={8} src={src} style={{ position: 'absolute', left: 0, top: STATUS_H, width: SCREEN_W, height: SHOT_H }} />
      ) : (
        <>
          <div style={{ position: 'absolute', left: 0, top: STATUS_H + head, width: SCREEN_W, height: SHOT_H - head - tab, overflow: 'hidden' }}>
            <Img maxRetries={8} src={src} style={{ position: 'absolute', left: 0, top: -head - Math.max(0, Math.min(scroll, m.css_h - SHOT_H)), width: SCREEN_W, height: m.css_h }} />
          </div>
          <div style={{ position: 'absolute', left: 0, top: STATUS_H, width: SCREEN_W, height: head, overflow: 'hidden' }}>
            <Img maxRetries={8} src={src} style={{ position: 'absolute', left: 0, top: 0, width: SCREEN_W, height: m.css_h }} />
          </div>
          <div style={{ position: 'absolute', left: 0, top: STATUS_H + SHOT_H - tab, width: SCREEN_W, height: tab, overflow: 'hidden' }}>
            <Img maxRetries={8} src={src} style={{ position: 'absolute', left: 0, top: -(m.css_h - tab), width: SCREEN_W, height: m.css_h }} />
          </div>
        </>
      )}
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: HOME_STRIP, background: m.bottom }} />
      {children}
      <StatusBar2 color={ink} />
      <div style={{ position: 'absolute', bottom: 7, left: SCREEN_W / 2 - 67, width: 134, height: 5, borderRadius: 3, background: ink, opacity: 0.85, zIndex: 95 }} />
    </div>
  );
};

// 画面の切り替え。screens: [{ at, name, scroll?, el?, mode?: 'slide' | 'fade' | 'theme' }]、操作動画は { at, rec, from?, until? }
// （動画のコマ = from + (f − at)。until を過ぎたらそのコマで止める）。
// theme は同じ画面のテーマ違いへ、斜めの光の帯が通り過ぎながら塗り替わる
export const FilmFlow = ({ f, screens, slide = 12 }) => (
  <>
    {screens.map((s, i) => {
      const next = screens[i + 1];
      const sIn = s.slide || slide;
      const sOut = next?.slide || slide;
      if (i > 0 && f < s.at - sIn) return null;
      if (next && f >= next.at + 2) return null;
      const tIn = i === 0 ? 1 : Math.max(0, Math.min(1, (f - (s.at - sIn)) / sIn));
      const e = s.mode === 'theme' ? (tIn < 0.5 ? 4 * tIn ** 3 : 1 - (-2 * tIn + 2) ** 3 / 2) : 1 - (1 - tIn) ** 3;
      const tOut = next ? Math.max(0, Math.min(1, (f - (next.at - sOut)) / sOut)) : 0;
      const eo = 1 - (1 - tOut) ** 3;
      const mode = s.mode || 'slide';
      const nextMode = next?.mode || 'slide';
      const body = s.el ? s.el : s.rec ? <RecScreen name={s.rec} frame={Math.min(s.until ?? Infinity, (s.from || 0) + (f - s.at))} taps /> : <FilmScreen name={s.name} scroll={typeof s.scroll === 'function' ? s.scroll(f) : s.scroll || 0} />;
      let style;
      if (mode === 'fade') style = { opacity: e };
      else if (mode === 'theme') {
        // 左上から右下へ斜めに塗り替える（帯の位置 w は -20%〜120%）
        const w = -20 + 140 * e;
        const mask = `linear-gradient(120deg, #000 ${w - 12}%, transparent ${w}%)`;
        style = e < 1 ? { WebkitMaskImage: mask, maskImage: mask } : {};
      } else style = { transform: `translateX(${(1 - e) * SCREEN_W - (nextMode === 'slide' ? eo * 90 : 0)}px)`, boxShadow: e < 1 ? '-24px 0 40px -18px rgba(14,32,48,0.35)' : 'none' };
      return (
        <div key={i} style={{ position: 'absolute', inset: 0, ...style }}>
          {body}
          {mode === 'theme' && e > 0 && e < 1 && (
            <div style={{
              position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 110, mixBlendMode: 'screen',
              background: `linear-gradient(120deg, rgba(255,255,255,0) ${-20 + 140 * e - 16}%, rgba(255,255,255,0.75) ${-20 + 140 * e - 4}%, rgba(255,255,255,0) ${-20 + 140 * e + 2}%)`,
            }} />
          )}
          {eo > 0 && nextMode === 'slide' && <div style={{ position: 'absolute', inset: 0, background: `rgba(14,32,48,${0.14 * eo})` }} />}
        </div>
      );
    })}
  </>
);

// スクショの一部を切り出したカード（画面から浮き上がる吹き出し用）。r は CSS px の { x, y, w, h }
export const Crop = ({ name, r, scale = 1.6, radius = 14, pad = 0, style }) => {
  const m = metaOf(name);
  if (!r) return null;
  const x = r.x - pad;
  const y = r.y - pad;
  const w = r.w + pad * 2;
  const h = r.h + pad * 2;
  return (
    <div style={{ position: 'relative', width: w * scale, height: h * scale, borderRadius: radius, overflow: 'hidden', background: m.top, ...style }}>
      <Img maxRetries={8} src={shotSrc(name)} style={{ position: 'absolute', left: -x * scale, top: -y * scale, width: SCREEN_W * scale, height: m.css_h * scale }} />
    </div>
  );
};

// ノートPC（PC 画面のスクショ 1440x900 を入れる）。x, y は画面の左上、w は画面の幅
export const Laptop = ({ x, y, w = 1120, src, opacity = 1, transform, children }) => {
  const h = (w * 900) / 1440;
  const bez = Math.round(w * 0.022);
  return (
    <div style={{ position: 'absolute', left: x - bez, top: y - bez, opacity, transform, transformOrigin: '50% 100%' }}>
      <div style={{
        width: w + bez * 2, height: h + bez * 2 + 8, borderRadius: `${bez * 1.4}px ${bez * 1.4}px 6px 6px`, boxSizing: 'border-box', padding: bez,
        background: 'linear-gradient(160deg, #2b313b 0%, #12161c 60%)', boxShadow: '0 50px 90px -40px rgba(14,32,48,0.55), inset 0 0 0 1.5px #4a5262',
      }}>
        <div style={{ position: 'relative', width: w, height: h, borderRadius: 4, overflow: 'hidden', background: '#fff' }}>
          {src && <Img maxRetries={8} src={staticFile(src)} style={{ width: w, height: h }} />}
          {children}
        </div>
      </div>
      {/* 本体（キーボード側の縁） */}
      <div style={{ position: 'relative', left: -w * 0.06, width: w * 1.12 + bez * 2, height: Math.round(w * 0.028), borderRadius: '2px 2px 22px 22px', background: 'linear-gradient(180deg, #d9dee5 0%, #aeb6c1 60%, #8c95a1 100%)', boxShadow: '0 30px 40px -24px rgba(14,32,48,0.6)' }}>
        <div style={{ position: 'absolute', left: '50%', top: 0, width: w * 0.16, height: 8, marginLeft: -w * 0.08, borderRadius: '0 0 8px 8px', background: '#9aa3ae' }} />
      </div>
    </div>
  );
};


// ── アプリを実際に操作している動画（capture/record_film.mjs で1コマずつ撮った連番）────────────
export const recMeta = (name) => RECS[name] || { frames: 1, top: ['#ffffff'], bottom: ['#ffffff'], dark: [0], taps: [], cards: {}, marks: [] };
// thumb: 機能の壁などで小さく流すときは、1倍・偶数コマだけの縮小版（capture/make_rec_thumbs.py）
export const recSrc = (name, i, thumb = false) => staticFile(thumb ? `film/rec_thumbs/${name}/${String(i - (i % 2)).padStart(4, '0')}.jpg` : `film/rec/${name}/${String(i).padStart(4, '0')}.jpg`);
const clampF = (name, frame) => Math.max(0, Math.min(recMeta(name).frames - 1, Math.round(frame)));

// 操作動画の1コマを端末の画面として出す。taps: 撮影でタップした位置に印を出す。thumb: 縮小版を使う
export const RecScreen = ({ name, frame, taps = false, thumb = false, children }) => {
  const R = recMeta(name);
  const i = clampF(name, frame);
  const top = R.top[i] || '#ffffff';
  const ink = R.dark[i] ? '#ffffff' : '#0e2030';
  return (
    <div style={{ position: 'absolute', inset: 0, background: top, overflow: 'hidden' }}>
      <Img maxRetries={8} src={recSrc(name, i, thumb)} style={{ position: 'absolute', left: 0, top: STATUS_H, width: SCREEN_W, height: SHOT_H }} />
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: HOME_STRIP, background: R.bottom[i] || top }} />
      {taps && R.taps.map(([tf, x, y]) => <Tap key={`${tf}-${x}-${y}`} x={x} y={STATUS_H + y} f={frame} at={tf} />)}
      {children}
      <StatusBar2 color={ink} />
      <div style={{ position: 'absolute', bottom: 7, left: SCREEN_W / 2 - 67, width: 134, height: 5, borderRadius: 3, background: ink, opacity: 0.85, zIndex: 95 }} />
    </div>
  );
};

// 操作動画の1コマの一部を切り出したカード（分解図・浮き上がるカード用）。r は CSS px の { x, y, w, h }
export const RecCrop = ({ name, frame, r, scale = 1, radius = 14, style }) => {
  if (!r) return null;
  const i = clampF(name, frame);
  return (
    <div style={{ position: 'relative', width: r.w * scale, height: r.h * scale, borderRadius: radius, overflow: 'hidden', background: recMeta(name).top[i], ...style }}>
      <Img maxRetries={8} src={recSrc(name, i)} style={{ position: 'absolute', left: -r.x * scale, top: -r.y * scale, width: SCREEN_W * scale, height: SHOT_H * scale }} />
    </div>
  );
};
// 画面の切り替え（FilmFlow の screens）の中の操作動画で、タップした瞬間の映像のフレーム（効果音を合わせる）。
// 次の画面に替わるまでに起きるものだけ
export const flowTaps = (screens) => screens.flatMap((s, i) => {
  if (!s.rec) return [];
  const end = screens[i + 1] ? screens[i + 1].at : Infinity;
  return recMeta(s.rec).taps.map(([tf]) => s.at + tf - (s.from || 0)).filter((at) => at >= s.at && at < end);
});

// 撮影中に記録したカードの位置（文字で探す。いちばん小さいもの）
export const recCard = (name, frame, text) => {
  const list = (recMeta(name).cards[String(frame)] || []).filter((c) => c.t.includes(text));
  list.sort((a, b) => a.w * a.h - b.w * b.h);
  return list[0] || null;
};
