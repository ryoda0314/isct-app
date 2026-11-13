import React from "react";
import { T } from "../theme.js";
import { t } from "../i18n.js";
import { I } from "../icons.jsx";
import { FEATURES } from "../features.js";

// ログインが必要な機能を開いたときの紹介画面（ログイン任意化）。旧 LockedView の置き換え。
// 機能を隠さず「ログインすると何ができるか」「ログインで何を預かるか」を示し、
// ［ログインして使う］［戻る］を選べるようにする。ログインを急かす文言は入れない。

const LOCK = <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>;
const SMALL_LOCK = <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>;
const CHECK = <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>;

export const featureTitle = (id) => {
  const f = FEATURES[id] || {};
  return f.titleKey ? t(f.titleKey) : (f.title || "");
};

export function FeatureGate({ id, onLogin, onBack }) {
  const f = FEATURES[id] || {};
  const title = featureTitle(id) || t("app.loginRequired");
  const lms = f.need === "lms";
  const points = f.points || [];
  return (
    <div style={{ flex: 1, minHeight: 0, overflowY: "auto", display: "flex", justifyContent: "center", padding: "28px 20px" }}>
      <div style={{ maxWidth: 380, width: "100%", margin: "auto 0", display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
        <div style={{ width: 60, height: 60, borderRadius: 18, background: `${T.accent}14`, border: `1px solid ${T.accent}30`, color: T.accent, display: "flex", alignItems: "center", justifyContent: "center" }}>
          {I[f.icon] || LOCK}
        </div>
        <div style={{ fontSize: 18, fontWeight: 700, color: T.txH, textAlign: "center" }}>{title}</div>
        <div style={{ fontSize: 13, color: T.txD, textAlign: "center", lineHeight: 1.6 }}>{t(lms ? "gate.needLms" : "gate.needAccount")}</div>
        {points.length > 0 && (
          <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: 8, padding: "12px 14px", borderRadius: 12, background: T.bg2, border: `1px solid ${T.bd}` }}>
            {points.map((k) => (
              <div key={k} style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: 13, color: T.txH, lineHeight: 1.5 }}>
                <span style={{ color: T.accent, display: "flex", marginTop: 3, flexShrink: 0 }}>{CHECK}</span>
                <span>{t(k)}</span>
              </div>
            ))}
          </div>
        )}
        {f.guestNoteKey && (
          <div style={{ fontSize: 12, color: T.txD, textAlign: "center", lineHeight: 1.6 }}>
            {t(f.guestNoteKey)} <a href="/support" target="_blank" rel="noopener noreferrer" style={{ color: T.accent }}>/support</a>
          </div>
        )}
        <button onClick={onLogin} style={{ width: "100%", marginTop: 4, padding: "12px 0", borderRadius: 12, border: "none", background: T.accent, color: "#fff", fontSize: 15, fontWeight: 700, cursor: "pointer" }}>
          {t("gate.login")}
        </button>
        {onBack && (
          <button onClick={onBack} style={{ width: "100%", padding: "10px 0", borderRadius: 12, border: `1px solid ${T.bd}`, background: T.bg2, color: T.txH, fontSize: 14, fontWeight: 600, cursor: "pointer" }}>
            {t("common.back")}
          </button>
        )}
        <div style={{ display: "flex", alignItems: "flex-start", gap: 6, fontSize: 11, color: T.txD, lineHeight: 1.6, marginTop: 4 }}>
          <span style={{ display: "flex", marginTop: 3, flexShrink: 0 }}>{SMALL_LOCK}</span>
          <span>{t("gate.credNote")}</span>
        </div>
      </div>
    </div>
  );
}

// 画面の一部だけログインが要るとき（投稿欄・チェックインボタンなど）の 1 行版
export function InlineLoginPrompt({ msg, onLogin, style }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "10px 12px", borderRadius: 10, background: T.bg2, border: `1px solid ${T.bd}`, fontSize: 12, color: T.txD, ...style }}>
      <span style={{ display: "flex" }}>{SMALL_LOCK}</span>
      <span>{msg}</span>
      <button onClick={onLogin} style={{ background: "none", border: "none", color: T.accent, fontSize: 12, fontWeight: 700, cursor: "pointer", padding: "0 2px" }}>{t("setup.login")}</button>
    </div>
  );
}
