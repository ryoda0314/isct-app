import React, { useState } from "react";
import { T } from "./theme.js";
import { I } from "./icons.jsx";
import { t } from "./i18n.js";
import { isNative } from "./capacitor.js";

const APP_VERSION = "1.0.0";

const CATEGORIES = [
  { id: "bug", labelKey: "feedback.catBug" },
  { id: "feature", labelKey: "feedback.catFeature" },
  { id: "question", labelKey: "feedback.catQuestion" },
  { id: "account", labelKey: "feedback.catAccount" },
  { id: "other", labelKey: "feedback.catOther" },
];

// 不具合の調査に役立つ端末情報をクライアントで収集する。
function collectDiagnostics({ langPref, view } = {}) {
  if (typeof window === "undefined") return {};
  let platform = "web";
  try { platform = isNative() ? `native:${window.Capacitor?.getPlatform?.() || "?"}` : "web"; } catch {}
  return {
    appVersion: APP_VERSION,
    platform,
    userAgent: navigator.userAgent || "",
    screen: `${window.innerWidth}x${window.innerHeight}`,
    lang: langPref || (typeof navigator !== "undefined" ? navigator.language : ""),
    view: view || "",
  };
}

/**
 * FeedbackModal — 不具合報告・お問い合わせを送信するモーダル
 *
 * Props:
 *   onClose: () => void
 *   langPref?: string   診断情報に含める言語設定
 *   currentView?: string 診断情報に含める現在の画面名
 */
export const FeedbackModal = ({ onClose, langPref, currentView }) => {
  const [category, setCategory] = useState("bug");
  const [subject, setSubject] = useState("");
  const [bodyText, setBodyText] = useState("");
  const [contact, setContact] = useState("");
  const [includeDiag, setIncludeDiag] = useState(true);
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async () => {
    if (!bodyText.trim()) { setError(t("feedback.bodyRequired")); return; }
    setSending(true); setError("");
    try {
      const r = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category, subject, body: bodyText, contact,
          diagnostics: includeDiag ? collectDiagnostics({ langPref, view: currentView }) : undefined,
        }),
      });
      const d = await r.json();
      if (!r.ok) { setError(d.error || t("feedback.submitFailed")); return; }
      setDone(true);
    } catch { setError(t("feedback.networkError")); }
    finally { setSending(false); }
  };

  const labelStyle = { fontSize: 12, fontWeight: 600, color: T.txD, marginBottom: 6, display: "block" };
  const inputStyle = { width: "100%", padding: "9px 12px", borderRadius: 8, border: `1px solid ${T.bd}`, background: T.bg3, color: T.txH, fontSize: 13, outline: "none", boxSizing: "border-box" };

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 10002, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ width: "100%", maxWidth: 440, maxHeight: "88vh", overflowY: "auto", borderRadius: 16, background: T.bg2, border: `1px solid ${T.bd}`, padding: 24, boxShadow: "0 8px 32px rgba(0,0,0,0.3)" }}>
        {done ? (
          <div style={{ textAlign: "center", padding: "20px 0" }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: T.txH, marginBottom: 8 }}>{t("feedback.receivedTitle")}</div>
            <div style={{ fontSize: 13, color: T.txD, marginBottom: 16, lineHeight: 1.7 }}>{t("feedback.receivedDesc")}</div>
            <button onClick={onClose} style={{ padding: "8px 24px", borderRadius: 8, border: "none", background: T.accent, color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>{t("common.close")}</button>
          </div>
        ) : (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
              <span style={{ color: T.accent, display: "flex" }}>{I.mail}</span>
              <span style={{ fontSize: 15, fontWeight: 700, color: T.txH }}>{t("feedback.title")}</span>
              <div style={{ flex: 1 }} />
              <button onClick={onClose} style={{ background: "none", border: "none", color: T.txD, cursor: "pointer", display: "flex" }}>{I.x}</button>
            </div>
            <div style={{ fontSize: 12, color: T.txD, marginBottom: 16, lineHeight: 1.7 }}>{t("feedback.intro")}</div>

            {/* カテゴリ */}
            <label style={labelStyle}>{t("feedback.categoryLabel")}</label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 16 }}>
              {CATEGORIES.map(c => (
                <button key={c.id} onClick={() => setCategory(c.id)}
                  style={{ padding: "7px 12px", borderRadius: 18, fontSize: 12, fontWeight: 600, cursor: "pointer",
                    border: `1px solid ${category === c.id ? T.accent : T.bd}`,
                    background: category === c.id ? `${T.accent}18` : T.bg3,
                    color: category === c.id ? T.accent : T.txH, transition: "all .15s" }}>
                  {t(c.labelKey)}
                </button>
              ))}
            </div>

            {/* 件名 */}
            <label style={labelStyle}>{t("feedback.subjectLabel")}</label>
            <input value={subject} onChange={e => setSubject(e.target.value)} maxLength={120}
              placeholder={t("feedback.subjectPlaceholder")} style={{ ...inputStyle, marginBottom: 16 }} />

            {/* 本文 */}
            <label style={labelStyle}>{t("feedback.bodyLabel")}</label>
            <textarea value={bodyText} onChange={e => setBodyText(e.target.value)} rows={5} maxLength={4000}
              placeholder={t("feedback.bodyPlaceholder")}
              style={{ ...inputStyle, resize: "vertical", marginBottom: 16 }} />

            {/* 連絡先 */}
            <label style={labelStyle}>{t("feedback.contactLabel")}</label>
            <input value={contact} onChange={e => setContact(e.target.value)} maxLength={200}
              placeholder={t("feedback.contactPlaceholder")} style={{ ...inputStyle, marginBottom: 16 }} />

            {/* 端末情報 */}
            <label onClick={() => setIncludeDiag(v => !v)} style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", marginBottom: 16 }}>
              <input type="checkbox" checked={includeDiag} onChange={() => setIncludeDiag(v => !v)} style={{ accentColor: T.accent }} />
              <span style={{ fontSize: 12, color: T.txD }}>{t("feedback.includeDiag")}</span>
            </label>

            {error && <div style={{ fontSize: 12, color: T.red, marginBottom: 10 }}>{error}</div>}
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button onClick={onClose} style={{ padding: "8px 16px", borderRadius: 8, border: `1px solid ${T.bd}`, background: T.bg3, color: T.txH, fontSize: 13, cursor: "pointer" }}>{t("common.cancel")}</button>
              <button onClick={handleSubmit} disabled={sending || !bodyText.trim()} style={{ padding: "8px 16px", borderRadius: 8, border: "none", background: T.accent, color: "#fff", fontSize: 13, fontWeight: 600, cursor: sending ? "default" : "pointer", opacity: sending || !bodyText.trim() ? 0.5 : 1 }}>{sending ? t("feedback.submitting") : t("feedback.submit")}</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
