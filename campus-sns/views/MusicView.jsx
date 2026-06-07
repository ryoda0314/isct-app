import React, { useState, useRef } from "react";
import { T } from "../theme.js";
import { I } from "../icons.jsx";
import { Loader } from "../shared.jsx";
import { showToast } from "../hooks/useToast.js";
import { useMusic } from "../hooks/useMusic.js";
import { useMusicPlayer } from "../hooks/useMusicPlayer.js";
import { useCurrentUser } from "../hooks/useCurrentUser.js";

// Science Tokyo music — 自分でアップロードした曲（AI生成曲など）を、
// どの画面に移動してもバックグラウンドで聴ける個人ミュージックライブラリ。

const fmtTime = (s) => {
  if (!Number.isFinite(s) || s <= 0) return "";
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
};

export function MusicView({ mob = false }) {
  const { tracks, loading, addTrack, removeTrack, renameTrack } = useMusic();
  const player = useMusicPlayer();
  const me = useCurrentUser();
  const isAdmin = !!me?.isAdmin;
  const [uploading, setUploading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [artist, setArtist] = useState("");
  const [isPublic, setIsPublic] = useState(false);
  const audioRef = useRef(null);
  const coverRef = useRef(null);
  const [audioFile, setAudioFile] = useState(null);
  const [coverFile, setCoverFile] = useState(null);

  const reset = () => {
    setShowForm(false); setTitle(""); setArtist(""); setAudioFile(null); setCoverFile(null); setIsPublic(false);
    if (audioRef.current) audioRef.current.value = "";
    if (coverRef.current) coverRef.current.value = "";
  };

  const onSubmit = async () => {
    if (!audioFile) { showToast("音声ファイルを選択してください", "error"); return; }
    setUploading(true);
    try {
      await addTrack({ audioFile, coverFile, title: title.trim(), artist: artist.trim(), isPublic: isAdmin && isPublic });
      showToast(isAdmin && isPublic ? "全員に配信しました" : "追加しました", "success");
      reset();
    } catch (err) {
      showToast(err.message || "アップロードに失敗しました", "error");
    } finally {
      setUploading(false);
    }
  };

  // 編集/削除できるか: 自分の曲、または 公式曲(is_public)なら管理者
  const canManage = (t) => (t.is_public ? isAdmin : true);

  const onDelete = async (t) => {
    if (!window.confirm(`「${t.title}」を削除しますか？`)) return;
    await removeTrack(t.id);
    // 再生キューからも除外
    player.syncQueue(tracks.filter((x) => x.id !== t.id));
    showToast("削除しました", "success");
  };

  const onRename = (t) => {
    const newTitle = window.prompt("曲名", t.title);
    if (newTitle == null) return;
    renameTrack(t.id, { title: newTitle.trim() || t.title });
  };

  const playAll = () => {
    if (tracks.length === 0) return;
    player.playTracks(tracks, tracks[0].id);
  };

  const playFrom = (id) => player.playTracks(tracks, id);

  const publicTracks = tracks.filter((t) => t.is_public);
  const myTracks = tracks.filter((t) => !t.is_public);

  // 1曲分の行（配信曲・マイライブラリ共通）
  const renderRow = (t) => {
    const isCurrent = player.track?.id === t.id;
    return (
      <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 8px", borderRadius: 10, background: isCurrent ? T.bg3 : "transparent" }}>
        <button onClick={() => (isCurrent ? player.toggle() : playFrom(t.id))}
          style={{ width: 44, height: 44, borderRadius: 8, flexShrink: 0, overflow: "hidden", border: "none", cursor: "pointer", position: "relative", background: `linear-gradient(145deg, ${T.accent}, ${T.accent}99)`, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff" }}>
          {t.cover?.url && <img src={t.cover.url} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />}
          <span style={{ position: "relative", zIndex: 1, background: t.cover?.url ? "rgba(0,0,0,0.35)" : "transparent", width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
            {isCurrent && player.playing ? I.pause : I.play}
          </span>
        </button>
        <button onClick={() => (isCurrent ? player.toggle() : playFrom(t.id))} style={{ flex: 1, minWidth: 0, background: "none", border: "none", cursor: "pointer", textAlign: "left", padding: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: isCurrent ? T.accent : T.txH, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t.title}</div>
          <div style={{ fontSize: 12, color: T.txD, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {t.artist || "Science Tokyo music"}{t.duration ? ` · ${fmtTime(t.duration)}` : ""}
          </div>
        </button>
        {canManage(t) && <>
          <button onClick={() => onRename(t)} title="名前を変更" style={iconBtn}>{I.pen}</button>
          <button onClick={() => onDelete(t)} title="削除" style={{ ...iconBtn, color: T.red }}>{I.trash}</button>
        </>}
      </div>
    );
  };

  if (loading) return <Loader msg="ライブラリを読み込み中..." />;

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: mob ? "12px 14px 120px" : "16px 20px 120px" }}>
      {/* ヘッダー / 操作 */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
        <div style={{ width: 44, height: 44, borderRadius: 12, background: `linear-gradient(145deg, ${T.accent}, ${T.accent}99)`, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", flexShrink: 0 }}>{I.music}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 17, fontWeight: 800, color: T.txH }}>Science Tokyo music</div>
          <div style={{ fontSize: 12, color: T.txD }}>{tracks.length} 曲 · 自分専用ライブラリ</div>
        </div>
        {tracks.length > 0 && (
          <button onClick={playAll} style={primaryBtn}>{I.play}<span style={{ marginLeft: 4 }}>全て再生</span></button>
        )}
      </div>

      {/* 追加ボタン / フォーム */}
      {!showForm ? (
        <button onClick={() => setShowForm(true)} style={{ ...primaryBtn, width: "100%", justifyContent: "center", marginBottom: 16, padding: "11px 0" }}>
          {I.plus}<span style={{ marginLeft: 6 }}>曲を追加</span>
        </button>
      ) : (
        <div style={{ background: T.bg2, border: `1px solid ${T.bd}`, borderRadius: 12, padding: 14, marginBottom: 16 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: T.txH, marginBottom: 12 }}>曲を追加</div>

          {/* 音声ファイル */}
          <label style={fileBox}>
            {I.upload}
            <span style={{ marginLeft: 8, color: audioFile ? T.txH : T.txD, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {audioFile ? audioFile.name : "音声ファイルを選択（mp3 / m4a / wav など）"}
            </span>
            <input ref={audioRef} type="file" accept="audio/*" style={{ display: "none" }}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) { setAudioFile(f); if (!title) setTitle(f.name.replace(/\.[^.]+$/, "")); }
              }} />
          </label>

          {/* カバー画像（任意） */}
          <label style={{ ...fileBox, marginTop: 10 }}>
            {I.img}
            <span style={{ marginLeft: 8, color: coverFile ? T.txH : T.txD, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {coverFile ? coverFile.name : "カバー画像（任意）"}
            </span>
            <input ref={coverRef} type="file" accept="image/*" style={{ display: "none" }}
              onChange={(e) => setCoverFile(e.target.files?.[0] || null)} />
          </label>

          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="曲名"
            style={{ ...inputStyle, marginTop: 10 }} />
          <input value={artist} onChange={(e) => setArtist(e.target.value)} placeholder="アーティスト名（任意・例: Suno AI）"
            style={{ ...inputStyle, marginTop: 10 }} />

          {isAdmin && (
            <label style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 12, padding: "10px 12px", borderRadius: 8, background: isPublic ? `${T.accent}14` : T.bg3, border: `1px solid ${isPublic ? T.accent : T.bd}`, cursor: "pointer" }}>
              <input type="checkbox" checked={isPublic} onChange={(e) => setIsPublic(e.target.checked)} style={{ width: 18, height: 18, accentColor: T.accent }} />
              <span style={{ minWidth: 0 }}>
                <span style={{ display: "block", fontSize: 13, fontWeight: 700, color: T.txH }}>全員に配信する（公式曲）</span>
                <span style={{ display: "block", fontSize: 11, color: T.txD }}>すべてのユーザーのライブラリに表示されます</span>
              </span>
            </label>
          )}

          <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
            <button onClick={reset} disabled={uploading} style={{ ...ghostBtn, flex: 1 }}>キャンセル</button>
            <button onClick={onSubmit} disabled={uploading || !audioFile} style={{ ...primaryBtn, flex: 1, justifyContent: "center", opacity: (uploading || !audioFile) ? 0.6 : 1 }}>
              {uploading ? "アップロード中..." : "追加"}
            </button>
          </div>
        </div>
      )}

      {/* 一覧（配信曲 / マイライブラリ） */}
      {tracks.length === 0 ? (
        <div style={{ textAlign: "center", padding: "48px 20px", color: T.txD }}>
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 12, opacity: 0.5 }}>{I.music}</div>
          <div style={{ fontSize: 14, fontWeight: 600 }}>まだ曲がありません</div>
          <div style={{ fontSize: 12, marginTop: 6 }}>AIで作った曲をアップロードして、<br />どの画面でもバックグラウンド再生できます。</div>
        </div>
      ) : (
        <>
          {publicTracks.length > 0 && (
            <Section title="配信曲" sub="みんなに公開" icon={I.mega}>
              {publicTracks.map(renderRow)}
            </Section>
          )}
          <Section title="マイライブラリ" sub="自分だけ" icon={I.user1}>
            {myTracks.length > 0
              ? myTracks.map(renderRow)
              : <div style={{ fontSize: 12, color: T.txD, padding: "10px 8px" }}>自分の曲はまだありません。</div>}
          </Section>
        </>
      )}
    </div>
  );
}

// セクション見出し
function Section({ title, sub, icon, children }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 7, margin: "4px 4px 8px" }}>
        <span style={{ color: T.txD, display: "flex" }}>{icon}</span>
        <span style={{ fontSize: 13, fontWeight: 800, color: T.txH }}>{title}</span>
        <span style={{ fontSize: 11, color: T.txD }}>{sub}</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>{children}</div>
    </div>
  );
}

const primaryBtn = { display: "inline-flex", alignItems: "center", border: "none", cursor: "pointer", fontFamily: "inherit", fontWeight: 700, borderRadius: 8, padding: "8px 14px", fontSize: 13, background: T.accent, color: "#fff" };
const ghostBtn = { display: "inline-flex", alignItems: "center", justifyContent: "center", border: `1px solid ${T.bd}`, cursor: "pointer", fontFamily: "inherit", fontWeight: 600, borderRadius: 8, padding: "8px 14px", fontSize: 13, background: "transparent", color: T.txH };
const iconBtn = { display: "flex", alignItems: "center", justifyContent: "center", width: 32, height: 32, borderRadius: 8, border: "none", background: "transparent", color: T.txD, cursor: "pointer", flexShrink: 0 };
const fileBox = { display: "flex", alignItems: "center", padding: "10px 12px", borderRadius: 8, border: `1px dashed ${T.bd}`, background: T.bg3, cursor: "pointer", color: T.txD };
const inputStyle = { width: "100%", padding: "9px 12px", borderRadius: 8, border: `1px solid ${T.bd}`, background: T.bg3, color: T.txH, fontSize: 14, outline: "none" };
