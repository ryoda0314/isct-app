import React, { useState, useEffect, useRef } from "react";
import { T } from "../theme.js";
import { I } from "../icons.jsx";
import { useMusicPlayer } from "../hooks/useMusicPlayer.js";

const fmt = (s) => {
  if (!Number.isFinite(s) || s < 0) s = 0;
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
};

// Apple Music 風の全画面「再生中」画面。ミニプレイヤーをタップで開く。
// onClose: 閉じる / onOpenLibrary: ライブラリ(キュー)を開く
export function NowPlaying({ onClose, onOpenLibrary }) {
  const { track, playing, currentTime, duration, repeat, shuffle, volume,
    toggle, next, prev, seek, setVolume, toggleRepeat, toggleShuffle } = useMusicPlayer();

  // シークは「ドラッグ中だけ React の再レンダリングを介さず DOM を直接更新」して遅延を消す。
  // 再生中は timeupdate(約4Hz) で再レンダリングが走るため、controlled だと value/塗り/時刻が
  // 毎回上書きされて指の動きと競合する。そこで uncontrolled にして ref で直接いじる。
  const seekRef = useRef(null);
  const elapsedRef = useRef(null);
  const remainRef = useRef(null);
  const draggingSeekRef = useRef(false);

  const fmtTimes = (cur, dur) => {
    if (elapsedRef.current) elapsedRef.current.textContent = fmt(cur);
    if (remainRef.current) remainRef.current.textContent = "-" + fmt(Math.max(0, dur - cur));
  };
  // 再生に追従して表示を更新（ドラッグ中は触らない＝指の動きを邪魔しない）
  useEffect(() => {
    if (draggingSeekRef.current) return;
    const el = seekRef.current;
    const d = duration || track?.duration || 0;
    if (el) {
      el.max = String(d || 0);
      const ct = Math.min(currentTime, d || 0);
      el.value = String(ct);
      el.style.setProperty("--pct", (d > 0 ? (ct / d) * 100 : 0) + "%");
    }
    fmtTimes(Math.min(currentTime, d || 0), d);
  });
  useEffect(() => { draggingSeekRef.current = false; }, [track?.id]);

  // 下スワイプで閉じる（指に追従。一定以上下げて離すと閉じ、途中で離すと戻る）
  const startYRef = useRef(0);
  const movedRef = useRef(false);
  const [dragY, setDragY] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [closing, setClosing] = useState(false);
  const CLOSE_THRESHOLD = 110;

  const onPointerDown = (e) => {
    // スライダーやボタンの操作はドラッグ閉じの対象外
    if (e.target.closest("button, input")) return;
    startYRef.current = e.clientY;
    movedRef.current = false;
    setDragging(true);
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch {}
  };
  const onPointerMove = (e) => {
    if (!dragging) return;
    const dy = e.clientY - startYRef.current;
    if (Math.abs(dy) > 6) movedRef.current = true;
    setDragY(dy > 0 ? dy : dy * 0.25); // 上方向は抵抗を付ける
  };
  const endDrag = () => {
    if (!dragging) return;
    setDragging(false);
    if (dragY > CLOSE_THRESHOLD) setClosing(true); // 閉じるアニメへ
    else setDragY(0);                              // 元に戻す
  };
  const onTransitionEnd = (e) => {
    if (closing && e.propertyName === "transform") onClose?.();
  };

  if (!track) return null;
  const dur = duration || track.duration || 0;
  const cover = track.cover?.url;
  const vol = volume ?? 1;

  return (
    <div
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onTransitionEnd={onTransitionEnd}
      style={{
        position: "fixed", inset: 0, zIndex: 200,
        display: "flex", flexDirection: "column",
        color: "#fff", overflow: "hidden",
        paddingTop: "env(safe-area-inset-top, 0px)",
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
        touchAction: "none",
        transform: `translateY(${closing ? "100%" : Math.max(0, dragY) + "px"})`,
        transition: dragging ? "none" : "transform 0.32s cubic-bezier(0.22,0.61,0.36,1)",
        willChange: "transform",
        borderTopLeftRadius: dragY > 0 || closing ? 16 : 0,
        borderTopRightRadius: dragY > 0 || closing ? 16 : 0,
      }}
    >
      {/* 背景: カバーをぼかして敷き、暗いスクリムを重ねる（カバーが無ければグラデ） */}
      <div style={{ position: "absolute", inset: 0, zIndex: -2, background: cover ? "#1a2733" : `linear-gradient(160deg, ${T.accent}cc, #1a2230)` }}>
        {cover && <img src={cover} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", filter: "blur(40px) brightness(0.7) saturate(1.2)", transform: "scale(1.2)" }} />}
      </div>
      <div style={{ position: "absolute", inset: 0, zIndex: -1, background: "linear-gradient(to bottom, rgba(0,0,0,0.25), rgba(0,0,0,0.55))" }} />

      {/* 上部: ハンドル（下スワイプで閉じる / タップでも閉じる）。button だとドラッグ対象外になるので div で実装 */}
      <div
        onClick={() => { if (!movedRef.current) onClose?.(); }}
        role="button" aria-label="閉じる"
        style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "12px 0 8px", cursor: "grab" }}
      >
        <div style={{ width: 40, height: 5, borderRadius: 3, background: "rgba(255,255,255,0.55)" }} />
      </div>

      {/* 中央コンテンツ */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", gap: 22, padding: "0 28px", maxWidth: 460, width: "100%", margin: "0 auto", minHeight: 0 }}>
        {/* カバー */}
        <div style={{ width: "100%", aspectRatio: "1 / 1", maxHeight: "46vh", borderRadius: 14, overflow: "hidden", alignSelf: "center", boxShadow: "0 18px 50px rgba(0,0,0,0.5)", background: `linear-gradient(145deg, ${T.accent}, ${T.accent}88)`, display: "flex", alignItems: "center", justifyContent: "center" }}>
          {cover
            ? <img src={cover} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            : <span style={{ opacity: 0.85, transform: "scale(3)" }}>{I.music}</span>}
        </div>

        {/* タイトル + お気に入り/… */}
        <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 22, fontWeight: 800, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{track.title}</div>
            <div style={{ fontSize: 18, color: "rgba(255,255,255,0.7)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{track.artist || "ScienceTokyo Music"}</div>
          </div>
        </div>

        {/* シークバー（uncontrolled。ドラッグ中は onInput で DOM 直接更新→遅延ゼロ。離した時だけ engine へ反映） */}
        <div>
          <input
            ref={seekRef}
            className="np-range"
            type="range" min={0} max={dur || 0} step="any" defaultValue={0}
            onPointerDown={() => { draggingSeekRef.current = true; }}
            onInput={(e) => {
              const v = Number(e.currentTarget.value);
              const d = Number(e.currentTarget.max) || 0;
              e.currentTarget.style.setProperty("--pct", (d > 0 ? (v / d) * 100 : 0) + "%");
              fmtTimes(v, d); // 時刻表示も DOM 直接更新（再レンダリングしない）
            }}
            onPointerUp={(e) => { draggingSeekRef.current = false; seek(Number(e.currentTarget.value)); }}
            onPointerCancel={(e) => { draggingSeekRef.current = false; seek(Number(e.currentTarget.value)); }}
            style={{ width: "100%" }}
          />
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "rgba(255,255,255,0.6)", marginTop: 2 }}>
            <span ref={elapsedRef}>0:00</span>
            <span ref={remainRef}>-0:00</span>
          </div>
        </div>

        {/* メイン操作 */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 36 }}>
          <button onClick={prev} aria-label="前へ" style={ctrlBtn()}>{midIcon(I.skipBack)}</button>
          <button onClick={toggle} aria-label={playing ? "一時停止" : "再生"} style={{ ...ctrlBtn(), width: 76, height: 76 }}>
            {playing ? bigIcon(I.pause) : bigIcon(I.play)}
          </button>
          <button onClick={next} aria-label="次へ" style={ctrlBtn()}>{midIcon(I.skipFwd)}</button>
        </div>

        {/* 音量 */}
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ color: "rgba(255,255,255,0.6)", display: "flex" }}>{I.volMin}</span>
          <input
            className="np-range"
            type="range" min={0} max={100} value={Math.round(vol * 100)}
            onChange={(e) => setVolume(Number(e.target.value) / 100)}
            style={{ flex: 1, ["--pct"]: `${vol * 100}%` }}
          />
          <span style={{ color: "rgba(255,255,255,0.6)", display: "flex" }}>{I.volMax}</span>
        </div>

        {/* 下部: シャッフル / リピート / キュー */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-around", paddingTop: 4 }}>
          <button onClick={toggleShuffle} aria-label="シャッフル" style={footBtn(shuffle)}>{I.shuffle}</button>
          <button onClick={toggleRepeat} aria-label="リピート" style={footBtn(repeat !== "off")}>
            <span style={{ position: "relative", display: "flex" }}>
              {I.repeat}
              {repeat === "one" && <span style={{ position: "absolute", right: -6, top: -5, fontSize: 9, fontWeight: 800 }}>1</span>}
            </span>
          </button>
          {onOpenLibrary && <button onClick={() => { onOpenLibrary(); onClose?.(); }} aria-label="ライブラリ" style={footBtn(false)}>{I.queue}</button>}
        </div>
      </div>

      {/* 角丸トラック + 丸つまみ。進捗の塗りは --pct（インラインで指定）でトラックに描く。
          トラック高さ(6px)を明示し、thumb(15px)を margin-top:-4.5px=(6-15)/2 で中央に乗せる。 */}
      <style>{`
        /* touch-action:none でタッチのドラッグをスライダー操作として確実に拾う（スクロールに奪われない）。
           当たり判定を 30px に広げ、見た目のトラックは 6px のまま。つまみは 18px。 */
        .np-range{ -webkit-appearance:none; appearance:none; cursor:pointer; outline:none; background:transparent;
          height:30px; touch-action:none; -webkit-tap-highlight-color:transparent; }
        .np-range::-webkit-slider-runnable-track{ -webkit-appearance:none; height:6px; border-radius:3px; border:none;
          background:linear-gradient(to right, #fff var(--pct,0%), rgba(255,255,255,0.28) var(--pct,0%)); }
        .np-range::-moz-range-track{ height:6px; border-radius:3px; border:none;
          background:linear-gradient(to right, #fff var(--pct,0%), rgba(255,255,255,0.28) var(--pct,0%)); }
        .np-range::-webkit-slider-thumb{ -webkit-appearance:none; appearance:none; width:18px; height:18px; margin-top:-6px; border-radius:50%; background:#fff; box-shadow:0 1px 5px rgba(0,0,0,.5); }
        .np-range::-moz-range-thumb{ width:18px; height:18px; border:none; border-radius:50%; background:#fff; box-shadow:0 1px 5px rgba(0,0,0,.5); }
        .np-range:active::-webkit-slider-thumb{ transform:scale(1.15); }
      `}</style>
    </div>
  );
}

const ctrlBtn = () => ({
  display: "flex", alignItems: "center", justifyContent: "center",
  width: 56, height: 56, borderRadius: 28, border: "none",
  background: "transparent", color: "#fff", cursor: "pointer",
});
const footBtn = (active) => ({
  display: "flex", alignItems: "center", justifyContent: "center",
  width: 44, height: 44, borderRadius: 12, border: "none",
  background: active ? "rgba(255,255,255,0.18)" : "transparent",
  color: active ? "#fff" : "rgba(255,255,255,0.6)", cursor: "pointer",
});
// アイコンは 18px 固定なので拡大表示する
const bigIcon = (icon) => <span style={{ transform: "scale(2)", display: "flex" }}>{icon}</span>;
const midIcon = (icon) => <span style={{ transform: "scale(1.6)", display: "flex" }}>{icon}</span>;
