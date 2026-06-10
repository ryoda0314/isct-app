import React, { useState, useRef, useEffect } from "react";
import { t } from "../i18n.js";
import { T } from "../theme.js";
import { I } from "../icons.jsx";
import { useMusicPlayer } from "../hooks/useMusicPlayer.js";
import { NowPlaying } from "./NowPlaying.jsx";

const fmtTime = (s) => {
  if (!Number.isFinite(s) || s < 0) s = 0;
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
};

// 常駐ミニプレイヤー。曲が選択されている間だけ表示し、どの画面でも操作できる。
// mob: モバイルでは下部ナビ(MNav)の上に重なるよう bottom を上げる。
// onOpen: タップでミュージック画面を開く（通常 () => setView("music")）。
// 下部に入力欄(コンポーザー)を持つビュー。ここではミニプレイヤーが入力欄と被るので隠す。
// 音楽はReact外エンジンで鳴り続けるため、再生は止まらない（ロック画面/ミュージック画面で操作可）。
function hasBottomComposer(view, ch) {
  if (view === "dm" || view === "circles" || view === "freshman") return true;
  if ((view === "course" || view === "dept") && ch === "chat") return true;
  return false;
}

export function MiniPlayer({ mob = false, view, ch, onOpen }) {
  const { track, playing, currentTime, duration, toggle, next, prev, seek } = useMusicPlayer();
  const [expanded, setExpanded] = useState(false);
  // 左右スワイプで端に最小化。最小化中は小さなピルだけ表示し、タップでミニプレイヤーに戻す。
  const [minimized, setMinimized] = useState(false);
  const [minSide, setMinSide] = useState("right"); // 最小化したときに寄せる端
  const [dragX, setDragX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const startXRef = useRef(0);
  const startYRef = useRef(0);
  const movedRef = useRef(false);     // スワイプ判定。タップ系 onClick の誤発火を防ぐ
  const SWIPE_THRESHOLD = 80;
  // 最小化ピルの自由配置。pos=null のうちは端ドック(モーフ既定位置)、ドラッグすると {x,y}(px,左上) で自由移動。
  const [pos, setPos] = useState(null);
  const [pillDragging, setPillDragging] = useState(false);
  const pillRef = useRef({ sx: 0, sy: 0, px: 0, py: 0, moved: false });
  const PILL = 48;
  const trackId = track?.id;
  // 新しい曲を選んだら、隠れたままにならないよう最小化を解除（配置もリセット）
  useEffect(() => { setMinimized(false); setPos(null); }, [trackId]);

  // 全画面プレイヤーを開いている間は被り問題が無いので、コンポーザービューでも隠さない
  if (!track) return null;
  if (!expanded && hasBottomComposer(view, ch)) return null;

  const dur = duration || track.duration || 0;
  const pct = dur > 0 ? Math.min(100, (currentTime / dur) * 100) : 0;

  // モバイル: 下部ナビ(高さ ~56) + セーフエリアの上に少し浮かせて配置
  const bottom = mob ? "calc(56px + env(safe-area-inset-bottom, 0px) + 6px)" : 10;

  // スワイプ進捗 0→1。これに連動して幅・角丸・不透明度を変化させ、ピル(最小表示)へ連続的に変形させる
  const swipeP = Math.min(1, Math.abs(dragX) / 180);

  // 左右スワイプ検出（指に追従。閾値を超えて離すとその方向の端へ最小化）
  const onPointerDown = (e) => {
    startXRef.current = e.clientX;
    startYRef.current = e.clientY;
    movedRef.current = false;
    setDragging(true);
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch {}
  };
  const onPointerMove = (e) => {
    if (!dragging) return;
    const dx = e.clientX - startXRef.current;
    const dy = e.clientY - startYRef.current;
    // 横移動が縦移動より大きいときだけ横スワイプとして扱う
    if (Math.abs(dx) > 6 && Math.abs(dx) > Math.abs(dy)) movedRef.current = true;
    if (movedRef.current) setDragX(dx);
  };
  const endDrag = () => {
    if (!dragging) return;
    setDragging(false);
    if (Math.abs(dragX) > SWIPE_THRESHOLD) {
      setMinSide(dragX < 0 ? "left" : "right");
      setMinimized(true);
    }
    setDragX(0);
    // onClick ガードが movedRef を読んだ後にリセット
    setTimeout(() => { movedRef.current = false; }, 0);
  };

  // ── 最小化ピルの移動（自由ドラッグ／離すと近い縦端へスナップ）──
  const clampPos = (x, y) => {
    const vw = window.innerWidth, vh = window.innerHeight;
    return {
      x: Math.max(8, Math.min(vw - PILL - 8, x)),
      y: Math.max(8, Math.min(vh - PILL - 8, y)),
    };
  };
  const onPillDown = (e) => {
    // 現在の実座標(端ドック位置)を起点にするのでドック→自由移動が連続。
    // 傾斜中は getBoundingClientRect が回転後の外接矩形を返すため、回転不変な「中心」から左上を逆算する。
    const r = e.currentTarget.getBoundingClientRect();
    const x = r.left + r.width / 2 - PILL / 2;
    const y = r.top + r.height / 2 - PILL / 2;
    pillRef.current = { sx: e.clientX, sy: e.clientY, px: x, py: y, moved: false };
    setPos({ x, y });
    setPillDragging(true);
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch {}
  };
  const onPillMove = (e) => {
    if (!pillDragging) return;
    const s = pillRef.current;
    const dx = e.clientX - s.sx, dy = e.clientY - s.sy;
    if (Math.abs(dx) > 4 || Math.abs(dy) > 4) s.moved = true;
    setPos(clampPos(s.px + dx, s.py + dy));
  };
  const onPillUp = () => {
    if (!pillDragging) return;
    setPillDragging(false);
    if (!pillRef.current.moved) {        // 動かさなければタップ扱い → 復帰
      setPos(null);
      setMinimized(false);
      return;
    }
    // 横は近い端へスナップ（縦は離した位置のまま）
    setPos((prev) => {
      if (!prev) return prev;
      const vw = window.innerWidth;
      const cx = prev.x + PILL / 2;
      return { x: cx < vw / 2 ? 8 : vw - PILL - 8, y: prev.y };
    });
  };

  // 端への近さで傾ける（中央付近は直立、端ほど傾斜が強くなる）。
  // 自由配置(pos)中はピル中心から、端ドック中は寄せた端(端から32px)から算出。
  let tilt = 0;
  if (minimized) {
    const vw = window.innerWidth;
    const cx = pos ? pos.x + PILL / 2 : (minSide === "left" ? 32 : vw - 32);
    const edgeDist = Math.min(cx, vw - cx);            // 最寄りの縦端までの距離
    const near = Math.max(0, Math.min(1, 1 - edgeDist / 90));
    tilt = (cx < vw / 2 ? -1 : 1) * near * 16;         // 左端は左へ、右端は右へ 最大±16°
  }

  if (expanded) {
    return <NowPlaying onClose={() => setExpanded(false)} onOpenLibrary={onOpen} />;
  }

  // 一つの要素を progress(p) で連続変形させ、最小化(ピル)を p:1 の状態として扱う。
  // これで「別の丸い要素へ切り替わる」不連続を無くし、中央へ寄らず端へ向かって縮む。
  const p = minimized ? 1 : swipeP;
  const side = minimized ? minSide : (dragX < 0 ? "left" : "right");
  // 中央(50%)→寄せる端(端から24+8=32px)へ中心位置を連続移動。寄せる方向へ縮んでいく。
  const leftCSS = side === "left"
    ? `calc(${(50 * (1 - p)).toFixed(2)}% + ${(32 * p).toFixed(1)}px)`
    : `calc(${(50 * (1 - p) + 100 * p).toFixed(2)}% - ${(32 * p).toFixed(1)}px)`;
  const contentOpacity = Math.max(0, 1 - p * 2);      // p>=0.5 で内容は完全に消える
  const coverOpacity = Math.max(0, (p - 0.5) / 0.5);  // p>=0.5 からカバーが現れる
  const xTransition = "left .28s ease, width .28s ease, height .28s ease, border-radius .28s ease, opacity .28s ease, transform .28s ease";

  // 配置スタイル: 最小化して掴んだ後(pos有)は自由座標+端傾斜、それ以外は端ドック(モーフ)位置(p=1で傾斜)
  const freePill = minimized && pos;
  const posStyle = freePill
    ? { left: pos.x, top: pos.y, bottom: "auto",
        transform: `rotate(${tilt.toFixed(1)}deg)`,
        // 位置は指に即追従、傾斜だけは滑らかに変化させる
        transition: pillDragging ? "transform .15s ease" : "left .25s ease, top .25s ease, transform .25s ease" }
    : { left: leftCSS, bottom, transform: `translateX(-50%) rotate(${tilt.toFixed(1)}deg)`,
        transition: dragging ? "none" : xTransition };

  return (
    <div
      onPointerDown={minimized ? onPillDown : onPointerDown}
      onPointerMove={minimized ? onPillMove : onPointerMove}
      onPointerUp={minimized ? onPillUp : endDrag}
      onPointerCancel={minimized ? onPillUp : endDrag}
      title={minimized ? t("miniplayer.pillHint") : undefined}
      style={{
        position: "fixed",
        ...posStyle,
        touchAction: minimized ? "none" : "pan-y",
        width: `calc(min(960px, 100% - 16px) * ${(1 - p).toFixed(3)} + ${(48 * p).toFixed(1)}px)`,
        height: `${(62 * (1 - p) + 48 * p).toFixed(1)}px`,
        zIndex: 60,
        background: T.bg2,
        border: `1px solid ${(minimized && playing) ? T.accent : T.bd}`,
        borderRadius: 16 + p * 8,
        overflow: "hidden",
        boxShadow: "0 6px 20px rgba(0,0,0,0.22)",
        cursor: minimized ? (pillDragging ? "grabbing" : "grab") : "default",
      }}
    >
      {/* 通常のミニプレイヤー内容（縮小に合わせてフェードアウト） */}
      <div style={{ opacity: contentOpacity, pointerEvents: p > 0.5 ? "none" : undefined, transition: dragging ? "none" : "opacity .28s ease" }}>
        {/* シークバー（クリック/タップでその位置へ） */}
        <div
          onClick={(e) => {
            if (movedRef.current) return;
            const r = e.currentTarget.getBoundingClientRect();
            if (dur > 0) seek(((e.clientX - r.left) / r.width) * dur);
          }}
          style={{ height: 4, background: T.bg3, cursor: dur > 0 ? "pointer" : "default", position: "relative" }}
        >
          <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${pct}%`, background: T.accent }} />
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", maxWidth: 920, margin: "0 auto" }}>
          {/* カバー + タイトル（タップで全画面プレイヤーへ） */}
          <button
            onClick={() => { if (!movedRef.current) setExpanded(true); }}
            style={{ display: "flex", alignItems: "center", gap: 10, flex: 1, minWidth: 0, background: "none", border: "none", cursor: "pointer", padding: 0, textAlign: "left" }}
          >
            <div style={{ width: 40, height: 40, borderRadius: 8, flexShrink: 0, overflow: "hidden", background: `linear-gradient(145deg, ${T.accent}, ${T.accent}99)`, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff" }}>
              {track.cover?.url
                ? <img src={track.cover.url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                : I.music}
            </div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: T.txH, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{track.title || t("miniplayer.untitled")}</div>
              <div style={{ fontSize: 11, color: T.txD, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {track.artist || "ScienceTokyo Music"} · {fmtTime(currentTime)} / {fmtTime(dur)}
              </div>
            </div>
          </button>

          {/* 操作 */}
          <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
            <button onClick={() => { if (!movedRef.current) prev(); }} title={t("miniplayer.prev")} style={btn}>{I.skipBack}</button>
            <button onClick={() => { if (!movedRef.current) toggle(); }} title={playing ? t("miniplayer.pause") : t("miniplayer.play")} style={{ ...btn, width: 40, height: 40, background: T.accent, color: "#fff", borderRadius: 20 }}>
              {playing ? I.pause : I.play}
            </button>
            <button onClick={() => { if (!movedRef.current) next(); }} title={t("miniplayer.next")} style={btn}>{I.skipFwd}</button>
          </div>
        </div>
      </div>

      {/* ピル時のカバー（縮小に合わせてフェードイン。p:1 で円形のカバーになる） */}
      {p > 0 && (
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", opacity: coverOpacity, pointerEvents: "none", transition: dragging ? "none" : "opacity .28s ease" }}>
          {track.cover?.url
            ? <img src={track.cover.url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            : <span style={{ display: "flex", color: T.accent }}>{I.music}</span>}
        </div>
      )}
    </div>
  );
}

const btn = {
  display: "flex", alignItems: "center", justifyContent: "center",
  width: 34, height: 34, borderRadius: 17, border: "none",
  background: "transparent", color: T.txH, cursor: "pointer",
};
