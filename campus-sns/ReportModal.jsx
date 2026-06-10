import React, { useState } from "react";
import { T } from "./theme.js";
import { I } from "./icons.jsx";
import { t } from "./i18n.js";

const REASONS = [
  { id: "spam", labelKey: "report.reasonSpam" },
  { id: "harassment", labelKey: "report.reasonHarassment" },
  { id: "inappropriate", labelKey: "report.reasonInappropriate" },
  { id: "copyright", labelKey: "report.reasonCopyright" },
  { id: "other", labelKey: "report.reasonOther" },
];

/**
 * ReportModal — ユーザーがコンテンツを通報するためのモーダル
 *
 * Props:
 *   targetType: 'post' | 'comment' | 'message' | 'dm' | 'user' | 'circle'
 *   targetId: string | number
 *   targetUserId?: number (通報対象ユーザーのID)
 *   onClose: () => void
 */
export const ReportModal = ({ targetType, targetId, targetUserId, onClose }) => {
  const [reason, setReason] = useState("");
  const [detail, setDetail] = useState("");
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async () => {
    if (!reason) { setError(t("report.selectReasonError")); return; }
    setSending(true); setError("");
    try {
      const r = await fetch("/api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetType, targetId: String(targetId), targetUserId, reason, detail }),
      });
      const d = await r.json();
      if (!r.ok) { setError(d.error || t("report.submitFailed")); return; }
      setDone(true);
    } catch { setError(t("report.networkError")); }
    finally { setSending(false); }
  };

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 9999, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ width: "100%", maxWidth: 400, borderRadius: 16, background: T.bg2, border: `1px solid ${T.bd}`, padding: 24, boxShadow: "0 8px 32px rgba(0,0,0,0.3)" }}>
        {done ? (
          <div style={{ textAlign: "center", padding: "20px 0" }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: T.txH, marginBottom: 8 }}>{t("report.receivedTitle")}</div>
            <div style={{ fontSize: 13, color: T.txD, marginBottom: 16 }}>{t("report.receivedDesc")}</div>
            <button onClick={onClose} style={{ padding: "8px 24px", borderRadius: 8, border: "none", background: T.accent, color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>{t("common.close")}</button>
          </div>
        ) : (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
              <span style={{ color: T.red, display: "flex" }}>{I.flag}</span>
              <span style={{ fontSize: 15, fontWeight: 700, color: T.txH }}>{t("report.title")}</span>
              <div style={{ flex: 1 }} />
              <button onClick={onClose} style={{ background: "none", border: "none", color: T.txD, cursor: "pointer", display: "flex" }}>{I.x}</button>
            </div>
            <div style={{ fontSize: 13, color: T.txD, marginBottom: 12 }}>{t("report.selectReasonLabel")}</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 16 }}>
              {REASONS.map(r => (
                <label key={r.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 10, background: reason === r.id ? `${T.accent}12` : T.bg3, border: `1px solid ${reason === r.id ? T.accent : T.bd}`, cursor: "pointer", transition: "all .15s" }}>
                  <input type="radio" name="reason" value={r.id} checked={reason === r.id} onChange={() => setReason(r.id)} style={{ accentColor: T.accent }} />
                  <span style={{ fontSize: 13, color: T.txH }}>{t(r.labelKey)}</span>
                </label>
              ))}
            </div>
            <textarea
              value={detail} onChange={e => setDetail(e.target.value)}
              placeholder={t("report.detailPlaceholder")}
              rows={3}
              style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: `1px solid ${T.bd}`, background: T.bg3, color: T.txH, fontSize: 13, outline: "none", resize: "vertical", boxSizing: "border-box", marginBottom: 12 }}
            />
            {error && <div style={{ fontSize: 12, color: T.red, marginBottom: 8 }}>{error}</div>}
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button onClick={onClose} style={{ padding: "8px 16px", borderRadius: 8, border: `1px solid ${T.bd}`, background: T.bg3, color: T.txH, fontSize: 13, cursor: "pointer" }}>{t("common.cancel")}</button>
              <button onClick={handleSubmit} disabled={sending || !reason} style={{ padding: "8px 16px", borderRadius: 8, border: "none", background: T.red, color: "#fff", fontSize: 13, fontWeight: 600, cursor: sending ? "default" : "pointer", opacity: sending || !reason ? 0.5 : 1 }}>{sending ? t("report.submitting") : t("report.submit")}</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
