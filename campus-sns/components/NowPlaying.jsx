import React, { useState, useEffect } from "react";
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

  // シーク中はドラッグ値を優先表示（指を離した瞬間に飛ばないように）
  const [scrub, setScrub] = useState(null);
  useEffect(() => { setScrub(null); }, [track?.id]);

  if (!track) return null;
  const dur = duration || track.duration || 0;
  const pos = scrub != null ? scrub : currentTime;
  const remain = Math.max(0, dur - pos);
  const cover = track.cover?.url;
  const vol = volume ?? 1;
  const seekPct = dur > 0 ? Math.min(100, (pos / dur) * 100) : 0;

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 200,
      display: "flex", flexDirection: "column",
      color: "#fff", overflow: "hidden",
      paddingTop: "env(safe-area-inset-top, 0px)",
      paddingBottom: "env(safe-area-inset-bottom, 0px)",
    }}>
      {/* 背景: カバーをぼかして敷き、暗いスクリムを重ねる（カバーが無ければグラデ） */}
      <div style={{ position: "absolute", inset: 0, zIndex: -2, background: cover ? "#1a2733" : `linear-gradient(160deg, ${T.accent}cc, #1a2230)` }}>
        {cover && <img src={cover} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", filter: "blur(40px) brightness(0.7) saturate(1.2)", transform: "scale(1.2)" }} />}
      </div>
      <div style={{ position: "absolute", inset: 0, zIndex: -1, background: "linear-gradient(to bottom, rgba(0,0,0,0.25), rgba(0,0,0,0.55))" }} />

      {/* 上部: ハンドル + 閉じる */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "8px 0 0" }}>
        <button onClick={onClose} aria-label="閉じる" style={{ background: "none", border: "none", cursor: "pointer", padding: 8 }}>
          <div style={{ width: 38, height: 5, borderRadius: 3, background: "rgba(255,255,255,0.5)" }} />
        </button>
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
            <div style={{ fontSize: 18, color: "rgba(255,255,255,0.7)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{track.artist || "Science Tokyo music"}</div>
          </div>
        </div>

        {/* シークバー */}
        <div>
          <input
            className="np-range"
            type="range" min={0} max={dur || 0} step={0.1} value={Math.min(pos, dur || 0)}
            onChange={(e) => setScrub(Number(e.target.value))}
            onPointerUp={(e) => { seek(Number(e.target.value)); setScrub(null); }}
            onMouseUp={(e) => { seek(Number(e.target.value)); setScrub(null); }}
            onTouchEnd={(e) => { seek(Number(e.target.value)); setScrub(null); }}
            style={{ width: "100%", ["--pct"]: `${seekPct}%` }}
          />
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "rgba(255,255,255,0.6)", marginTop: 2 }}>
            <span>{fmt(pos)}</span>
            <span>-{fmt(remain)}</span>
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
        .np-range{ -webkit-appearance:none; appearance:none; cursor:pointer; outline:none; background:transparent; height:15px; }
        .np-range::-webkit-slider-runnable-track{ -webkit-appearance:none; height:6px; border-radius:3px; border:none;
          background:linear-gradient(to right, #fff var(--pct,0%), rgba(255,255,255,0.28) var(--pct,0%)); }
        .np-range::-moz-range-track{ height:6px; border-radius:3px; border:none;
          background:linear-gradient(to right, #fff var(--pct,0%), rgba(255,255,255,0.28) var(--pct,0%)); }
        .np-range::-webkit-slider-thumb{ -webkit-appearance:none; appearance:none; width:15px; height:15px; margin-top:-4.5px; border-radius:50%; background:#fff; box-shadow:0 1px 4px rgba(0,0,0,.45); }
        .np-range::-moz-range-thumb{ width:15px; height:15px; border:none; border-radius:50%; background:#fff; box-shadow:0 1px 4px rgba(0,0,0,.45); }
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
