import React, { useState, useRef } from "react";
import { T } from "../theme.js";
import { I } from "../icons.jsx";
import { Loader } from "../shared.jsx";
import { usePocket } from "../hooks/usePocket.js";
import { showToast } from "../hooks/useToast.js";

// 自分専用クリップボード（端末間同期）。スマホ⇔PCでテキスト/URL/画像/ファイルを即共有。

const URL_RE = /(https?:\/\/[^\s<>"']+)/g;
const URL_HEAD = /^https?:\/\//; // 副作用のない判定用（global版の test は lastIndex を進めるため使わない）
const isPureUrl = (s) => /^https?:\/\/[^\s]+$/.test((s || "").trim());

const fmtSize = (n) => {
  if (!n && n !== 0) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
};

const relTime = (iso) => {
  const d = new Date(iso);
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return "たった今";
  if (diff < 3600) return `${Math.floor(diff / 60)}分前`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}時間前`;
  const days = Math.floor(diff / 86400);
  if (days < 7) return `${days}日前`;
  return `${d.getMonth() + 1}/${d.getDate()}`;
};

// URL をリンク化したテキスト
const Linkified = ({ text }) => {
  const parts = String(text).split(URL_RE);
  return (
    <>
      {parts.map((p, i) =>
        URL_HEAD.test(p)
          ? <a key={i} href={p} target="_blank" rel="noopener noreferrer"
              style={{ color: T.accent, textDecoration: "none", wordBreak: "break-all" }}>{p}</a>
          : <span key={i}>{p}</span>
      )}
    </>
  );
};

const copyText = async (text) => {
  try {
    await navigator.clipboard.writeText(text);
    showToast("コピーしました", "success");
  } catch {
    // フォールバック
    try {
      const ta = document.createElement("textarea");
      ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0";
      document.body.appendChild(ta); ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      showToast("コピーしました", "success");
    } catch { showToast("コピーに失敗しました", "error"); }
  }
};

const download = (url, name) => {
  const a = document.createElement("a");
  a.href = url; a.download = name || ""; a.target = "_blank"; a.rel = "noopener noreferrer";
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
};

// 小さめアイコンボタン
const IconBtn = ({ children, onClick, title, color }) => (
  <button onClick={onClick} title={title}
    style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 30, height: 30, borderRadius: 7, border: "none", background: "transparent", color: color || T.txD, cursor: "pointer", flexShrink: 0 }}
    onMouseEnter={e => e.currentTarget.style.background = T.bg4}
    onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
    {children}
  </button>
);

const CopyIcon = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
  </svg>
);

const PocketCard = ({ item, onCopy, onDelete, onPin }) => {
  const a = item.attachment;
  const isImg = item.kind === "image" && a?.url;
  const isFile = item.kind === "file" && a?.url;
  const isText = item.kind === "text";
  const pureUrl = isText && isPureUrl(item.text);

  return (
    <div style={{ position: "relative", background: T.bg2, border: `1px solid ${item.pinned ? T.accent + "55" : T.bd}`, borderRadius: 12, padding: 12, display: "flex", flexDirection: "column", gap: 8 }}>
      {/* 本文 */}
      {isImg && (
        <img src={a.url} alt={a.name || ""} onClick={() => window.open(a.url, "_blank", "noopener")}
          style={{ maxWidth: "100%", maxHeight: 280, borderRadius: 8, objectFit: "contain", cursor: "zoom-in", alignSelf: "flex-start", background: T.bg3 }} />
      )}
      {isFile && (
        <div onClick={() => download(a.url, a.name)}
          style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 8, background: T.bg3, border: `1px solid ${T.bd}`, cursor: "pointer" }}>
          <span style={{ color: T.accent, display: "flex" }}>{I.file}</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, color: T.txH, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.name}</div>
            <div style={{ fontSize: 11, color: T.txD }}>{fmtSize(a.size)}</div>
          </div>
          <span style={{ color: T.txD, display: "flex" }}>{I.dl}</span>
        </div>
      )}
      {(isText || (a && item.text)) && (
        <div style={{ fontSize: 14, color: T.tx, lineHeight: 1.6, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
          <Linkified text={item.text} />
        </div>
      )}

      {/* フッター: 時刻 + アクション */}
      <div style={{ display: "flex", alignItems: "center", gap: 2, marginTop: -2 }}>
        <span style={{ fontSize: 11, color: T.txD, flex: 1 }}>
          {item.pinned && <span style={{ color: T.accent, marginRight: 4 }}>📌</span>}
          {relTime(item.created_at)}
        </span>
        {(isText || item.text) && <IconBtn title="コピー" onClick={() => onCopy(item.text)}>{CopyIcon}</IconBtn>}
        {pureUrl && <IconBtn title="開く" onClick={() => window.open(item.text.trim(), "_blank", "noopener")} color={T.accent}>{I.arr}</IconBtn>}
        {(isImg || isFile) && <IconBtn title="ダウンロード" onClick={() => download(a.url, a.name)}>{I.dl}</IconBtn>}
        <IconBtn title={item.pinned ? "ピンを外す" : "ピン留め"} onClick={() => onPin(item.id)} color={item.pinned ? T.accent : undefined}>{I.pin}</IconBtn>
        <IconBtn title="削除" onClick={() => onDelete(item.id)} color={T.red}>{I.trash}</IconBtn>
      </div>
    </div>
  );
};

export const PocketView = ({ mob }) => {
  const { items, loading, addText, addFile, removeItem, togglePin } = usePocket();
  const [inp, setInp] = useState("");
  const [busy, setBusy] = useState(false);
  const fileRef = useRef(null);

  const sendText = async () => {
    const t = inp.trim();
    if (!t || busy) return;
    setBusy(true);
    try { await addText(t); setInp(""); }
    finally { setBusy(false); }
  };

  const onPickFile = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = ""; // 同じファイルを再選択できるように
    if (!f) return;
    setBusy(true);
    try {
      await addFile(f, inp.trim() || undefined);
      setInp("");
      showToast("保存しました", "success");
    } catch (err) {
      showToast(err.message || "保存に失敗しました", "error");
    } finally { setBusy(false); }
  };

  // 入力欄への貼り付けで画像/ファイルを検出
  const onPaste = async (e) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const it of items) {
      if (it.kind === "file") {
        const f = it.getAsFile();
        if (f) {
          e.preventDefault();
          setBusy(true);
          try { await addFile(f, inp.trim() || undefined); setInp(""); showToast("保存しました", "success"); }
          catch (err) { showToast(err.message || "保存に失敗しました", "error"); }
          finally { setBusy(false); }
          return;
        }
      }
    }
  };

  // PC（広い画面）はコンテンツを中央寄せ＋最大幅で制限し、メモアプリらしい読みやすい1カラムに。
  const MAXW = 760;
  const colStyle = mob ? {} : { width: "100%", maxWidth: MAXW, margin: "0 auto" };

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      {/* 説明 */}
      <div style={{ padding: "8px 14px", fontSize: 11.5, color: T.txD, borderBottom: `1px solid ${T.bd}`, flexShrink: 0 }}>
        <div style={{ ...colStyle, display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ display: "flex", color: T.accent, flexShrink: 0 }}>{I.clip}</span>
          自分専用。スマホ⇔PCで自動同期。テキスト・URL・画像・ファイルを置いておけます。
        </div>
      </div>

      {/* 一覧 */}
      <div style={{ flex: 1, overflowY: "auto", WebkitOverflowScrolling: "touch", padding: mob ? 12 : "16px 16px 24px" }}>
        <div style={{ ...colStyle, display: "flex", flexDirection: "column", gap: 10 }}>
          {loading && <Loader msg="読み込み中" size="sm" />}
          {!loading && items.length === 0 && (
            <div style={{ textAlign: "center", color: T.txD, fontSize: 13, padding: "56px 20px" }}>
              まだ何もありません。<br />下の入力欄からテキストやファイルを追加してください。
            </div>
          )}
          {items.map(it => (
            <PocketCard key={it.id} item={it} onCopy={copyText} onDelete={removeItem} onPin={togglePin} />
          ))}
        </div>
      </div>

      {/* 入力欄 */}
      <div style={{ padding: "8px 16px 12px", borderTop: `1px solid ${T.bd}`, background: T.bg2, flexShrink: 0 }}>
        <div style={{ ...colStyle, display: "flex", alignItems: "flex-end", gap: 6, padding: "4px 4px 4px 10px", borderRadius: mob ? 18 : 12, background: T.bg3, border: `1px solid ${T.bd}` }}>
          <IconBtn title="ファイル・画像を添付" onClick={() => fileRef.current?.click()}>{I.upload}</IconBtn>
          <input ref={fileRef} type="file" style={{ display: "none" }} onChange={onPickFile} />
          <textarea
            value={inp}
            onChange={e => setInp(e.target.value)}
            onPaste={onPaste}
            onKeyDown={e => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); sendText(); } }}
            placeholder="テキスト・URLを貼り付け…（⌘/Ctrl+Enterで追加）"
            rows={1}
            style={{ flex: 1, resize: "none", maxHeight: 120, padding: "8px 0", border: "none", background: "transparent", color: T.txH, fontSize: 14, outline: "none", fontFamily: "inherit", lineHeight: 1.5 }}
          />
          <button onClick={sendText} disabled={!inp.trim() || busy}
            style={{ width: 34, height: 34, borderRadius: mob ? "50%" : 7, border: "none", background: inp.trim() && !busy ? T.accent : "transparent", color: inp.trim() && !busy ? "#fff" : T.txD, display: "flex", alignItems: "center", justifyContent: "center", cursor: inp.trim() && !busy ? "pointer" : "default", flexShrink: 0 }}>
            {I.send}
          </button>
        </div>
      </div>
    </div>
  );
};
