import { useState, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { T } from "../theme.js";
import { t, locName } from "../i18n.js";
import { I } from "../icons.jsx";
import { DEPTS } from "../data.js";
import { openMaterial } from "../openMaterial.js";
import { useAuth, openLogin } from "../authState.js";
import { useCurrentUser } from "../hooks/useCurrentUser.js";
import { useCareer } from "../hooks/useCareer.js";
import { useCareerPublic } from "../careerAccess.js";
import {
  useCareerPrefs, buildList, hasInterests, matchListing, eligibility,
  targetFromYearGroup, fieldsForDept, markSeen, getSeenAt, getPrefs,
  useSaved, toggleSaved, removeSaved,
} from "../careerPrefs.js";
import { buildICalendar } from "../../lib/ical.js";
import { saveIcs } from "../icsExport.js";
import { CAREER_FIELDS, CAREER_SKILLS } from "../../lib/career-tags.js";

// キャリア: インターン・就職・謝礼や賞金のあるイベントを、自分の興味で探す（計画書 3〜4 章）。
// - 掲載は /api/career（全件）。興味での照合・絞り込み・並べ替えは端末の中だけ（careerPrefs.js）。
// - 「興味に合う」と「すべて」はいつでも切り替えられる（合わない募集を見えなくしない）。
// - 報酬は種類のラベルを先に、金額は募集元の記載どおりに出す。PR・提携はラベルを付けるだけで順番は変えない。
// - 応募は公式ページで。詳細から誤り・終了を知らせられる（苦情窓口）。

const CONTACT_EMAIL = "sciencetokyo.app@gmail.com"; // app/support と同じ公開の窓口

const KINDS = ["all", "intern", "job", "event"];
const KIND_COLOR = { intern: "#3b82f6", job: "#10b981", event: "#f59e0b" };
const REWARD_COLOR = { all: "#16a34a", conditional: "#0d9488", lottery: "#8b5cf6", prize: "#db2777", travel: "#64748b", none: "#64748b" };

const md = (ms) => { const d = new Date(ms); return `${d.getMonth() + 1}/${d.getDate()}`; };
const ymdToMs = (s) => Date.parse(`${s}T23:59:59+09:00`);
const gradLabel = (y) => t("career.gradY", { yy: String(y).slice(2), y });
const deptName = (code) => (DEPTS[code] ? locName(DEPTS[code]) : code);
const openLink = (url, mob) => openMaterial({ fileurl: url, fileType: "link" }, undefined, { mob });
const policyUrl = () => (typeof window !== "undefined" ? `${window.location.origin}/career-policy` : "/career-policy");

// 締切（または開催日）の表示と、あと何日か
function dueBadge(item) {
  if (item.deadline) {
    const ms = ymdToMs(item.deadline);
    const days = Math.ceil((ms - Date.now()) / 86400e3);
    return { text: t("career.deadline", { d: md(ms) }), soon: days <= 3, days };
  }
  if (item.starts_at) return { text: t("career.starts", { d: md(Date.parse(item.starts_at)) }), soon: false };
  return { text: t("career.rolling"), soon: false };
}

function targetText(item) {
  const parts = [];
  if (item.grad_years?.length) parts.push(item.grad_years.map(gradLabel).join("・"));
  if (item.degrees?.length) parts.push(item.degrees.map((d) => t(`career.deg.${d}`)).join("・"));
  return parts.join(" ");
}

// カード上部の短い属性（種類ごと）
function attrChips(item) {
  const out = [];
  if (item.kind === "event") {
    if (item.reward_kind) out.push({ text: t(`career.r.${item.reward_kind}`), color: REWARD_COLOR[item.reward_kind] });
  } else {
    if (item.kind === "intern" && item.duration) out.push({ text: t(`career.dur.${item.duration}`) });
    if (item.pay_kind) out.push({ text: t(`career.pay.${item.pay_kind}`), color: item.pay_kind === "paid" ? "#16a34a" : undefined });
  }
  if (item.remote) out.push({ text: t(`career.remote.${item.remote}`) });
  return out;
}

const Chip = ({ children, color, solid }) => (
  <span style={{ display: "inline-flex", alignItems: "center", fontSize: 10.5, fontWeight: 700, padding: "2px 7px", borderRadius: 6, whiteSpace: "nowrap", color: solid ? "#fff" : (color || T.txD), background: solid ? (color || T.accent) : `${color || T.txD}17` }}>{children}</span>
);

const PromoLabel = ({ item }) => item.promo ? <Chip color="#b45309">{t(`career.promo.${item.promo}`)}</Chip> : null;

function reasonText(r) {
  if (r.t === "field") return t(`career.f.${r.id}`);
  if (r.t === "req") return t("career.why.req", { s: t(`career.s.${r.id}`) });
  if (r.t === "pref") return t("career.why.pref", { s: t(`career.s.${r.id}`) });
  if (r.t === "dept") return t("career.why.dept", { d: deptName(r.id) });
  return "";
}

// ── カード ──
function CareerCard({ row, onOpen, showReasons, isNew, isSaved }) {
  const { item, m, elig } = row;
  const due = dueBadge(item);
  const kc = KIND_COLOR[item.kind];
  const money = item.kind === "event" ? item.reward_text : item.pay_text;
  return (
    <button onClick={onOpen} style={{ width: "100%", textAlign: "left", font: "inherit", cursor: "pointer", borderRadius: 14, border: `1px solid ${T.bd}`, background: T.bg2, padding: "12px 13px", display: "flex", flexDirection: "column", gap: 6, boxShadow: "0 1px 3px rgba(0,0,0,.05)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap" }}>
        <Chip color={kc} solid>{t(`career.kind.${item.kind}`)}</Chip>
        {attrChips(item).map((c, i) => <Chip key={i} color={c.color}>{c.text}</Chip>)}
        <PromoLabel item={item} />
        {isNew && <Chip color={T.red}>{t("career.new")}</Chip>}
        {isSaved && <Chip color={T.accent}>★ {t("career.saved")}</Chip>}
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 11.5, fontWeight: 700, color: due.soon ? T.red : T.txD, whiteSpace: "nowrap" }}>{due.text}</span>
      </div>
      <div style={{ fontSize: 15, fontWeight: 700, color: T.txH, lineHeight: 1.35, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{item.title}</div>
      <div style={{ fontSize: 12, color: T.tx, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{item.org}{targetText(item) ? <span style={{ color: T.txD }}>{" ・ "}{targetText(item)}</span> : null}</div>
      {showReasons && m.reasons.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
          {m.reasons.slice(0, 4).map((r, i) => <span key={i} style={{ fontSize: 11, fontWeight: 600, color: T.accent, background: `${T.accent}14`, borderRadius: 6, padding: "1px 7px" }}>✓ {reasonText(r)}</span>)}
        </div>
      )}
      <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11.5, color: T.txD }}>
        {money ? <span style={{ flex: 1, minWidth: 0, color: T.tx, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{money}</span> : <span style={{ flex: 1 }} />}
        {elig === "no" && <span style={{ color: T.orange, fontWeight: 700 }}>{t("career.target.notYou")}</span>}
        <span style={{ whiteSpace: "nowrap" }}>{t("career.checked", { d: md(Date.parse(item.checked_at)) })}</span>
      </div>
    </button>
  );
}

// ── 下から出るシート（PC では中央） ──
function Sheet({ open, onClose, mob, children, label }) {
  useEffect(() => {
    if (!open) return;
    const k = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [open, onClose]);
  if (!open || typeof document === "undefined") return null;
  return createPortal(
    <div role="dialog" aria-label={label} onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,.42)", display: "flex", alignItems: mob ? "flex-end" : "center", justifyContent: "center" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: mob ? "100%" : 560, maxHeight: mob ? "88vh" : "86vh", overflowY: "auto", background: T.bg, borderRadius: mob ? "18px 18px 0 0" : 16, padding: mob ? "8px 16px calc(20px + env(safe-area-inset-bottom))" : "18px 22px 22px", boxShadow: "0 -8px 40px rgba(0,0,0,.25)" }}>
        {mob && <div style={{ width: 38, height: 4, borderRadius: 2, background: T.bd, margin: "4px auto 12px" }} />}
        {children}
      </div>
    </div>,
    document.body,
  );
}

const Row = ({ label, children }) => children ? (
  <div style={{ display: "flex", gap: 12, padding: "9px 0", borderTop: `1px solid ${T.bd}` }}>
    <div style={{ width: 84, flexShrink: 0, fontSize: 12, color: T.txD, fontWeight: 600 }}>{label}</div>
    <div style={{ flex: 1, minWidth: 0, fontSize: 13, color: T.txH, lineHeight: 1.6, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{children}</div>
  </div>
) : null;

// ── 詳細 ──
// 締切（終日）と開催日時を .ics にして、端末のカレンダーに入れてもらう（サーバーには何も保存しない）
async function addToCalendar(item) {
  const events = [];
  const desc = `${item.org}\n${item.apply_url}`;
  if (item.deadline) {
    const end = new Date(Date.parse(`${item.deadline}T00:00:00Z`) + 86400e3).toISOString().slice(0, 10);
    events.push({ uid: `career-${item.id}-deadline`, summary: t("career.ics.deadline", { t: item.title }), start: item.deadline, end, allDay: true, description: desc, free: true });
  }
  if (item.starts_at) {
    events.push({ uid: `career-${item.id}-event`, summary: item.title, start: new Date(item.starts_at), end: item.ends_at ? new Date(item.ends_at) : new Date(Date.parse(item.starts_at) + 3600e3), location: item.location || undefined, description: desc });
  }
  if (!events.length) return;
  await saveIcs(buildICalendar({ name: "ScienceTokyo App", events }), `career-${item.id.slice(0, 8)}.ics`);
}

function CareerDetail({ item, mob, onClose, prefs, dept }) {
  const auth = useAuth();
  const savedMap = useSaved();
  const [reportOpen, setReportOpen] = useState(false);
  const [reportText, setReportText] = useState("");
  const [reportState, setReportState] = useState(null); // sending | done | error
  if (!item) return null;
  const m = matchListing(item, prefs, dept);
  const elig = eligibility(item, prefs);
  const partner = item.source?.startsWith("partner:") ? item.promo_note || item.source.slice(8) : null;
  const dates = [
    item.starts_at ? `${new Date(item.starts_at).toLocaleString("ja-JP", { month: "numeric", day: "numeric", weekday: "short", hour: "2-digit", minute: "2-digit" })}${item.ends_at ? ` 〜 ${new Date(item.ends_at).toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}` : ""}` : null,
    item.deadline ? t("career.deadline", { d: item.deadline.replace(/-/g, "/") }) : (!item.starts_at ? t("career.rolling") : null),
  ].filter(Boolean).join("\n");
  const sendReport = async () => {
    setReportState("sending");
    try {
      const r = await fetch("/api/reports", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ targetType: "career", targetId: item.id, reason: "inaccurate", detail: `${item.title}（${item.org}）\n${reportText}`.slice(0, 2000) }) });
      setReportState(r.ok || r.status === 409 ? "done" : "error");
    } catch { setReportState("error"); }
  };
  const mailto = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(`[キャリア掲載] ${item.title}`)}&body=${encodeURIComponent(`掲載ID: ${item.id}\n${item.title}（${item.org}）\n\n内容の誤り・終了など:\n`)}`;
  return (
    <Sheet open onClose={onClose} mob={mob} label={item.title}>
      <div style={{ display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap", marginBottom: 8 }}>
        <Chip color={KIND_COLOR[item.kind]} solid>{t(`career.kind.${item.kind}`)}</Chip>
        {attrChips(item).map((c, i) => <Chip key={i} color={c.color}>{c.text}</Chip>)}
        <PromoLabel item={item} />
        <span style={{ flex: 1 }} />
        <button onClick={onClose} aria-label={t("common.close")} style={{ border: "none", background: T.bg3, borderRadius: "50%", width: 28, height: 28, color: T.txD, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>{I.x}</button>
      </div>
      <div style={{ fontSize: 18, fontWeight: 800, color: T.txH, lineHeight: 1.35 }}>{item.title}</div>
      <div style={{ fontSize: 13, color: T.tx, margin: "4px 0 10px" }}>{item.org}</div>
      {item.promo && <div style={{ fontSize: 11.5, color: "#b45309", background: "#b4530912", borderRadius: 8, padding: "6px 9px", marginBottom: 10 }}>{t(`career.promoNote.${item.promo}`)}{item.promo_note ? `（${item.promo_note}）` : ""}</div>}
      {m.reasons.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 10 }}>
          {m.reasons.map((r, i) => <span key={i} style={{ fontSize: 11.5, fontWeight: 600, color: T.accent, background: `${T.accent}14`, borderRadius: 6, padding: "2px 8px" }}>✓ {reasonText(r)}</span>)}
        </div>
      )}
      <Row label={t("career.detail.summary")}>{item.summary}</Row>
      <Row label={t("career.detail.target")}>{[targetText(item) || t("career.target.unknown"), elig === "no" ? `（${t("career.target.notYou")}）` : ""].join(" ")}</Row>
      <Row label={t("career.detail.skillsReq")}>{(item.skills_req || []).map((s) => t(`career.s.${s}`)).join("、")}</Row>
      <Row label={t("career.detail.skillsPref")}>{(item.skills_pref || []).map((s) => t(`career.s.${s}`)).join("、")}</Row>
      <Row label={t("career.detail.depts")}>{(item.depts || []).map(deptName).join("、")}</Row>
      <Row label={t("career.detail.fields")}>{(item.fields || []).map((f) => t(`career.f.${f}`)).join("、")}</Row>
      <Row label={t("career.detail.period")}>{[item.kind === "intern" && item.duration ? t(`career.dur.${item.duration}`) : null, item.period_text, item.intern_type ? t(`career.it.${item.intern_type}`) : null].filter(Boolean).join(" ・ ")}</Row>
      <Row label={t("career.detail.place")}>{[item.remote ? t(`career.remote.${item.remote}`) : null, item.location].filter(Boolean).join(" ・ ")}</Row>
      {item.kind === "event"
        ? <Row label={t("career.detail.reward")}>{item.reward_kind ? `${t(`career.r.${item.reward_kind}`)}${item.reward_text ? `\n${item.reward_text}` : ""}\n${t("career.asStated")}` : null}</Row>
        : <Row label={t("career.detail.pay")}>{item.pay_kind || item.pay_text ? `${item.pay_kind ? t(`career.pay.${item.pay_kind}`) : ""}${item.pay_text ? `\n${item.pay_text}` : ""}\n${t("career.asStated")}` : null}</Row>}
      <Row label={t("career.detail.dates")}>{dates}</Row>
      <Row label={t("career.detail.source")}>{`${partner ? t("career.src.partner", { name: partner }) : t(`career.src.${item.source === "tip" ? "tip" : "manual"}`)}\n${t("career.detail.checkedNote", { d: new Date(item.checked_at).toLocaleDateString("ja-JP") })}`}</Row>

      <button onClick={() => openLink(item.apply_url, mob)} style={{ width: "100%", marginTop: 14, display: "flex", alignItems: "center", justifyContent: "center", gap: 7, padding: "13px 16px", borderRadius: 13, border: "none", background: T.accent, color: "#fff", fontSize: 14.5, fontWeight: 800, cursor: "pointer" }}>
        {partner ? t("career.openPartner", { name: partner }) : t("career.open")} <span style={{ display: "flex" }}>{I.arr}</span>
      </button>
      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
        <button onClick={() => toggleSaved(item)} aria-pressed={!!savedMap[item.id]} style={{ flex: 1, padding: "10px 12px", borderRadius: 11, border: `1px solid ${savedMap[item.id] ? T.accent : T.bd}`, background: savedMap[item.id] ? `${T.accent}14` : T.bg2, color: savedMap[item.id] ? T.accent : T.txH, fontSize: 13, fontWeight: 700, cursor: "pointer" }}>{savedMap[item.id] ? `★ ${t("career.saved")}` : `☆ ${t("career.save")}`}</button>
        {(item.deadline || item.starts_at) && <button onClick={() => addToCalendar(item)} style={{ flex: 1, padding: "10px 12px", borderRadius: 11, border: `1px solid ${T.bd}`, background: T.bg2, color: T.txH, fontSize: 13, fontWeight: 700, cursor: "pointer" }}>{t("career.toCalendar")}</button>}
      </div>
      <div style={{ fontSize: 11, color: T.txD, lineHeight: 1.6, marginTop: 8 }}>{t("career.applyNote")}</div>

      <div style={{ marginTop: 14, borderTop: `1px solid ${T.bd}`, paddingTop: 10 }}>
        {!reportOpen ? (
          <button onClick={() => setReportOpen(true)} style={{ border: "none", background: "none", padding: 0, color: T.txD, fontSize: 12, textDecoration: "underline", cursor: "pointer" }}>{t("career.reportLink")}</button>
        ) : auth.status === "account" ? (
          reportState === "done" ? <div style={{ fontSize: 12.5, color: T.green }}>{t("career.reportDone")}</div> : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <textarea value={reportText} onChange={(e) => setReportText(e.target.value)} placeholder={t("career.reportPlaceholder")} rows={3} maxLength={1500} style={{ width: "100%", boxSizing: "border-box", padding: "8px 10px", borderRadius: 9, border: `1px solid ${T.bd}`, background: T.bg2, color: T.txH, fontSize: 13, resize: "vertical", font: "inherit" }} />
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <button disabled={reportState === "sending"} onClick={sendReport} style={{ padding: "8px 16px", borderRadius: 9, border: "none", background: T.accent, color: "#fff", fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>{t("career.reportSend")}</button>
                {reportState === "error" && <span style={{ fontSize: 12, color: T.red }}>{t("career.loadError")}</span>}
              </div>
            </div>
          )
        ) : (
          <div style={{ fontSize: 12, color: T.txD, lineHeight: 1.7 }}>
            {t("career.reportGuestNote")}
            <div><a href={mailto} style={{ color: T.accent, fontWeight: 700 }}>{t("career.reportGuest")}</a>（{CONTACT_EMAIL}）</div>
          </div>
        )}
      </div>
    </Sheet>
  );
}

const PillBtn = ({ on, onClick, children }) => (
  <button type="button" onClick={onClick} aria-pressed={on} style={{ padding: "6px 12px", borderRadius: 20, border: `1px solid ${on ? T.accent : T.bd}`, background: on ? `${T.accent}1f` : T.bg2, color: on ? T.accent : T.txD, fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>{children}</button>
);
const GroupLabel = ({ children }) => <div style={{ fontSize: 11, fontWeight: 800, color: T.txD, letterSpacing: .3, margin: "14px 0 7px" }}>{children}</div>;

// ── 興味の設定 ──
function PrefsSheet({ open, onClose, mob, prefs, setPrefs, user }) {
  const [fields, setFields] = useState(prefs.fields);
  const [skills, setSkills] = useState(prefs.skills);
  const [degree, setDegree] = useState(prefs.degree);
  const [gradYear, setGradYear] = useState(prefs.gradYear);
  const [showSkills, setShowSkills] = useState(prefs.skills.length > 0);
  useEffect(() => { if (open) { setFields(prefs.fields); setSkills(prefs.skills); setDegree(prefs.degree); setGradYear(prefs.gradYear); setShowSkills(prefs.skills.length > 0); } }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const tog = (arr, set, id) => set(arr.includes(id) ? arr.filter((x) => x !== id) : [...arr, id]);
  const fromYear = targetFromYearGroup(user?.yearGroup);
  const deptFields = fieldsForDept(user?.myDept);
  const y0 = new Date().getFullYear();
  const years = Array.from({ length: 8 }, (_, i) => y0 + i);
  const save = () => {
    setPrefs((p) => ({ ...p, fields, skills, degree, gradYear: gradYear ? Number(gradYear) : null, setup: true, mode: fields.length + skills.length ? "mine" : "all" }));
    onClose();
  };
  return (
    <Sheet open={open} onClose={onClose} mob={mob} label={t("career.p.title")}>
      <div style={{ display: "flex", alignItems: "center", marginBottom: 4 }}>
        <div style={{ flex: 1, fontSize: 17, fontWeight: 800, color: T.txH }}>{t("career.p.title")}</div>
        <button onClick={onClose} aria-label={t("common.close")} style={{ border: "none", background: T.bg3, borderRadius: "50%", width: 28, height: 28, color: T.txD, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>{I.x}</button>
      </div>
      <div style={{ fontSize: 11.5, color: T.txD, lineHeight: 1.6 }}>{t("career.p.note")}</div>

      <GroupLabel>{t("career.p.fields")}</GroupLabel>
      {deptFields.length > 0 && (
        <button type="button" onClick={() => setFields((f) => [...new Set([...f, ...deptFields])])} style={{ marginBottom: 8, border: `1px dashed ${T.accent}`, background: "transparent", color: T.accent, borderRadius: 9, padding: "5px 10px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
          {t("career.p.fromDept", { d: deptName(user.myDept) })}
        </button>
      )}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {CAREER_FIELDS.map((id) => <PillBtn key={id} on={fields.includes(id)} onClick={() => tog(fields, setFields, id)}>{t(`career.f.${id}`)}</PillBtn>)}
      </div>

      {!showSkills ? (
        <button type="button" onClick={() => setShowSkills(true)} style={{ marginTop: 14, border: "none", background: "none", padding: 0, color: T.accent, fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>＋ {t("career.p.showSkills")}</button>
      ) : (
        <>
          <GroupLabel>{t("career.p.skills")}</GroupLabel>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {CAREER_SKILLS.map((id) => <PillBtn key={id} on={skills.includes(id)} onClick={() => tog(skills, setSkills, id)}>{t(`career.s.${id}`)}</PillBtn>)}
          </div>
        </>
      )}

      <GroupLabel>{t("career.p.target")}</GroupLabel>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
        {[null, "B", "M", "D"].map((d) => <PillBtn key={d || "none"} on={degree === d} onClick={() => setDegree(d)}>{d ? t(`career.deg.${d}`) : t("career.p.none")}</PillBtn>)}
        <select value={gradYear || ""} onChange={(e) => setGradYear(e.target.value ? Number(e.target.value) : null)} aria-label={t("career.p.gradYear")} style={{ padding: "6px 10px", borderRadius: 9, border: `1px solid ${T.bd}`, background: T.bg2, color: T.txH, fontSize: 12.5 }}>
          <option value="">{t("career.p.gradYear")}: {t("career.p.none")}</option>
          {years.map((y) => <option key={y} value={y}>{gradLabel(y)}</option>)}
        </select>
        {fromYear.gradYear && (fromYear.degree !== degree || fromYear.gradYear !== gradYear) && (
          <button type="button" onClick={() => { setDegree(fromYear.degree); setGradYear(fromYear.gradYear); }} style={{ border: `1px dashed ${T.accent}`, background: "transparent", color: T.accent, borderRadius: 9, padding: "5px 10px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>{t("career.p.fromYear", { v: `${t(`career.deg.${fromYear.degree}`)} ${gradLabel(fromYear.gradYear)}` })}</button>
        )}
      </div>

      <div style={{ display: "flex", gap: 8, marginTop: 20 }}>
        <button type="button" onClick={() => { setFields([]); setSkills([]); }} style={{ padding: "11px 14px", borderRadius: 11, border: `1px solid ${T.bd}`, background: T.bg2, color: T.txD, fontSize: 13, fontWeight: 700, cursor: "pointer" }}>{t("career.p.clear")}</button>
        <button type="button" onClick={save} style={{ flex: 1, padding: "11px 14px", borderRadius: 11, border: "none", background: T.accent, color: "#fff", fontSize: 14, fontWeight: 800, cursor: "pointer" }}>{t("career.p.save")}</button>
      </div>
    </Sheet>
  );
}

// ── 学生からの情報提供（URL とひとこと。運営者が公式ページを確かめてから載せる） ──
function TipSheet({ open, onClose, mob }) {
  const auth = useAuth();
  const [url, setUrl] = useState("");
  const [note, setNote] = useState("");
  const [state, setState] = useState(null); // sending | done | エラー文
  useEffect(() => { if (open) { setState(null); } }, [open]);
  const send = async () => {
    setState("sending");
    try {
      const r = await fetch("/api/career/tips", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: url.trim(), note }) });
      const d = await r.json().catch(() => ({}));
      if (r.ok) { setState("done"); setUrl(""); setNote(""); } else setState(d.error || t("career.loadError"));
    } catch { setState(t("career.loadError")); }
  };
  const field = { width: "100%", boxSizing: "border-box", padding: "9px 11px", borderRadius: 10, border: `1px solid ${T.bd}`, background: T.bg2, color: T.txH, fontSize: 13.5, font: "inherit" };
  return (
    <Sheet open={open} onClose={onClose} mob={mob} label={t("career.tip.title")}>
      <div style={{ display: "flex", alignItems: "center", marginBottom: 4 }}>
        <div style={{ flex: 1, fontSize: 17, fontWeight: 800, color: T.txH }}>{t("career.tip.title")}</div>
        <button onClick={onClose} aria-label={t("common.close")} style={{ border: "none", background: T.bg3, borderRadius: "50%", width: 28, height: 28, color: T.txD, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>{I.x}</button>
      </div>
      <div style={{ fontSize: 12, color: T.txD, lineHeight: 1.7, marginBottom: 12 }}>{t("career.tip.body")}</div>
      {auth.status !== "account" ? (
        <div style={{ fontSize: 12.5, color: T.tx, lineHeight: 1.7 }}>
          {t("career.tip.login")}
          <div style={{ marginTop: 10 }}><button onClick={() => { onClose(); openLogin({ intent: "career", returnTo: "career" }); }} style={{ padding: "9px 18px", borderRadius: 10, border: "none", background: T.accent, color: "#fff", fontSize: 13, fontWeight: 800, cursor: "pointer" }}>{t("career.tip.loginBtn")}</button></div>
        </div>
      ) : state === "done" ? (
        <div style={{ fontSize: 13, color: T.green, fontWeight: 700 }}>{t("career.tip.done")}</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder={t("career.tip.url")} inputMode="url" style={field} />
          <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder={t("career.tip.note")} rows={3} maxLength={300} style={{ ...field, resize: "vertical" }} />
          {state && state !== "sending" && <div style={{ fontSize: 12, color: T.red }}>{state}</div>}
          <button disabled={state === "sending" || !/^https?:\/\/\S+/.test(url.trim())} onClick={send} style={{ padding: "11px 14px", borderRadius: 11, border: "none", background: T.accent, color: "#fff", fontSize: 14, fontWeight: 800, cursor: "pointer", opacity: /^https?:\/\/\S+/.test(url.trim()) ? 1 : .45 }}>{t("career.tip.send")}</button>
        </div>
      )}
    </Sheet>
  );
}

// ── メイン ──
export function CareerView({ mob }) {
  const user = useCurrentUser();
  const isPublic = useCareerPublic();
  const isAdmin = !!user?.isAdmin;
  const visible = isPublic || isAdmin;
  const { items, loading, error, reload } = useCareer(visible);
  const [prefs, setPrefs] = useCareerPrefs();
  const [kind, setKind] = useState("all");
  const [condOpen, setCondOpen] = useState(false);
  const [prefsOpen, setPrefsOpen] = useState(false);
  const [detail, setDetail] = useState(null);
  const [tipOpen, setTipOpen] = useState(false);
  const [showSaved, setShowSaved] = useState(false);
  const savedMap = useSaved();
  // 前回開いた時刻（「新着」の目印用）。この画面を開いた時点で既読にするので、先に控えておく
  const [prevSeen] = useState(getSeenAt);
  const dept = user?.myDept || null;

  // 開いた = 新着を見た（ホームの「興味に合う新着」を消す）
  useEffect(() => { if (visible) markSeen(); }, [visible]);

  const built = useMemo(() => buildList(items, prefs, { kind, dept }), [items, prefs, kind, dept]);
  const { matchedCount, totalCount, useMine } = built;
  const savedIds = Object.keys(savedMap);
  const savedRows = useMemo(() => items.filter((it) => savedMap[it.id]).map((item) => ({ item, m: matchListing(item, prefs, dept), elig: eligibility(item, prefs) })), [items, savedMap, prefs, dept]);
  const savedGone = useMemo(() => Object.keys(savedMap).filter((id) => !items.some((it) => it.id === id)).map((id) => ({ id, ...savedMap[id] })), [items, savedMap]);
  const list = showSaved ? savedRows : built.list;
  const kindCounts = useMemo(() => {
    const c = { all: 0, intern: 0, job: 0, event: 0 };
    for (const it of items) { c.all++; c[it.kind] = (c[it.kind] || 0) + 1; }
    return c;
  }, [items]);
  const cond = prefs.cond;
  const condCount = (cond.paid ? 1 : 0) + (cond.remote ? 1 : 0) + (cond.duration ? 1 : 0) + (cond.reward ? 1 : 0);
  const setCond = (patch) => setPrefs((p) => ({ ...p, cond: { ...p.cond, ...patch } }));
  const interests = hasInterests(prefs);

  if (!visible) {
    return (
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: 32, textAlign: "center", color: T.txD }}>
        <div><div style={{ fontSize: 16, fontWeight: 800, color: T.txH, marginBottom: 6 }}>{t("career.notPublic")}</div><div style={{ fontSize: 13, lineHeight: 1.7 }}>{t("career.notPublicBody")}</div></div>
      </div>
    );
  }

  const interestSummary = [...prefs.fields.map((f) => t(`career.f.${f}`)), ...prefs.skills.map((s) => t(`career.s.${s}`))];

  return (
    <div style={{ flex: 1, overflowY: "auto", WebkitOverflowScrolling: "touch" }}>
      <div style={{ maxWidth: 860, margin: "0 auto", padding: mob ? "10px 14px 28px" : "18px 22px 36px" }}>
        {!mob && <div style={{ fontSize: 12.5, color: T.txD, marginBottom: 12 }}>{t("career.subtitle")}</div>}
        {!isPublic && isAdmin && <div style={{ fontSize: 12, color: "#b45309", background: "#b4530912", borderRadius: 9, padding: "7px 10px", marginBottom: 10 }}>{t("career.adminOnly")}</div>}

        {/* 種類 */}
        <div role="tablist" style={{ display: "flex", gap: 2, padding: 3, borderRadius: 11, background: T.bg2, border: `1px solid ${T.bd}`, marginBottom: 10 }}>
          {KINDS.map((k) => {
            const on = kind === k;
            return (
              <button key={k} role="tab" aria-selected={on} onClick={() => setKind(k)} style={{ flex: 1, padding: "7px 4px", borderRadius: 8, border: "none", background: on ? T.bg : "transparent", boxShadow: on ? "0 1px 3px rgba(0,0,0,.12)" : "none", color: on ? T.txH : T.txD, fontSize: 12.5, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}>
                {t(`career.kind.${k}`)}<span style={{ fontSize: 10.5, fontWeight: 600, color: T.txD, marginLeft: 3 }}>{kindCounts[k] || 0}</span>
              </button>
            );
          })}
        </div>

        {/* 初回の案内 or 自分の興味 */}
        {!prefs.setup && !interests ? (
          <div style={{ borderRadius: 14, border: `1px solid ${T.accent}55`, background: `${T.accent}0d`, padding: "13px 14px", marginBottom: 12 }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: T.txH }}>{t("career.onboardTitle")}</div>
            <div style={{ fontSize: 12, color: T.txD, lineHeight: 1.6, margin: "4px 0 10px" }}>{t("career.onboardBody")}</div>
            {fieldsForDept(dept).length > 0 && <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 10 }}>{fieldsForDept(dept).map((f) => <span key={f} style={{ fontSize: 11, color: T.txD, border: `1px dashed ${T.bd}`, borderRadius: 6, padding: "1px 7px" }}>{t(`career.f.${f}`)}</span>)}</div>}
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => setPrefsOpen(true)} style={{ padding: "8px 18px", borderRadius: 10, border: "none", background: T.accent, color: "#fff", fontSize: 13, fontWeight: 800, cursor: "pointer" }}>{t("career.choose")}</button>
              <button onClick={() => setPrefs({ setup: true, mode: "all" })} style={{ padding: "8px 14px", borderRadius: 10, border: `1px solid ${T.bd}`, background: T.bg2, color: T.txD, fontSize: 13, fontWeight: 700, cursor: "pointer" }}>{t("career.later")}</button>
            </div>
          </div>
        ) : (
          <button onClick={() => setPrefsOpen(true)} style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "9px 12px", borderRadius: 11, border: `1px solid ${T.bd}`, background: T.bg2, cursor: "pointer", font: "inherit", textAlign: "left", marginBottom: 10 }}>
            <span style={{ fontSize: 12, fontWeight: 800, color: T.txD, flexShrink: 0 }}>{t("career.interests")}</span>
            <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, color: interests ? T.txH : T.txD, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{interests ? interestSummary.join("・") : t("career.chooseInterests")}</span>
            <span style={{ fontSize: 12, color: T.accent, fontWeight: 700, flexShrink: 0 }}>{interests ? t("career.editInterests") : t("career.choose")}</span>
          </button>
        )}

        {/* モード・条件・並び */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
          <div style={{ display: "inline-flex", padding: 2, borderRadius: 9, background: T.bg2, border: `1px solid ${T.bd}` }}>
            {["mine", "all"].map((mo) => {
              const on = (mo === "mine") === useMine;
              return <button key={mo} disabled={mo === "mine" && !interests} onClick={() => setPrefs({ mode: mo })} style={{ padding: "5px 11px", borderRadius: 7, border: "none", background: on ? `${T.accent}1f` : "transparent", color: on ? T.accent : T.txD, fontSize: 12, fontWeight: 700, cursor: mo === "mine" && !interests ? "default" : "pointer", opacity: mo === "mine" && !interests ? .45 : 1 }}>{t(`career.mode.${mo}`)}{mo === "mine" && interests ? ` ${matchedCount}` : ""}</button>;
            })}
          </div>
          <button onClick={() => setShowSaved((v) => !v)} aria-pressed={showSaved} style={{ padding: "6px 11px", borderRadius: 9, border: `1px solid ${showSaved ? T.accent : T.bd}`, background: showSaved ? `${T.accent}14` : T.bg2, color: showSaved ? T.accent : T.txD, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>★ {t("career.savedTab")} {savedIds.length}</button>
          <button onClick={() => setCondOpen((v) => !v)} style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "6px 11px", borderRadius: 9, border: `1px solid ${condOpen || condCount ? T.accent : T.bd}`, background: condOpen || condCount ? `${T.accent}14` : T.bg2, color: condOpen || condCount ? T.accent : T.txD, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
            {t("career.cond")}{condCount > 0 && <span style={{ fontSize: 10, color: "#fff", background: T.accent, borderRadius: 8, minWidth: 15, height: 15, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>{condCount}</span>}
          </button>
          <span style={{ flex: 1 }} />
          <select value={useMine ? prefs.sort : (prefs.sort === "match" ? "deadline" : prefs.sort)} onChange={(e) => setPrefs({ sort: e.target.value })} aria-label={t("career.sortLabel")} style={{ padding: "5px 8px", borderRadius: 8, border: `1px solid ${T.bd}`, background: T.bg2, color: T.txH, fontSize: 12 }}>
            {useMine && <option value="match">{t("career.sort.match")}</option>}
            <option value="deadline">{t("career.sort.deadline")}</option>
            <option value="new">{t("career.sort.new")}</option>
          </select>
        </div>

        {condOpen && (
          <div style={{ padding: "4px 14px 14px", borderRadius: 12, background: T.bg2, border: `1px solid ${T.bd}`, marginBottom: 10 }}>
            <GroupLabel>{t("career.cond.work")}</GroupLabel>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              <PillBtn on={cond.paid} onClick={() => setCond({ paid: !cond.paid })}>{t("career.cond.paid")}</PillBtn>
              <PillBtn on={cond.remote} onClick={() => setCond({ remote: !cond.remote })}>{t("career.cond.remote")}</PillBtn>
              <PillBtn on={cond.duration === "short"} onClick={() => setCond({ duration: cond.duration === "short" ? null : "short" })}>{t("career.dur.short")}</PillBtn>
              <PillBtn on={cond.duration === "long"} onClick={() => setCond({ duration: cond.duration === "long" ? null : "long" })}>{t("career.dur.long")}</PillBtn>
            </div>
            <GroupLabel>{t("career.cond.event")}</GroupLabel>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {["money", "prize", "any"].map((r) => <PillBtn key={r} on={cond.reward === r} onClick={() => setCond({ reward: cond.reward === r ? null : r })}>{t(`career.cond.${r}`)}</PillBtn>)}
            </div>
            <GroupLabel>{t("career.p.target")}</GroupLabel>
            <PillBtn on={prefs.onlyEligible} onClick={() => setPrefs({ onlyEligible: !prefs.onlyEligible })}>{t("career.cond.eligible")}</PillBtn>
            {!prefs.degree && !prefs.gradYear && <div style={{ fontSize: 11, color: T.txD, marginTop: 6 }}>{t("career.cond.eligibleHint")}</div>}
            {condCount > 0 && <div style={{ marginTop: 10 }}><button onClick={() => setPrefs({ cond: { paid: false, remote: false, duration: null, reward: null } })} style={{ border: "none", background: "none", padding: 0, color: T.accent, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>{t("career.cond.reset")}</button></div>}
          </div>
        )}

        {!loading && !error && <div style={{ fontSize: 12, color: T.txD, fontWeight: 600, margin: "2px 2px 8px" }}>{t("career.count", { n: list.length })}</div>}

        {loading && <div style={{ textAlign: "center", padding: 40, color: T.txD, fontSize: 13 }}><span style={{ display: "inline-block", width: 20, height: 20, borderRadius: "50%", border: `2.5px solid ${T.accent}`, borderTopColor: "transparent", animation: "mnSpin .6s linear infinite" }} /></div>}
        {error && (
          <div style={{ textAlign: "center", padding: 36, color: T.txD, fontSize: 13 }}>
            {t("career.loadError")}
            <div style={{ marginTop: 10 }}><button onClick={reload} style={{ padding: "7px 16px", borderRadius: 9, border: `1px solid ${T.bd}`, background: T.bg2, color: T.txH, fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>{t("career.retry")}</button></div>
          </div>
        )}

        {!loading && !error && list.length > 0 && (
          <div style={{ display: "grid", gridTemplateColumns: mob ? "1fr" : "1fr 1fr", gap: 10 }}>
            {list.map((row) => <CareerCard key={row.item.id} row={row} showReasons={interests} isNew={prevSeen > 0 && (Date.parse(row.item.created_at) || 0) > prevSeen} isSaved={!!savedMap[row.item.id]} onOpen={() => setDetail(row.item)} />)}
          </div>
        )}

        {/* 保存したもののうち、掲載が終わったもの（控えの名前だけ） */}
        {showSaved && savedGone.length > 0 && (
          <div style={{ marginTop: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: T.txD, margin: "0 2px 6px" }}>{t("career.savedGone")}</div>
            {savedGone.map((g) => (
              <div key={g.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", borderRadius: 10, border: `1px solid ${T.bd}`, marginBottom: 6, opacity: .75 }}>
                <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, color: T.tx, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{g.title}<span style={{ color: T.txD }}>{" ・ "}{g.org}</span></span>
                <button onClick={() => removeSaved(g.id)} style={{ border: "none", background: "none", color: T.txD, fontSize: 12, cursor: "pointer", textDecoration: "underline" }}>{t("career.remove")}</button>
              </div>
            ))}
          </div>
        )}
        {showSaved && !loading && list.length === 0 && savedGone.length === 0 && (
          <div style={{ textAlign: "center", padding: "30px 12px", color: T.txD, fontSize: 12.5, lineHeight: 1.7 }}>{t("career.savedEmpty")}</div>
        )}

        {/* 空のとき: 興味に合うものが無い → 無理に勧めず、ゆるめる・すべて・興味の編集へ */}
        {!showSaved && !loading && !error && list.length === 0 && (
          <div style={{ textAlign: "center", padding: "34px 12px", color: T.txD }}>
            <div style={{ fontSize: 13.5, fontWeight: 700, color: T.txH, marginBottom: 6 }}>
              {items.length === 0 ? t("career.emptyNone") : useMine && totalCount > 0 ? t("career.emptyMine") : t("career.emptyFilter")}
            </div>
            {items.length === 0 ? <div style={{ fontSize: 12, lineHeight: 1.7 }}>{t("career.emptyNoneBody")}</div> : (
              <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap", marginTop: 10 }}>
                {(condCount > 0 || kind !== "all" || prefs.onlyEligible) && <button onClick={() => { setKind("all"); setPrefs({ cond: { paid: false, remote: false, duration: null, reward: null }, onlyEligible: false }); }} style={{ padding: "8px 14px", borderRadius: 10, border: `1px solid ${T.bd}`, background: T.bg2, color: T.txH, fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>{t("career.loosen")}</button>}
                {useMine && <button onClick={() => setPrefs({ mode: "all" })} style={{ padding: "8px 14px", borderRadius: 10, border: `1px solid ${T.bd}`, background: T.bg2, color: T.txH, fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>{t("career.seeAll")}</button>}
                <button onClick={() => setPrefsOpen(true)} style={{ padding: "8px 14px", borderRadius: 10, border: `1px solid ${T.bd}`, background: T.bg2, color: T.txH, fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>{t("career.editInterests")}</button>
              </div>
            )}
          </div>
        )}

        <div style={{ marginTop: 22, fontSize: 11.5, color: T.txD, lineHeight: 1.7 }}>
          {t("career.footer")}{" "}
          <button onClick={() => openLink(policyUrl(), mob)} style={{ border: "none", background: "none", padding: 0, color: T.accent, fontSize: 11.5, fontWeight: 700, cursor: "pointer", textDecoration: "underline" }}>{t("career.policy")}</button>
        </div>
        <button onClick={() => setTipOpen(true)} style={{ marginTop: 12, width: "100%", padding: "11px 14px", borderRadius: 12, border: `1px dashed ${T.bd}`, background: "transparent", color: T.txH, fontSize: 13, fontWeight: 700, cursor: "pointer" }}>＋ {t("career.tip.button")}</button>
      </div>

      <PrefsSheet open={prefsOpen} onClose={() => setPrefsOpen(false)} mob={mob} prefs={prefs} setPrefs={setPrefs} user={user} />
      <TipSheet open={tipOpen} onClose={() => setTipOpen(false)} mob={mob} />
      {detail && <CareerDetail item={detail} mob={mob} prefs={prefs} dept={dept} onClose={() => setDetail(null)} />}
    </div>
  );
}

// ── ホームの小窓: 興味を選んでいて、前回キャリアを開いた後に増えた「興味に合う」掲載があるときだけ出す ──
export function CareerHomeWidget({ setView, isAdmin }) {
  const isPublic = useCareerPublic();
  const prefs = getPrefs();
  const enabled = (isPublic || !!isAdmin) && hasInterests(prefs);
  const { items } = useCareer(enabled);
  const fresh = useMemo(() => {
    if (!enabled) return [];
    const seen = getSeenAt();
    return buildList(items, { ...prefs, mode: "mine", sort: "new" }, {}).list.filter((r) => (Date.parse(r.item.created_at) || 0) > seen).slice(0, 3);
  }, [enabled, items, prefs]);
  if (!fresh.length) return null;
  return (
    <div style={{ borderRadius: 14, border: `1px solid ${T.bd}`, background: T.bg2, padding: "11px 13px", margin: "10px 0" }}>
      <div style={{ display: "flex", alignItems: "center", marginBottom: 6 }}>
        <span style={{ color: T.accent, display: "flex", marginRight: 6 }}>{I.briefcase}</span>
        <span style={{ flex: 1, fontSize: 13, fontWeight: 800, color: T.txH }}>{t("career.home.title", { n: fresh.length })}</span>
        <button onClick={() => setView("career")} style={{ border: "none", background: "none", color: T.accent, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>{t("career.home.more")}</button>
      </div>
      {fresh.map((r) => (
        <button key={r.item.id} onClick={() => setView("career")} style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "6px 0", border: "none", borderTop: `1px solid ${T.bd}`, background: "none", cursor: "pointer", font: "inherit", textAlign: "left" }}>
          <Chip color={KIND_COLOR[r.item.kind]} solid>{t(`career.kind.${r.item.kind}`)}</Chip>
          <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, color: T.txH, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.item.title}</span>
          <span style={{ fontSize: 11, color: T.txD, whiteSpace: "nowrap" }}>{dueBadge(r.item).text}</span>
        </button>
      ))}
    </div>
  );
}

