import { T } from "../theme.js";
import { t, locCal } from "../i18n.js";
import { getAcademicInfo } from "../academicCalendar.js";
import { WeatherChip } from "./weather.jsx";
import { DAY_NAMES } from "./ui.jsx";

const ic = (d) => <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{d}</svg>;
const ICONS = {
  class: ic(<><path d="M2 3h6a4 4 0 014 4v14a3 3 0 00-3-3H2z"/><path d="M22 3h-6a4 4 0 00-4 4v14a3 3 0 013-3h7z"/></>),
  holiday: ic(<><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></>),
  event: ic(<><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></>),
  cancel: ic(<><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></>),
  exam: ic(<><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></>),
  break: ic(<><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/></>),
  prep: ic(<><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></>),
};

/** 学年暦のバッジ（授業日・振替・祝日・休講・試験・休み期間） */
export function academicBadges(now) {
  const acal = getAcademicInfo(now);
  const out = [];
  if (acal.period) {
    const tp = acal.period.t;
    out.push({ label: locCal(acal.period.l), col: { exam: "#d97706", break: "#10b981", prep: "#6366f1" }[tp] || T.accent, icon: tp === "break" ? "break" : tp === "exam" ? "exam" : "prep" });
  }
  for (const it of acal.items) {
    if (it.type === "class") out.push({ label: `${it.q}Q ${t("home.acalClass", { dow: t("dow.s." + it.dow), n: it.n })}${it.sub ? ` ${t("home.acalMakeup")}` : ""}`, col: T.accent, icon: "class" });
    else if (it.type === "holiday") out.push({ label: t("home.acalHoliday", { label: it.label }), col: "#ef4444", icon: "holiday" });
    else if (it.type === "event") out.push({ label: it.label, col: "#0ea5e9", icon: "event" });
    else if (it.type === "cancel") out.push({ label: `${it.q}Q ${t("home.acalCancel", { label: it.label })}`, col: "#6b7280", icon: "cancel" });
    else if (it.type === "exam") out.push({ label: `${it.q}Q ${it.label}`, col: "#d97706", icon: "exam" });
  }
  return out;
}

/** 学年暦のバッジの列（押すと学年暦へ） */
function AcademicBadges({ now, setView, style }) {
  const badges = academicBadges(now);
  if (!badges.length) return null;
  return (
    <button type="button" onClick={() => setView("acadCal")} title={t("tool.acadCal")}
      style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 4, padding: 0, background: "none", border: "none", cursor: "pointer", font: "inherit", textAlign: "left", ...style }}>
      {badges.map((b, i) => (
        <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 8px", borderRadius: 6, fontSize: 11.5, fontWeight: 600, lineHeight: 1.35, background: `${b.col}15`, color: b.col }}>
          <span style={{ display: "flex" }}>{ICONS[b.icon]}</span>{b.label}
        </span>
      ))}
      <span style={{ fontSize: 13, color: T.txD, padding: "0 2px" }}>›</span>
    </button>
  );
}

/** ホームの一番上: 日付、学年暦（押すと学年暦へ）、天気のチップ */
export function HomeHeader({ now, mob, setView, weather }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 12, paddingTop: mob ? 14 : 22 }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: mob ? 22 : 26, fontWeight: 800, color: T.txH, letterSpacing: -0.3, lineHeight: 1.25 }}>
          {t("home.dateLine", { m: now.getMonth() + 1, d: now.getDate(), dow: t("dow.s." + DAY_NAMES[now.getDay()]) })}
        </div>
        <AcademicBadges now={now} setView={setView} style={{ marginTop: 6 }} />
      </div>
      <WeatherChip weather={weather} />
    </div>
  );
}
