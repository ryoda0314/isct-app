import { useState, useEffect, useRef } from "react";
import { T } from "../theme.js";
import { t } from "../i18n.js";

/* ──────────────────────────────────────────────
   パスワード付きPDF 共通部品
   ・教員が LMS の資料説明に「パスワード：amt」のように書くことが多いので、
     説明文から候補を抜き出してワンタップで試せるようにする
   ・一度開けたパスワードはコース単位で端末(localStorage)に覚え、次回は自動で試す
     (配布資料のパスワードは同じコースで使い回されることが多い)
   ────────────────────────────────────────────── */

const HINT_RE = /(?:パスワード|パス|ＰＷ|PW|Pw|pw|password|Password|PASSWORD|pass(?:word)?|passcode|暗証番号)\s*(?:は|が|[:：=＝])\s*[「『"'“]?([^\s「」『』"'“”、。，,）)]+)/g;

/** 説明文などのテキストからパスワード候補を抜き出す（重複除去・出現順） */
export function extractPasswordHints(...texts) {
  const out = [];
  for (const text of texts) {
    if (!text) continue;
    for (const m of String(text).matchAll(HINT_RE)) {
      const pw = m[1].replace(/[.．。]+$/, "");
      if (pw && pw.length <= 64 && !out.includes(pw)) out.push(pw);
    }
  }
  return out;
}

const SAVE_KEY = k => `pdfPw:${k}`;
export function getSavedPdfPasswords(key) {
  if (!key) return [];
  try { const v = JSON.parse(localStorage.getItem(SAVE_KEY(key)) || "[]"); return Array.isArray(v) ? v : []; } catch { return []; }
}
export function savePdfPassword(key, pw) {
  if (!key || !pw) return;
  try {
    const list = [pw, ...getSavedPdfPasswords(key).filter(x => x !== pw)].slice(0, 5);
    localStorage.setItem(SAVE_KEY(key), JSON.stringify(list));
  } catch {}
}

/** 自動で試すパスワードの順番: 覚えているもの → 説明文の候補 */
export function passwordCandidates(key, hints = []) {
  const out = [];
  for (const p of [...getSavedPdfPasswords(key), ...hints]) if (p && !out.includes(p)) out.push(p);
  return out;
}

/**
 * パスワード入力フォーム。overlay=true でモーダル表示、false で埋め込み表示。
 * onSubmit(pw) は Promise を返してよい（検証中はボタンを無効化）。
 */
export function PdfPasswordPrompt({ fileName, incorrect = false, hints = [], note = "", onSubmit, onCancel, overlay = false }) {
  const [pw, setPw] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef(null);
  useEffect(() => { inputRef.current?.focus(); }, [incorrect]);

  const submit = async (value) => {
    const v = (value ?? pw);
    if (!v || busy) return;
    setBusy(true);
    try { await onSubmit?.(v); } finally { setBusy(false); }
  };

  const box = (
    <div onClick={e => e.stopPropagation()} role="dialog" aria-label={t("pdfpw.title")}
      style={{ width: "100%", maxWidth: 380, background: T.bg2, border: `1px solid ${T.bd}`, borderRadius: 14, padding: 18, boxShadow: overlay ? "0 12px 40px rgba(0,0,0,.4)" : "none", boxSizing: "border-box" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={T.accent} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0110 0v4" /></svg>
        <div style={{ fontSize: 15, fontWeight: 700, color: T.txH }}>{t("pdfpw.title")}</div>
      </div>
      {fileName && <div style={{ fontSize: 12, color: T.txD, marginBottom: 10, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{fileName}</div>}
      {note && <div style={{ fontSize: 12, color: T.txH, background: T.bg3, borderRadius: 8, padding: "8px 10px", marginBottom: 10, whiteSpace: "pre-wrap", wordBreak: "break-word", lineHeight: 1.5, maxHeight: 120, overflowY: "auto" }}>{note}</div>}
      {hints.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
          {hints.map(h => (
            <button key={h} onClick={() => { setPw(h); submit(h); }} disabled={busy}
              style={{ padding: "5px 10px", borderRadius: 999, border: `1px solid ${T.accent}60`, background: `${T.accent}12`, color: T.accent, fontSize: 12, fontWeight: 600, cursor: busy ? "wait" : "pointer" }}>
              {t("pdfpw.tryHint", { pw: h })}
            </button>
          ))}
        </div>
      )}
      <form onSubmit={e => { e.preventDefault(); submit(); }} style={{ display: "flex", gap: 6 }}>
        <div style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", border: `1px solid ${incorrect ? T.red : T.bd}`, borderRadius: 8, background: T.bg, padding: "0 4px 0 10px" }}>
          <input ref={inputRef} type={show ? "text" : "password"} value={pw} onChange={e => setPw(e.target.value)}
            autoComplete="off" autoCapitalize="off" autoCorrect="off" spellCheck={false}
            placeholder={t("pdfpw.placeholder")} aria-label={t("pdfpw.placeholder")}
            style={{ flex: 1, minWidth: 0, border: "none", outline: "none", background: "transparent", color: T.txH, fontSize: 14, padding: "9px 0" }} />
          <button type="button" onClick={() => setShow(s => !s)} style={{ border: "none", background: "transparent", color: T.txD, fontSize: 11, cursor: "pointer", padding: "4px 6px" }}>
            {show ? t("pdfpw.hide") : t("pdfpw.show")}
          </button>
        </div>
        <button type="submit" disabled={!pw || busy}
          style={{ padding: "0 14px", borderRadius: 8, border: "none", background: pw && !busy ? T.accent : `${T.accent}50`, color: "#fff", fontSize: 13, fontWeight: 700, cursor: pw && !busy ? "pointer" : "default", whiteSpace: "nowrap" }}>
          {busy ? t("pdfpw.checking") : t("pdfpw.open")}
        </button>
      </form>
      {incorrect && <div role="alert" style={{ marginTop: 8, fontSize: 12, color: T.red, fontWeight: 600 }}>{t("pdfpw.incorrect")}</div>}
      <div style={{ marginTop: 10, fontSize: 11, color: T.txD, lineHeight: 1.5 }}>{t("pdfpw.privacy")}</div>
      {onCancel && (
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 10 }}>
          <button onClick={onCancel} style={{ padding: "6px 12px", borderRadius: 8, border: `1px solid ${T.bd}`, background: "transparent", color: T.txD, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>{t("common.cancel")}</button>
        </div>
      )}
    </div>
  );

  if (!overlay) return <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>{box}</div>;
  return (
    <div onClick={onCancel} style={{ position: "fixed", inset: 0, zIndex: 230, background: "rgba(0,0,0,.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      {box}
    </div>
  );
}
