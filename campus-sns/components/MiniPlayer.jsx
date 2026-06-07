import React from "react";
import { T } from "../theme.js";
import { I } from "../icons.jsx";
import { useMusicPlayer } from "../hooks/useMusicPlayer.js";

const fmtTime = (s) => {
  if (!Number.isFinite(s) || s < 0) s = 0;
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
};

// 常駐ミニプレイヤー。曲が選択されている間だけ表示し、どの画面でも操作できる。
// mob: モバイルでは下部ナビ(MNav)の上に重なるよう bottom を上げる。
// onOpen: タップでミュージック画面を開く（通常 () => setView("music")）。
export function MiniPlayer({ mob = false, onOpen }) {
  const { track, playing, currentTime, duration, toggle, next, prev, seek } = useMusicPlayer();
  if (!track) return null;

  const dur = duration || track.duration || 0;
  const pct = dur > 0 ? Math.min(100, (currentTime / dur) * 100) : 0;

  // モバイル: 下部ナビ(高さ ~56) + セーフエリアの上に配置
  const bottom = mob ? "calc(56px + env(safe-area-inset-bottom, 0px))" : 0;

  return (
    <div
      style={{
        position: "fixed", left: 0, right: 0, bottom,
        zIndex: 60,
        background: T.bg2,
        borderTop: `1px solid ${T.bd}`,
        boxShadow: "0 -2px 12px rgba(0,0,0,0.18)",
      }}
    >
      {/* シークバー（クリック/タップでその位置へ） */}
      <div
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          if (dur > 0) seek(((e.clientX - r.left) / r.width) * dur);
        }}
        style={{ height: 4, background: T.bg3, cursor: dur > 0 ? "pointer" : "default", position: "relative" }}
      >
        <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${pct}%`, background: T.accent }} />
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", maxWidth: 920, margin: "0 auto" }}>
        {/* カバー + タイトル（タップでフル画面へ） */}
        <button
          onClick={onOpen}
          style={{ display: "flex", alignItems: "center", gap: 10, flex: 1, minWidth: 0, background: "none", border: "none", cursor: "pointer", padding: 0, textAlign: "left" }}
        >
          <div style={{ width: 40, height: 40, borderRadius: 8, flexShrink: 0, overflow: "hidden", background: `linear-gradient(145deg, ${T.accent}, ${T.accent}99)`, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff" }}>
            {track.cover?.url
              ? <img src={track.cover.url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              : I.music}
          </div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: T.txH, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{track.title || "無題"}</div>
            <div style={{ fontSize: 11, color: T.txD, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {track.artist || "Science Tokyo music"} · {fmtTime(currentTime)} / {fmtTime(dur)}
            </div>
          </div>
        </button>

        {/* 操作 */}
        <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
          <button onClick={prev} title="前へ" style={btn}>{I.skipBack}</button>
          <button onClick={toggle} title={playing ? "一時停止" : "再生"} style={{ ...btn, width: 40, height: 40, background: T.accent, color: "#fff", borderRadius: 20 }}>
            {playing ? I.pause : I.play}
          </button>
          <button onClick={next} title="次へ" style={btn}>{I.skipFwd}</button>
        </div>
      </div>
    </div>
  );
}

const btn = {
  display: "flex", alignItems: "center", justifyContent: "center",
  width: 34, height: 34, borderRadius: 17, border: "none",
  background: "transparent", color: T.txH, cursor: "pointer",
};
