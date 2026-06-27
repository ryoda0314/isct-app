import { useState, useCallback } from "react";
import { T } from "../theme.js";
import { t } from "../i18n.js";
import { isNative } from "../capacitor.js";
import { openInSystemBrowser } from "../openMaterial.js";
import { QRScanner } from "../components/QRScanner.jsx";

/** Open an http(s) URL: in-app system browser on native, new tab on web. */
function openUrl(url) {
  if (isNative()) openInSystemBrowser(url);
  else window.open(url, "_blank", "noopener");
}

/** Treat only real http(s) links as openable web URLs (avoids opening odd schemes). */
function asWebUrl(raw) {
  try {
    const u = new URL(raw.trim());
    if (u.protocol === "http:" || u.protocol === "https:") return u.href;
  } catch { /* not a URL */ }
  return null;
}

/**
 * QRView — scan a QR code (camera or photo) and, if it holds a web link, open it.
 * Non-URL codes are shown as plain text with a copy action.
 */
export function QRView({ mob = false }) {
  const [result, setResult] = useState(null); // decoded raw string, or null while scanning
  const [copied, setCopied] = useState(false);

  // QRScanner generic mode: capture the raw string, keep it, and stop the camera.
  const onResult = useCallback((raw) => {
    if (!raw) return false;
    setResult(raw);
    return true;
  }, []);

  const reset = useCallback(() => { setResult(null); setCopied(false); }, []);

  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(result);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* clipboard unavailable */ }
  }, [result]);

  const url = result ? asWebUrl(result) : null;

  return (
    <div style={{ maxWidth: 520, margin: "0 auto", padding: mob ? "12px 14px 24px" : "8px 0 24px" }}>
      {!result ? (
        <>
          <p style={{ fontSize: 13, color: T.txD, lineHeight: 1.6, margin: "4px 2px 0" }}>
            {t("qrweb.desc")}
          </p>
          <QRScanner onResult={onResult} onClose={reset} />
        </>
      ) : (
        <div style={{ marginTop: 10, padding: 16, borderRadius: 14, border: `1px solid ${T.bd}`, background: T.bg3 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: T.txD, letterSpacing: 0.4, textTransform: "uppercase", marginBottom: 10 }}>
            {url ? t("qrweb.linkFound") : t("qrweb.textFound")}
          </div>

          {/* Decoded content */}
          <div style={{
            padding: "12px 14px", borderRadius: 10, background: T.bg2, border: `1px solid ${T.bd}`,
            fontSize: 14, color: url ? T.accent : T.txH, wordBreak: "break-all", lineHeight: 1.5,
            fontWeight: url ? 600 : 400,
          }}>
            {result}
          </div>

          {url && (
            <div style={{ marginTop: 8, fontSize: 11, color: T.txD, display: "flex", alignItems: "center", gap: 6, lineHeight: 1.4 }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
              {t("qrweb.verifyWarning")}
            </div>
          )}

          {/* Actions */}
          <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
            {url && (
              <button onClick={() => openUrl(url)} style={{
                flex: 1, padding: "12px 0", borderRadius: 10, border: "none", cursor: "pointer",
                background: T.accent, color: "#fff", fontSize: 14, fontWeight: 700,
                display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
              }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                {t("qrweb.openLink")}
              </button>
            )}
            <button onClick={copy} style={{
              flex: url ? "0 0 auto" : 1, padding: url ? "12px 16px" : "12px 0", borderRadius: 10, cursor: "pointer",
              border: `1px solid ${T.bd}`, background: T.bg2, color: copied ? T.green : T.txH,
              fontSize: 13, fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
            }}>
              {copied ? (
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
              ) : (
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
              )}
              {copied ? t("qrweb.copied") : t("qrweb.copy")}
            </button>
          </div>

          <button onClick={reset} style={{
            width: "100%", marginTop: 8, padding: "10px 0", borderRadius: 10,
            border: `1px solid ${T.bd}`, background: "none", color: T.txD,
            fontSize: 13, fontWeight: 600, cursor: "pointer",
          }}>{t("qrweb.scanAgain")}</button>
        </div>
      )}
    </div>
  );
}
