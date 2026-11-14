import { useState } from "react";
import { createPortal } from "react-dom";
import { T } from "../theme.js";
import { t } from "../i18n.js";
import { I } from "../icons.jsx";
import { isNative } from "../capacitor.js";
import { getAuth } from "../authState.js";
import { isDemoMode } from "../demoMode.js";
import { openPortal, openIsctPortal } from "../plugins/portalWebView.js";

// ホームのショートカット（クイックアクセス）。中身はプロフィール ＞ ホーム画面 で選ぶ（最大 4 つ、端末に保存）。
// labelKey で持ち、表示のときに t() で訳す（言語の切り替えに追従させるため）。
export const QA_ALL = [
  { id: "circles", icon: I.circle, labelKey: "nav.circles" },
  { id: "calendar", icon: I.cal, labelKey: "nav.calendar" },
  { id: "events", icon: I.event, labelKey: "tool.events" },
  { id: "portal", icon: null, labelKey: "home.portal" },
  { id: "isctportal", icon: null, labelKey: "home.isctPortal" },
  { id: "friends", icon: I.users, labelKey: "nav.friends" },
  { id: "grades", icon: I.grad, labelKey: "tool.grades" },
  { id: "pomo", icon: I.play, labelKey: "tool.pomo" },
  { id: "bmarks", icon: I.bmark, labelKey: "tool.bmarks" },
  { id: "dm", icon: I.mail, labelKey: "common.dm" },
  { id: "notif", icon: I.bell, labelKey: "nav.notif" },
  { id: "navigation", icon: I.map, labelKey: "nav.map" },
  { id: "library", icon: I.book, labelKey: "nav.library" },
  { id: "search", icon: I.search, labelKey: "nav.search" },
  { id: "gym", icon: I.dumbbell, labelKey: "tool.gym" },
  { id: "tsubame", icon: I.swallow, labelKey: "tool.tsubame" },
  { id: "festival", icon: I.star, labelKey: "nav.festival" },
  { id: "career", icon: I.briefcase, labelKey: "nav.career" },
];
export const QA_DEFAULT = ["portal", "isctportal", "calendar", "events"];
const getQA = () => { try { const v = localStorage.getItem("quickAccess"); return v ? JSON.parse(v) : QA_DEFAULT; } catch { return QA_DEFAULT; } };

const PORTAL_ICONS = {
  portal: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/></svg>,
  isctportal: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="3"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="3" x2="9" y2="21"/></svg>,
};
const isPortalId = (id) => id === "portal" || id === "isctportal";

/**
 * ポータルを開く（ネイティブアプリでログインしている人だけ。アプリ内ブラウザで自動ログインする）。
 * Web ではポータルのボタンを出さない（下の Shortcuts）。以前あった Web 用の一覧画面と、ホームを開くたびの
 * 事前ログイン（/api/portal/page?warmup=1）は、開く手段がなかったので外した。
 */
export function usePortalLauncher() {
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);
  const open = async (id) => {
    setBusy(id); setError(null);
    try {
      if (id === "portal") {
        const r = await fetch("/api/auth/credentials", { headers: { "x-app-platform": "capacitor" } });
        if (!r.ok) { const b = await r.json().catch(() => ({})); throw new Error(b.error || t("home.errPortalCred")); }
        const { portalUserId, portalPassword, matrix } = await r.json();
        await openPortal({ userId: portalUserId, password: portalPassword, matrix });
      } else {
        const r = await fetch("/api/auth/credentials?type=isct", { headers: { "x-app-platform": "capacitor" } });
        if (!r.ok) { const b = await r.json().catch(() => ({})); throw new Error(b.error || t("home.errIsctCred")); }
        const { userId, password, totpCode } = await r.json();
        await openIsctPortal({ userId, password, totpCode });
      }
    } catch (e) { setError(e.message); }
    setBusy(null);
  };
  return { busy, error, setError, open };
}

/** ショートカットの列（日付のすぐ下） */
export function Shortcuts({ setView, careerOn, isMed, portal, mob }) {
  const [ids] = useState(getQA);
  const portalOk = isNative() && getAuth().status === "account" && !isDemoMode();
  const items = ids.map((id) => QA_ALL.find((q) => q.id === id)).filter(Boolean)
    .filter((q) => q.id !== "career" || careerOn)
    // 医歯学の人には TiTech ポータルを出さない
    .filter((q) => !isPortalId(q.id) || (portalOk && !(isMed && q.id === "portal")));
  if (!items.length) return null;
  return (
    <div style={{ display: "grid", gridTemplateColumns: mob ? "repeat(4, minmax(0, 1fr))" : "repeat(4, minmax(0, 120px))", gap: 8 }}>
      {items.map((q) => {
        const busy = portal.busy === q.id;
        return (
          <button key={q.id} type="button" onClick={() => (isPortalId(q.id) ? portal.open(q.id) : setView(q.id))} disabled={busy}
            style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 5, minWidth: 0, padding: "10px 4px 9px", borderRadius: 14, border: `1px solid ${T.bd}`, background: T.bg2, cursor: busy ? "wait" : "pointer", opacity: busy ? 0.6 : 1, font: "inherit" }}>
            <span style={{ display: "flex", color: T.accent }}>{q.icon || PORTAL_ICONS[q.id]}</span>
            <span style={{ maxWidth: "100%", fontSize: 11.5, fontWeight: 600, color: T.txH, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{busy ? t("home.loadingShort") : t(q.labelKey)}</span>
          </button>
        );
      })}
    </div>
  );
}

/** ポータルを開けなかったときのお知らせ（押すと消える） */
export function PortalError({ portal, mob }) {
  if (!portal.error) return null;
  return createPortal(
    <div role="alert" onClick={() => portal.setError(null)} style={{ position: "fixed", bottom: mob ? 80 : 24, left: "50%", transform: "translateX(-50%)", zIndex: 9999, padding: "10px 20px", borderRadius: 12, background: T.red, color: "#fff", fontSize: 13, fontWeight: 600, boxShadow: "0 4px 16px rgba(0,0,0,.3)", cursor: "pointer", animation: "navSlideUp .25s ease-out" }}>{portal.error}</div>,
    document.body,
  );
}
