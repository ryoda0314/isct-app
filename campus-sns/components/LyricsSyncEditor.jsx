import React, { useState, useRef, useEffect } from "react";
import { T } from "../theme.js";
import { I } from "../icons.jsx";
import { t } from "../i18n.js";
import { parseLyrics, linesToLrc, formatLrcTime } from "../player/lyrics.js";
import { engine } from "../player/audioEngine.js";

// 歌詞タイムスタンプ同期エディタ（カラオケLRC作成ツール風）。
// 曲を再生しながら「スタンプ」ボタン（PCはスペースキー）で各行に再生位置を打刻し、
// ±ボタンで微調整・行タップで頭出し。保存時に LRC 文字列へ書き出して /api/music へ。
const fmt = (s) => {
  if (!Number.isFinite(s) || s < 0) s = 0;
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${String(sec).padStart(2, "0")}`;
};

export function LyricsSyncEditor({ track, onSave, onClose }) {
  const url = track?.audio?.url || "";
  const audioRef = useRef(null);
  const listRef = useRef(null);
  const lineRefs = useRef([]);

  const [lines, setLines] = useState(() =>
    parseLyrics(track?.lyrics).lines.map((l) => ({ text: l.text, time: l.time }))
  );
  const [activeIdx, setActiveIdx] = useState(0); // 次に打刻する行
  const [offset, setOffset] = useState(0); // 全体タイミング補正(秒)。反応遅れをまとめて吸収
  const [playing, setPlaying] = useState(false);
  const [cur, setCur] = useState(0);
  const [dur, setDur] = useState(track?.duration || 0);
  const [pasteText, setPasteText] = useState("");
  const [saving, setSaving] = useState(false);

  const stamped = lines.filter((l) => l.time != null).length;
  const hasLines = lines.length > 0;

  // 再生位置(cur)に対応する「いま歌っている行」。offset を反映して判定（プレビュー用）
  let previewIdx = -1, bestT = -Infinity;
  for (let i = 0; i < lines.length; i++) {
    const tm = lines[i].time;
    if (tm == null) continue;
    const tt = tm + offset;
    if (tt <= cur && tt > bestT) { bestT = tt; previewIdx = i; }
  }

  // 編集中は常駐プレイヤーを止めて二重再生を防ぐ
  useEffect(() => { try { engine.pause(); } catch {} }, []);

  // <audio> イベント購読
  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    const onTime = () => setCur(a.currentTime || 0);
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onMeta = () => setDur(Number.isFinite(a.duration) ? a.duration : (track?.duration || 0));
    a.addEventListener("timeupdate", onTime);
    a.addEventListener("play", onPlay);
    a.addEventListener("pause", onPause);
    a.addEventListener("loadedmetadata", onMeta);
    return () => {
      a.removeEventListener("timeupdate", onTime);
      a.removeEventListener("play", onPlay);
      a.removeEventListener("pause", onPause);
      a.removeEventListener("loadedmetadata", onMeta);
      a.pause();
    };
  }, []);

  const togglePlay = () => { const a = audioRef.current; if (!a) return; if (a.paused) a.play().catch(() => {}); else a.pause(); };
  const seekAudio = (s) => { const a = audioRef.current; if (a) a.currentTime = Math.max(0, Math.min(s, dur || s)); };
  const skip = (d) => seekAudio((audioRef.current?.currentTime || 0) + d);

  // 貼り付けたテキストを行に分割（時刻はリセット）
  const loadPaste = () => {
    const arr = pasteText.split(/\r?\n/).map((s) => s.trim());
    while (arr.length && arr[0] === "") arr.shift();
    while (arr.length && arr[arr.length - 1] === "") arr.pop();
    setLines(arr.map((text) => ({ text, time: null })));
    setActiveIdx(0);
    setPasteText("");
  };

  // 現在の再生位置を activeIdx の行に打刻して次行へ
  const stamp = () => {
    const a = audioRef.current;
    if (!a || activeIdx >= lines.length) return;
    const time = a.currentTime || 0;
    setLines((prev) => prev.map((l, i) => (i === activeIdx ? { ...l, time } : l)));
    setActiveIdx((i) => Math.min(i + 1, lines.length));
  };

  // スペースキーで打刻（入力欄にフォーカス中は無効）
  useEffect(() => {
    const onKey = (e) => {
      if (e.code !== "Space") return;
      const tag = (e.target.tagName || "").toLowerCase();
      if (tag === "input" || tag === "textarea") return;
      e.preventDefault();
      stamp();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // 再生中は「いま歌っている行」、停止中は「次に打刻する行」を中央へ追従
  const followIdx = playing && previewIdx >= 0 ? previewIdx : activeIdx;
  useEffect(() => {
    const el = lineRefs.current[followIdx];
    const cont = listRef.current;
    if (el && cont) {
      const top = el.offsetTop - cont.clientHeight / 2 + el.clientHeight / 2;
      cont.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
    }
  }, [followIdx]);

  const nudge = (i, d) =>
    setLines((prev) => prev.map((l, idx) => (idx === i && l.time != null ? { ...l, time: Math.max(0, +(l.time + d).toFixed(2)) } : l)));
  const clearTime = (i) => setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, time: null } : l)));
  const setText = (i, text) => setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, text } : l)));
  const addLine = () => setLines((prev) => [...prev, { text: "", time: null }]);
  const delLine = (i) => {
    setLines((prev) => prev.filter((_, idx) => idx !== i));
    setActiveIdx((a) => (i < a ? a - 1 : a));
  };

  const save = async () => {
    setSaving(true);
    // 全体オフセットを各行の時刻に焼き込んでから LRC 化
    const baked = lines.map((l) => (l.time != null ? { ...l, time: Math.max(0, +(l.time + offset).toFixed(2)) } : l));
    const lrc = linesToLrc(baked.filter((l) => l.text !== "" || l.time != null));
    try { await onSave(lrc); } finally { setSaving(false); }
  };
  const offBtn = { padding: "5px 10px", borderRadius: 6, border: `1px solid ${T.bd}`, background: T.bg2, color: T.txH, cursor: "pointer", fontSize: 12, fontWeight: 700, fontFamily: "inherit", lineHeight: 1 };

  const chip = (active) => ({
    minWidth: 62, padding: "4px 6px", borderRadius: 8, border: "none", cursor: "pointer",
    fontVariantNumeric: "tabular-nums", fontSize: 12, fontWeight: 700, fontFamily: "inherit",
    background: active ? T.accent : T.bg2, color: active ? "#fff" : T.txD,
  });
  const miniBtn = { width: 26, height: 26, borderRadius: 6, border: `1px solid ${T.bd}`, background: T.bg2, color: T.txH, cursor: "pointer", fontSize: 13, lineHeight: 1, padding: 0, flexShrink: 0 };
  const ctrlBtn = { display: "flex", alignItems: "center", justifyContent: "center", width: 40, height: 40, borderRadius: 20, border: `1px solid ${T.bd}`, background: T.bg2, color: T.txH, cursor: "pointer" };

  return (
    <div style={{ marginTop: 10, padding: 12, borderRadius: 12, background: T.bg2, border: `1px solid ${T.accent}55` }}>
      <audio ref={audioRef} src={url} preload="metadata" playsInline />

      {/* タイトル */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <span style={{ color: T.accent, display: "flex" }}>{I.lyrics}</span>
        <div style={{ fontSize: 13, fontWeight: 700, color: T.txH, flex: 1, minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {t("admin.music.syncTitle")}
        </div>
        <div style={{ fontSize: 11, color: T.txD }}>{t("admin.music.syncProgress", { done: stamped, total: lines.length })}</div>
      </div>

      {/* 再生コントロール */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <button onClick={() => skip(-2)} style={ctrlBtn} aria-label="-2s">{I.skipBack}</button>
        <button onClick={togglePlay} style={{ ...ctrlBtn, width: 48, height: 48, background: T.accent, color: "#fff", border: "none" }} aria-label={playing ? "pause" : "play"}>
          {playing ? I.pause : I.play}
        </button>
        <button onClick={() => skip(2)} style={ctrlBtn} aria-label="+2s">{I.skipFwd}</button>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 2 }}>
          <input
            type="range" min={0} max={dur || 0} step="any" value={Math.min(cur, dur || 0)}
            onChange={(e) => seekAudio(Number(e.target.value))}
            style={{ width: "100%", accentColor: T.accent }}
          />
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: T.txD, fontVariantNumeric: "tabular-nums" }}>
            <span>{fmt(cur)}</span><span>{fmt(dur)}</span>
          </div>
        </div>
      </div>

      {!hasLines ? (
        /* 歌詞貼り付け（行ごとに分割して読み込む） */
        <div>
          <textarea
            value={pasteText} onChange={(e) => setPasteText(e.target.value)}
            placeholder={t("admin.music.syncPastePlaceholder")}
            style={{ width: "100%", minHeight: 140, padding: "8px 12px", borderRadius: 8, border: `1px solid ${T.bd}`, background: T.bg, color: T.txH, fontSize: 13, outline: "none", boxSizing: "border-box", fontFamily: "inherit", resize: "vertical", lineHeight: 1.5 }}
          />
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 8 }}>
            <button onClick={onClose} style={{ ...miniBtn, width: "auto", height: "auto", padding: "8px 14px" }}>{t("common.cancel")}</button>
            <button onClick={loadPaste} disabled={!pasteText.trim()} style={{ padding: "8px 16px", borderRadius: 8, border: "none", background: T.accent, color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer", opacity: pasteText.trim() ? 1 : 0.5 }}>
              {t("admin.music.syncLoad")}
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* 大きな「スタンプ」ボタン */}
          <button
            onClick={stamp}
            disabled={activeIdx >= lines.length}
            style={{ width: "100%", padding: "12px", borderRadius: 10, border: "none", background: activeIdx >= lines.length ? T.bg3 : T.accent, color: "#fff", fontWeight: 800, fontSize: 15, cursor: activeIdx >= lines.length ? "default" : "pointer", marginBottom: 4 }}
          >
            {activeIdx >= lines.length ? t("admin.music.syncDone") : t("admin.music.syncStamp")}
          </button>
          <div style={{ fontSize: 11, color: T.txD, textAlign: "center", marginBottom: 8 }}>{t("admin.music.syncHint")}</div>

          {/* 全体タイミング調整（反応遅れをまとめて補正。再生しながら現在行プレビューで合わせる） */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginBottom: 8 }}>
            <span style={{ fontSize: 11, color: T.txD }}>{t("admin.music.syncOffset")}</span>
            <button onClick={() => setOffset((o) => +(o - 0.1).toFixed(2))} style={offBtn} title={t("admin.music.syncOffsetEarlier")}>−0.1s</button>
            <span style={{ fontVariantNumeric: "tabular-nums", fontSize: 13, fontWeight: 800, color: offset ? T.accent : T.txH, minWidth: 56, textAlign: "center" }}>
              {(offset >= 0 ? "+" : "") + offset.toFixed(2)}s
            </span>
            <button onClick={() => setOffset((o) => +(o + 0.1).toFixed(2))} style={offBtn} title={t("admin.music.syncOffsetLater")}>＋0.1s</button>
            {offset !== 0 && <button onClick={() => setOffset(0)} style={{ ...offBtn, color: T.txD }} title={t("admin.music.syncClear")}>{I.reset}</button>}
          </div>

          {/* 行リスト */}
          <div ref={listRef} style={{ maxHeight: 320, overflowY: "auto", display: "flex", flexDirection: "column", gap: 4, padding: "2px" }}>
            {lines.map((ln, i) => {
              const isActive = i === activeIdx;     // 次に打刻する行
              const isPlaying = i === previewIdx;    // いま歌っている行（offset反映）
              return (
                <div
                  key={i}
                  ref={(el) => { lineRefs.current[i] = el; }}
                  style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px", borderRadius: 8, background: isPlaying ? `${T.accent}33` : isActive ? `${T.accent}1a` : "transparent", borderLeft: isPlaying ? `3px solid ${T.accent}` : "3px solid transparent", border: isActive && !isPlaying ? `1px solid ${T.accent}66` : undefined }}
                >
                  {/* 時刻チップ: タップでその行を次の打刻対象にしつつ頭出し（offset反映） */}
                  <button
                    onClick={() => { setActiveIdx(i); if (ln.time != null) seekAudio(ln.time + offset); }}
                    style={chip(isActive)}
                    title={t("admin.music.syncSeek")}
                  >
                    {ln.time != null ? formatLrcTime(ln.time).replace(/[[\]]/g, "") : "--:--"}
                  </button>
                  {/* 微調整 */}
                  <button onClick={() => nudge(i, -0.3)} style={miniBtn} disabled={ln.time == null} title="-0.3s">−</button>
                  <button onClick={() => nudge(i, 0.3)} style={miniBtn} disabled={ln.time == null} title="+0.3s">＋</button>
                  {/* テキスト編集 */}
                  <input
                    value={ln.text}
                    onChange={(e) => setText(i, e.target.value)}
                    placeholder="♪"
                    style={{ flex: 1, minWidth: 0, padding: "6px 8px", borderRadius: 6, border: `1px solid ${T.bd}`, background: T.bg, color: T.txH, fontSize: 13, outline: "none", fontFamily: "inherit" }}
                  />
                  <button onClick={() => clearTime(i)} style={{ ...miniBtn, color: T.txD }} disabled={ln.time == null} title={t("admin.music.syncClear")}>{I.reset}</button>
                  <button onClick={() => delLine(i)} style={{ ...miniBtn, color: T.red }} title={t("common.delete")}>{I.trash}</button>
                </div>
              );
            })}
          </div>

          {/* フッター操作 */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
            <button onClick={addLine} style={{ ...miniBtn, width: "auto", height: "auto", padding: "8px 12px", display: "inline-flex", alignItems: "center", gap: 4 }}>{I.plus} {t("admin.music.syncAddLine")}</button>
            <button onClick={() => { setActiveIdx(0); }} style={{ ...miniBtn, width: "auto", height: "auto", padding: "8px 12px" }}>{t("admin.music.syncRestart")}</button>
            <div style={{ flex: 1 }} />
            <button onClick={onClose} disabled={saving} style={{ ...miniBtn, width: "auto", height: "auto", padding: "8px 14px", color: T.txD }}>{t("common.cancel")}</button>
            <button onClick={save} disabled={saving} style={{ padding: "8px 18px", borderRadius: 8, border: "none", background: T.accent, color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer", opacity: saving ? 0.6 : 1 }}>
              {saving ? t("admin.music.uploading") : t("common.save")}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
