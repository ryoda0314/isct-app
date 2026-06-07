import React from "react";
import { T } from "../theme.js";
import { I } from "../icons.jsx";
import { Loader } from "../shared.jsx";
import { useMusic } from "../hooks/useMusic.js";
import { useMusicPlayer } from "../hooks/useMusicPlayer.js";

// ScienceTokyo Music — 管理者が配信した曲を全員が聴くプレイヤー。
// 表示は全ユーザー共通（管理者も同じ見え方）。配信（アップロード）は管理者画面で行う。

const fmtTime = (s) => {
  if (!Number.isFinite(s) || s <= 0) return "";
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
};

export function MusicView({ mob = false }) {
  const { tracks, loading } = useMusic();
  const player = useMusicPlayer();

  // 全員に配信された曲のみ表示（誰が見ても同一）
  const list = tracks.filter((t) => t.is_public);

  const playAll = () => { if (list.length) player.playTracks(list, list[0].id); };
  const playFrom = (id) => player.playTracks(list, id);

  const renderRow = (t) => {
    const isCurrent = player.track?.id === t.id;
    return (
      <button
        key={t.id}
        onClick={() => (isCurrent ? player.toggle() : playFrom(t.id))}
        style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 8px", borderRadius: 10, background: isCurrent ? T.bg3 : "transparent", border: "none", cursor: "pointer", textAlign: "left", width: "100%" }}
      >
        <div style={{ width: 48, height: 48, borderRadius: 8, flexShrink: 0, overflow: "hidden", position: "relative", background: `linear-gradient(145deg, ${T.accent}, ${T.accent}99)`, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff" }}>
          {t.cover?.url && <img src={t.cover.url} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />}
          <span style={{ position: "relative", zIndex: 1, background: t.cover?.url ? "rgba(0,0,0,0.35)" : "transparent", width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
            {isCurrent && player.playing ? I.pause : I.play}
          </span>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: isCurrent ? T.accent : T.txH, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t.title}</div>
          <div style={{ fontSize: 12, color: T.txD, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {t.artist || "ScienceTokyo Music"}{t.duration ? ` · ${fmtTime(t.duration)}` : ""}
          </div>
        </div>
      </button>
    );
  };

  if (loading) return <Loader msg="読み込み中..." />;

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: mob ? "12px 14px 120px" : "16px 20px 120px" }}>
      {/* ヘッダー */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
        <div style={{ width: 44, height: 44, borderRadius: 12, background: `linear-gradient(145deg, ${T.accent}, ${T.accent}99)`, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", flexShrink: 0 }}>{I.music}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 17, fontWeight: 800, color: T.txH }}>ScienceTokyo Music</div>
          <div style={{ fontSize: 12, color: T.txD }}>{list.length} 曲</div>
        </div>
        {list.length > 0 && (
          <button onClick={playAll} style={primaryBtn}>{I.play}<span style={{ marginLeft: 4 }}>全て再生</span></button>
        )}
      </div>

      {/* 一覧 */}
      {list.length === 0 ? (
        <div style={{ textAlign: "center", padding: "48px 20px", color: T.txD }}>
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 12, opacity: 0.5 }}>{I.music}</div>
          <div style={{ fontSize: 14, fontWeight: 600 }}>まだ配信されている曲がありません</div>
          <div style={{ fontSize: 12, marginTop: 6 }}>配信されると、ここに表示されます。</div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>{list.map(renderRow)}</div>
      )}
    </div>
  );
}

const primaryBtn = { display: "inline-flex", alignItems: "center", border: "none", cursor: "pointer", fontFamily: "inherit", fontWeight: 700, borderRadius: 8, padding: "8px 14px", fontSize: 13, background: T.accent, color: "#fff" };
