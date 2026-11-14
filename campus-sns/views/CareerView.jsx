import { useState, useEffect, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import { T } from "../theme.js";
import { t, locName, getLang } from "../i18n.js";
import { DEPTS } from "../data.js";
import { openMaterial } from "../openMaterial.js";
import { useAuth, openLogin } from "../authState.js";
import { useCurrentUser } from "../hooks/useCurrentUser.js";
import { useCareer } from "../hooks/useCareer.js";
import { useCareerPublic } from "../careerAccess.js";
import {
  useCareerPrefs, buildSections, buildList, hasInterests, matchListing, eligibility,
  targetFromYearGroup, fieldsForDept, markSeen, getSeenAt, getPrefs,
  useSaved, toggleSaved, removeSaved,
} from "../careerPrefs.js";
import { CAREER_FIELDS, CAREER_SKILLS } from "../../lib/career-tags.js";
import { buildICalendar } from "../../lib/ical.js";
import { saveIcs } from "../icsExport.js";

// ─────────────────────────────────────────────────────────────────────────────
// キャリア: インターン・就職・謝礼や賞金のあるイベントを、自分の興味で探すページ。
//
// 見た目の方針（飾りで区切らず、構造と文字で読ませる）
// - 一覧はカードを並べず、細い線で区切った「行」にする。選んでいる行は背景を少し濃くするだけ
// - PC は 1 枚の枠の中を縦線で「一覧 | 詳細」に分け、それぞれが別にスクロールする（メールアプリと同じ作り）
// - 色は意味のあるところだけ（種類の文字・急ぎの締切・報酬の種類・PR）。グラデーション・光る影・飾りのアイコンは使わない
// - 詳細は「項目名 | 内容」の表で読む
//
// 守ること（計画書 2 章）
// - 興味・検索語・保存・既読は端末の中だけ（careerPrefs.js）。/api/career は全件を返すだけ
// - 報酬は種類（全員 / 条件付き / 抽選 / 賞金 / 交通費のみ / なし）を金額より先に出し、金額は募集元の記載どおり
// - PR・提携はラベルを付けるだけで並び順は変えない。掲載ごとに最終確認日と、誤り・終了の連絡先を出す
// ─────────────────────────────────────────────────────────────────────────────

const CONTACT_EMAIL = "sciencetokyo.app@gmail.com"; // app/support と同じ公開の窓口
const KINDS = ["all", "intern", "job", "event"];
const DAY = 86400e3;
const PALT = { fontFeatureSettings: "'palt'" }; // 見出しの和文を詰める
const NUM = { fontVariantNumeric: "tabular-nums" };

// ── 色（文字に使う意味の色だけ。テーマの明暗で選ぶ） ──
function bgIsDark() {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(T.bg || "").trim());
  if (!m) return false;
  const n = parseInt(m[1], 16);
  return (0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255 < 0.45;
}
function palette() {
  const d = bgIsDark();
  return {
    dark: d,
    intern: d ? "#7aa7f5" : "#1d4ed8",
    job: d ? "#5cc79b" : "#047857",
    event: d ? "#e0a84e" : "#a35a00",
    urgent: d ? "#f08a8a" : "#c62828",
    pr: d ? "#d9b45a" : "#8a6100",
    reward: {
      all: d ? "#6cc98a" : "#1b7a3d", conditional: d ? "#5bbfb0" : "#0d6b62", lottery: d ? "#b9a6f0" : "#5b3fb8",
      prize: d ? "#e894b8" : "#a3245c", travel: d ? "#aab4c3" : "#4a5566", none: d ? "#9aa3b0" : "#5f6875",
    },
  };
}

// ── アイコン（操作の目印にだけ使う） ──
const PATHS = {
  search: <><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></>,
  sliders: <><path d="M4 7h9M17 7h3M4 17h3M11 17h9" /><circle cx="15" cy="7" r="2" /><circle cx="9" cy="17" r="2" /></>,
  bmark: <path d="M6 3h12v18l-6-4-6 4z" />,
  ext: <><path d="M14 4h6v6" /><path d="M20 4l-9 9" /><path d="M18 14v5a1 1 0 01-1 1H5a1 1 0 01-1-1V7a1 1 0 011-1h5" /></>,
  x: <path d="M6 6l12 12M18 6L6 18" />,
  down: <path d="M6 9l6 6 6-6" />,
  cal: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 10h18" /></>,
  yen: <><path d="M6 4l6 8 6-8" /><path d="M12 12v8" /><path d="M8 13h8M8 17h8" /></>,
  pin: <><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0116 0z" /><circle cx="12" cy="10" r="3" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  user: <><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0116 0" /></>,
};
const Icon = ({ n, s = 14, fill = false, w = 2 }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill={fill ? "currentColor" : "none"} stroke="currentColor" strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0 }}>{PATHS[n]}</svg>
);

// ── 日付・表示のための小さな関数 ──
const locale = () => (getLang() === "en" ? "en-US" : "ja-JP");
const md = (ms) => { const d = new Date(ms); return `${d.getMonth() + 1}/${d.getDate()}`; };
const mdw = (ms) => `${md(ms)}(${new Intl.DateTimeFormat(locale(), { weekday: "short" }).format(new Date(ms))})`;
const hm = (ms) => { const d = new Date(ms); return `${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`; };
const deadlineMs = (ymd) => Date.parse(`${ymd}T23:59:59+09:00`);
const todayJst = (now) => new Date(now + 9 * 3600e3).toISOString().slice(0, 10);
const deptName = (code) => (DEPTS[code] ? locName(DEPTS[code]) : code);
const gradLabel = (y) => t("career.gradY", { yy: String(y).slice(2), y });
const openLink = (url, mob) => openMaterial({ fileurl: url, fileType: "link" }, undefined, { mob });
const policyUrl = () => (typeof window !== "undefined" ? `${window.location.origin}/career-policy` : "/career-policy");
const partnerName = (item) => (item.source?.startsWith("partner:") ? item.promo_note || item.source.slice(8) : null);
const ellipsis = { whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" };
const clamp2 = { display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" };

/** 締切まで（今日 / あと n 日 / 日付）。締切の無いイベントは開催日 */
function dueInfo(item, now = Date.now()) {
  if (item.deadline) {
    const days = Math.round((Date.parse(item.deadline) - Date.parse(todayJst(now))) / DAY);
    const label = days <= 0 ? t("career.due.today") : days <= 14 ? t("career.due.days", { n: days }) : t("career.due.date", { d: md(deadlineMs(item.deadline)) });
    return { label, urgent: days <= 3, days };
  }
  if (item.starts_at) return { label: t("career.due.event", { d: mdw(Date.parse(item.starts_at)) }), urgent: false };
  return { label: t("career.due.rolling"), urgent: false };
}
function targetText(item) {
  const parts = [];
  if (item.grad_years?.length) parts.push(item.grad_years.map(gradLabel).join("・"));
  if (item.degrees?.length) parts.push(item.degrees.map((d) => t(`career.deg.${d}`)).join("・"));
  return parts.join(" ");
}
function payText(item) {
  const parts = [item.pay_kind === "unpaid" ? t("career.pay.unpaid") : null, item.pay_text || (item.pay_kind ? t(`career.pay.${item.pay_kind}`) : null)].filter(Boolean);
  return [...new Set(parts)].join("・");
}
function placeText(item) {
  if (item.remote === "remote") return item.kind === "event" ? t("career.online") : [t("career.remote.remote"), item.location && item.location !== "オンライン" ? item.location : null].filter(Boolean).join("・");
  return [item.location, item.remote === "hybrid" ? t("career.remote.hybrid") : null].filter(Boolean).join("・");
}
function periodText(item) {
  return [item.kind === "intern" && item.duration ? t(`career.dur.${item.duration}`) : null, item.period_text].filter(Boolean).join("・");
}
function eventWhen(item) {
  if (!item.starts_at) return "";
  const s = Date.parse(item.starts_at), e = item.ends_at ? Date.parse(item.ends_at) : null;
  if (!e) return `${mdw(s)} ${hm(s)}`;
  return md(s) === md(e) ? `${mdw(s)} ${hm(s)}〜${hm(e)}` : `${mdw(s)} ${hm(s)} 〜 ${mdw(e)} ${hm(e)}`;
}
// 一覧の行に出す事実（種類ごとに大事な順。[アイコン, 文]）
function rowFacts(item) {
  if (item.kind === "event") return [["cal", eventWhen(item)], ["pin", placeText(item)]].filter(([, v]) => v);
  if (item.kind === "job") return [["yen", payText(item)], ["pin", placeText(item)], ["user", targetText(item)]].filter(([, v]) => v);
  return [["yen", payText(item)], ["pin", placeText(item)], ["clock", periodText(item)]].filter(([, v]) => v);
}
function reasonText(r) {
  if (r.t === "field") return t(`career.f.${r.id}`);
  if (r.t === "req") return t("career.why.req", { s: t(`career.s.${r.id}`) });
  if (r.t === "pref") return t("career.why.pref", { s: t(`career.s.${r.id}`) });
  if (r.t === "dept") return t("career.why.dept", { d: deptName(r.id) });
  return "";
}
// キーワード検索の対象（端末の中だけで照らし合わせる）
function haystack(item) {
  return [item.title, item.org, item.summary, item.location, item.pay_text, item.reward_text, item.period_text,
    ...(item.fields || []).map((f) => t(`career.f.${f}`)), ...[...(item.skills_req || []), ...(item.skills_pref || [])].map((s) => t(`career.s.${s}`))]
    .filter(Boolean).join(" ").toLowerCase();
}
// 締切（終日）と開催日時を .ics にして、端末のカレンダーに入れてもらう（サーバーには何も保存しない）
async function addToCalendar(item) {
  const events = [];
  const desc = `${item.org}\n${item.apply_url}`;
  if (item.deadline) {
    const end = new Date(Date.parse(`${item.deadline}T00:00:00Z`) + DAY).toISOString().slice(0, 10);
    events.push({ uid: `career-${item.id}-deadline`, summary: t("career.ics.deadline", { t: item.title }), start: item.deadline, end, allDay: true, description: desc, free: true });
  }
  if (item.starts_at) {
    events.push({ uid: `career-${item.id}-event`, summary: item.title, start: new Date(item.starts_at), end: item.ends_at ? new Date(item.ends_at) : new Date(Date.parse(item.starts_at) + 3600e3), location: placeText(item) || undefined, description: desc });
  }
  if (events.length) await saveIcs(buildICalendar({ name: "ScienceTokyo App", events }), `career-${item.id.slice(0, 8)}.ics`);
}

// ── 小さな部品 ──
const KindText = ({ kind, pal, size = 12 }) => <span style={{ fontSize: size, fontWeight: 700, color: pal[kind], letterSpacing: .2 }}>{t(`career.kind.${kind}`)}</span>;
const PrTag = ({ pal, children }) => <span style={{ fontSize: 10, fontWeight: 700, lineHeight: 1, padding: "2px 4px", borderRadius: 3, border: `1px solid ${pal.pr}`, color: pal.pr }}>{children}</span>;
function RewardLine({ item, pal, size = 12.5 }) {
  if (!item.reward_kind) return null;
  return (
    <div style={{ fontSize: size, lineHeight: 1.6, color: T.txH }}>
      <span style={{ fontWeight: 700, color: pal.reward[item.reward_kind], marginRight: 8 }}>{t(`career.r.${item.reward_kind}`)}</span>
      {item.reward_text && <span>{item.reward_text}</span>}
    </div>
  );
}
// 選択肢（選ぶと白黒が反転する）
const Choice = ({ on, onClick, children }) => (
  <button type="button" aria-pressed={on} onClick={onClick} style={{ padding: "7px 13px", borderRadius: 999, border: `1px solid ${on ? T.txH : T.bd}`, background: on ? T.txH : T.bg2, color: on ? T.bg2 : T.tx, fontSize: 13, fontWeight: on ? 700 : 500, cursor: "pointer", whiteSpace: "nowrap", font: "inherit", lineHeight: 1.3 }}>{children}</button>
);
const btnBase = { display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, borderRadius: 10, fontSize: 13.5, fontWeight: 700, cursor: "pointer", font: "inherit", whiteSpace: "nowrap" };
const Primary = ({ children, style, ...p }) => <button type="button" {...p} style={{ ...btnBase, padding: "10px 18px", border: "none", background: T.accent, color: "#fff", opacity: p.disabled ? .45 : 1, ...style }}>{children}</button>;
const Secondary = ({ children, style, ...p }) => <button type="button" {...p} style={{ ...btnBase, padding: "9px 16px", border: `1px solid ${T.bd}`, background: T.bg2, color: T.txH, ...style }}>{children}</button>;
const TextBtn = ({ children, style, ...p }) => <button type="button" {...p} style={{ border: "none", background: "none", padding: 0, color: T.accent, fontSize: 13, fontWeight: 600, cursor: "pointer", font: "inherit", ...style }}>{children}</button>;

// ── 一覧の 1 行 ──
function OpportunityRow({ row, pal, selected, onOpen, isNew, saved, interested, divider }) {
  const { item, m, elig } = row;
  const due = dueInfo(item);
  const facts = rowFacts(item);
  const reasons = interested ? m.reasons.slice(0, 3).map(reasonText) : [];
  return (
    <div role="button" tabIndex={0} className="cr-card" aria-selected={selected || undefined}
      onClick={onOpen} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(); } }}
      style={{ padding: "14px 16px 11px", background: selected ? T.bg3 : "transparent", borderTop: divider ? `1px solid ${T.bd}` : "none", cursor: "pointer", outline: "none" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, minHeight: 18 }}>
        <KindText kind={item.kind} pal={pal} />
        {item.promo && <PrTag pal={pal}>{t(`career.promo.${item.promo}`)}</PrTag>}
        {isNew && <span style={{ fontSize: 11, fontWeight: 700, color: pal.urgent }}>{t("career.new")}</span>}
        <span style={{ flex: 1 }} />
        <span style={{ ...NUM, fontSize: 12, fontWeight: due.urgent ? 700 : 500, color: due.urgent ? pal.urgent : T.txD, whiteSpace: "nowrap" }}>{due.label}</span>
      </div>
      <div style={{ ...PALT, ...clamp2, fontSize: 15.5, fontWeight: 700, color: T.txH, lineHeight: 1.45, marginTop: 5 }}>{item.title}</div>
      <div style={{ ...ellipsis, fontSize: 13, color: T.tx, marginTop: 2 }}>{item.org}</div>
      {item.kind === "event" && item.reward_kind && <div style={{ marginTop: 6 }}><RewardLine item={item} pal={pal} /></div>}
      {facts.length > 0 && (
        // 事実ごとに折り返さない（「修士・博士」の途中で改行しない）。改行は事実と事実の間だけで、行頭は必ずアイコン
        <div style={{ ...NUM, fontSize: 12.5, color: T.tx, lineHeight: 1.6, marginTop: 5, display: "flex", flexWrap: "wrap", gap: "2px 14px" }}>
          {facts.map(([ic, f], i) => (
            <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: 5, maxWidth: "100%", minWidth: 0 }}>
              <span style={{ display: "flex", color: T.txD }}><Icon n={ic} s={13} /></span>
              <span style={ellipsis}>{f}</span>
            </span>
          ))}
        </div>
      )}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 6 }}>
        <span style={{ ...ellipsis, flex: 1, minWidth: 0, fontSize: 12, color: reasons.length ? T.accent : T.txD, fontWeight: reasons.length ? 600 : 400 }}>
          {reasons.length ? `${t("career.matchPrefix")}${reasons.join("、")}` : (item.fields || []).slice(0, 2).map((f) => t(`career.f.${f}`)).join("、")}
        </span>
        {elig === "no" && <span style={{ fontSize: 11, fontWeight: 700, color: pal.event, whiteSpace: "nowrap" }}>{t("career.target.notYou")}</span>}
        <span style={{ ...NUM, fontSize: 11, color: T.txD, whiteSpace: "nowrap" }}>{t("career.checked", { d: md(Date.parse(item.checked_at)) })}</span>
        <button type="button" onClick={(e) => { e.stopPropagation(); toggleSaved(item); }} aria-pressed={saved} aria-label={saved ? t("career.saved") : t("career.save")}
          style={{ width: 28, height: 28, margin: "-4px -6px -4px 0", border: "none", borderRadius: 6, background: "transparent", color: saved ? T.txH : T.txD, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
          <Icon n="bmark" s={16} fill={saved} />
        </button>
      </div>
    </div>
  );
}

// ── シート（スマホは下から、PC は中央） ──
function Sheet({ open, onClose, mob, title, children, footer, width = 520 }) {
  useEffect(() => {
    if (!open) return undefined;
    const k = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [open, onClose]);
  if (!open || typeof document === "undefined") return null;
  return createPortal(
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(10,10,14,.45)", display: "flex", alignItems: mob ? "flex-end" : "center", justifyContent: "center", animation: "crFade .15s ease" }}>
      <div role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()} style={{ width: mob ? "100%" : width, maxWidth: "100%", maxHeight: mob ? "90vh" : "86vh", display: "flex", flexDirection: "column", background: T.bg2, borderRadius: mob ? "16px 16px 0 0" : 14, boxShadow: "0 18px 50px rgba(0,0,0,.25)", animation: "crUp .22s cubic-bezier(.2,.8,.2,1)" }}>
        {mob && <div style={{ width: 36, height: 4, borderRadius: 2, background: T.bdL, margin: "8px auto 0" }} />}
        <div style={{ display: "flex", alignItems: "center", padding: mob ? "12px 18px 8px" : "18px 22px 8px" }}>
          <div style={{ ...PALT, flex: 1, fontSize: 17, fontWeight: 800, color: T.txH }}>{title}</div>
          <button type="button" onClick={onClose} aria-label={t("common.close")} style={{ width: 30, height: 30, border: "none", borderRadius: 8, background: "transparent", color: T.tx, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}><Icon n="x" s={18} /></button>
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: mob ? "0 18px 18px" : "0 22px 20px" }}>{children}</div>
        {footer && <div style={{ display: "flex", gap: 8, padding: mob ? "10px 16px calc(12px + env(safe-area-inset-bottom))" : "12px 22px 18px", borderTop: `1px solid ${T.bd}` }}>{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}
const SheetGroup = ({ title, children, hint }) => (
  <div style={{ marginTop: 18 }}>
    <div style={{ fontSize: 12.5, fontWeight: 700, color: T.txD, marginBottom: 8 }}>{title}</div>
    <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>{children}</div>
    {hint && <div style={{ fontSize: 12, color: T.txD, lineHeight: 1.6, marginTop: 7 }}>{hint}</div>}
  </div>
);

// ── 詳細 ──
const DetailHeading = ({ children }) => <div style={{ ...PALT, fontSize: 13, fontWeight: 800, color: T.txH, margin: "26px 0 6px" }}>{children}</div>;
// 「項目名 | 内容」の表
const Spec = ({ rows }) => (
  <div style={{ borderTop: `1px solid ${T.bd}` }}>
    {rows.map(([k, v], i) => (
      <div key={i} style={{ display: "grid", gridTemplateColumns: "88px 1fr", gap: 14, padding: "10px 0", borderBottom: `1px solid ${T.bd}` }}>
        <div style={{ fontSize: 12.5, color: T.txD, paddingTop: 1 }}>{k}</div>
        <div style={{ ...NUM, fontSize: 14, color: T.txH, lineHeight: 1.65, minWidth: 0, wordBreak: "break-word" }}>{v}</div>
      </div>
    ))}
  </div>
);

function DetailBody({ item, pal, prefs, dept, actions = null }) {
  const auth = useAuth();
  const [reportOpen, setReportOpen] = useState(false);
  const [reportText, setReportText] = useState("");
  const [reportState, setReportState] = useState(null); // sending | done | error
  const m = matchListing(item, prefs, dept);
  const elig = eligibility(item, prefs);
  const due = dueInfo(item);
  const partner = partnerName(item);

  const overview = [
    item.kind === "event" && item.reward_kind ? [t("career.facts.reward"), <RewardLine key="r" item={item} pal={pal} size={14} />] : null,
    item.kind === "event" && item.starts_at ? [t("career.facts.date"), eventWhen(item)] : null,
    [t("career.facts.deadline"), item.deadline
      ? <>{mdw(deadlineMs(item.deadline))}{due.days != null && due.days <= 14 && <span style={{ marginLeft: 10, fontSize: 12.5, fontWeight: 700, color: due.urgent ? pal.urgent : T.txD }}>{due.label}</span>}</>
      : !item.starts_at ? t("career.due.rolling") : null],
    item.kind !== "event" ? [t("career.facts.pay"), payText(item)] : null,
    item.kind !== "event" ? [t("career.facts.period"), periodText(item)] : null,
    [t("career.facts.place"), placeText(item)],
  ].filter((r) => r && r[1]);

  const who = [
    [t("career.detail.target"), <>{targetText(item) || t("career.target.unknown")}{elig === "no" && <span style={{ color: pal.event, fontWeight: 700 }}>{`（${t("career.target.notYou")}）`}</span>}</>],
    [t("career.detail.skillsReq"), (item.skills_req || []).map((s) => t(`career.s.${s}`)).join("、")],
    [t("career.detail.skillsPref"), (item.skills_pref || []).map((s) => t(`career.s.${s}`)).join("、")],
    [t("career.detail.depts"), (item.depts || []).map(deptName).join("、")],
    [t("career.detail.type"), item.intern_type ? t(`career.it.${item.intern_type}`) : null],
    [t("career.detail.fieldsRow"), (item.fields || []).map((f) => t(`career.f.${f}`)).join("、")],
  ].filter(([, v]) => v);

  const sendReport = async () => {
    setReportState("sending");
    try {
      const r = await fetch("/api/reports", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ targetType: "career", targetId: item.id, reason: "inaccurate", detail: `${item.title}（${item.org}）\n${reportText}`.slice(0, 2000) }) });
      setReportState(r.ok || r.status === 409 ? "done" : "error");
    } catch { setReportState("error"); }
  };
  const mailto = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(`[キャリア掲載] ${item.title}`)}&body=${encodeURIComponent(`掲載ID: ${item.id}\n${item.title}（${item.org}）\n\n内容の誤り・終了など:\n`)}`;

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <KindText kind={item.kind} pal={pal} size={12.5} />
        {item.promo && <PrTag pal={pal}>{t(`career.promo.${item.promo}`)}</PrTag>}
      </div>
      <h2 style={{ ...PALT, fontSize: 22, fontWeight: 800, color: T.txH, lineHeight: 1.4, margin: "6px 0 4px" }}>{item.title}</h2>
      <div style={{ fontSize: 14, color: T.tx }}>{item.org}</div>
      {actions}
      {item.promo && <div style={{ fontSize: 12, color: T.txD, lineHeight: 1.6, marginTop: 12 }}><span style={{ color: pal.pr, fontWeight: 700 }}>{t(`career.promo.${item.promo}`)}</span>　{t(`career.promoNote.${item.promo}`)}{item.promo_note ? `（${item.promo_note}）` : ""}</div>}

      <DetailHeading>{t("career.detail.overview")}</DetailHeading>
      <Spec rows={overview} />

      {m.reasons.length > 0 && (
        <>
          <DetailHeading>{t("career.detail.match")}</DetailHeading>
          <div style={{ fontSize: 14, color: T.accent, fontWeight: 600, lineHeight: 1.7 }}>{m.reasons.map(reasonText).join("、")}</div>
        </>
      )}

      {item.summary && (<><DetailHeading>{t("career.detail.summary")}</DetailHeading><div style={{ fontSize: 14, color: T.tx, lineHeight: 1.9, whiteSpace: "pre-wrap" }}>{item.summary}</div></>)}

      <DetailHeading>{t("career.detail.who")}</DetailHeading>
      <Spec rows={who} />

      {(item.deadline || item.starts_at) && (
        <Secondary onClick={() => addToCalendar(item)} style={{ marginTop: 18 }}><Icon n="cal" s={15} />{t("career.toCalendar")}</Secondary>
      )}

      <DetailHeading>{t("career.detail.info")}</DetailHeading>
      <div style={{ fontSize: 12.5, color: T.tx, lineHeight: 1.8 }}>
        <div>{partner ? t("career.src.partner", { name: partner }) : t(`career.src.${item.source === "tip" ? "tip" : "manual"}`)}</div>
        <div style={NUM}>{t("career.detail.checkedNote", { d: new Date(item.checked_at).toLocaleDateString(locale()) })}</div>
        <div style={{ color: T.txD, marginTop: 4 }}>{t("career.asStated")} {t("career.applyNote")}</div>
      </div>
      <div style={{ marginTop: 12 }}>
        {!reportOpen ? (
          <TextBtn onClick={() => setReportOpen(true)} style={{ color: T.txD, fontSize: 12.5, textDecoration: "underline" }}>{t("career.reportLink")}</TextBtn>
        ) : auth.status === "account" ? (
          reportState === "done" ? <div style={{ fontSize: 13, color: T.green, fontWeight: 700 }}>{t("career.reportDone")}</div> : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <textarea value={reportText} onChange={(e) => setReportText(e.target.value)} placeholder={t("career.reportPlaceholder")} rows={3} maxLength={1500} style={{ width: "100%", boxSizing: "border-box", padding: "9px 11px", borderRadius: 8, border: `1px solid ${T.bd}`, background: T.bg2, color: T.txH, fontSize: 13.5, resize: "vertical", font: "inherit" }} />
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <Primary disabled={reportState === "sending"} onClick={sendReport} style={{ padding: "8px 16px" }}>{t("career.reportSend")}</Primary>
                {reportState === "error" && <span style={{ fontSize: 12, color: pal.urgent }}>{t("career.loadError")}</span>}
              </div>
            </div>
          )
        ) : (
          <div style={{ fontSize: 12.5, color: T.txD, lineHeight: 1.7 }}>
            {t("career.reportGuestNote")}
            <div><a href={mailto} style={{ color: T.accent, fontWeight: 600 }}>{t("career.reportGuest")}</a>（{CONTACT_EMAIL}）</div>
          </div>
        )}
      </div>
    </div>
  );
}

// 「公式ページで応募」と「保存」
function DetailActions({ item, saved, mob, compact = false }) {
  const partner = partnerName(item);
  return (
    <>
      <button type="button" onClick={() => openLink(item.apply_url, mob)} style={{ ...btnBase, flex: compact ? 1 : "0 1 auto", minWidth: 0, height: compact ? 48 : 42, padding: "0 20px", border: "none", background: T.accent, color: "#fff", fontSize: 14.5 }}>
        <span style={ellipsis}>{partner ? t("career.openPartner", { name: partner }) : t("career.applyBtn")}</span><Icon n="ext" s={15} />
      </button>
      <button type="button" onClick={() => toggleSaved(item)} aria-pressed={saved} aria-label={saved ? t("career.saved") : t("career.save")}
        style={{ ...btnBase, height: compact ? 48 : 42, width: compact ? 48 : "auto", padding: compact ? 0 : "0 16px", border: `1px solid ${T.bd}`, background: T.bg2, color: T.txH, flexShrink: 0 }}>
        <Icon n="bmark" s={compact ? 19 : 16} fill={saved} />{!compact && (saved ? t("career.saved") : t("career.save"))}
      </button>
    </>
  );
}

// スマホ・狭い画面: 全画面で開き、操作を下に固定
function DetailScreen({ item, pal, prefs, dept, saved, mob, onClose }) {
  useEffect(() => {
    const k = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  if (typeof document === "undefined") return null;
  return createPortal(
    <div role="dialog" aria-modal="true" aria-label={item.title} style={{ position: "fixed", inset: 0, zIndex: 1000, background: T.bg2, display: "flex", flexDirection: "column", animation: "crUp .22s cubic-bezier(.2,.8,.2,1)" }}>
      <div style={{ display: "flex", alignItems: "center", padding: "calc(6px + env(safe-area-inset-top)) 8px 6px", borderBottom: `1px solid ${T.bd}` }}>
        <button type="button" onClick={onClose} aria-label={t("common.close")} style={{ width: 40, height: 40, border: "none", borderRadius: 10, background: "transparent", color: T.txH, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}><Icon n="down" s={22} /></button>
        <div style={{ ...ellipsis, flex: 1, fontSize: 13, fontWeight: 600, color: T.txD, textAlign: "center", padding: "0 6px" }}>{item.org}</div>
        <span style={{ width: 40 }} />
      </div>
      <div style={{ flex: 1, overflowY: "auto", WebkitOverflowScrolling: "touch" }}>
        <div style={{ maxWidth: 680, margin: "0 auto", padding: mob ? "18px 18px 28px" : "24px 28px 32px" }}>
          <DetailBody key={item.id} item={item} pal={pal} prefs={prefs} dept={dept} />
        </div>
      </div>
      <div style={{ borderTop: `1px solid ${T.bd}`, background: T.bg2 }}>
        <div style={{ display: "flex", gap: 10, maxWidth: 680, margin: "0 auto", padding: "10px 16px calc(12px + env(safe-area-inset-bottom))" }}>
          <DetailActions item={item} saved={saved} mob={mob} compact />
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ── 興味の設定 ──
function PrefsSheet({ open, onClose, mob, prefs, setPrefs, user }) {
  const [fields, setFields] = useState(prefs.fields);
  const [skills, setSkills] = useState(prefs.skills);
  const [degree, setDegree] = useState(prefs.degree);
  const [gradYear, setGradYear] = useState(prefs.gradYear);
  useEffect(() => { if (open) { setFields(prefs.fields); setSkills(prefs.skills); setDegree(prefs.degree); setGradYear(prefs.gradYear); } }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const tog = (arr, set, id) => set(arr.includes(id) ? arr.filter((x) => x !== id) : [...arr, id]);
  const fromYear = targetFromYearGroup(user?.yearGroup);
  const deptFields = fieldsForDept(user?.myDept);
  const y0 = new Date().getFullYear();
  const save = () => { setPrefs((p) => ({ ...p, fields, skills, degree, gradYear: gradYear ? Number(gradYear) : null, setup: true })); onClose(); };
  return (
    <Sheet open={open} onClose={onClose} mob={mob} title={t("career.p.title")}
      footer={<><Secondary onClick={() => { setFields([]); setSkills([]); }}>{t("career.p.clear")}</Secondary><Primary onClick={save} style={{ flex: 1 }}>{t("career.p.save")}</Primary></>}>
      <div style={{ fontSize: 12.5, color: T.txD, lineHeight: 1.7 }}>{t("career.p.note")}</div>
      <SheetGroup title={t("career.p.fields")}>
        {CAREER_FIELDS.map((id) => <Choice key={id} on={fields.includes(id)} onClick={() => tog(fields, setFields, id)}>{t(`career.f.${id}`)}</Choice>)}
      </SheetGroup>
      {deptFields.length > 0 && <TextBtn onClick={() => setFields((f) => [...new Set([...f, ...deptFields])])} style={{ marginTop: 10, fontSize: 12.5 }}>{t("career.p.fromDept", { d: deptName(user.myDept) })}</TextBtn>}
      <SheetGroup title={t("career.p.skills")}>
        {CAREER_SKILLS.map((id) => <Choice key={id} on={skills.includes(id)} onClick={() => tog(skills, setSkills, id)}>{t(`career.s.${id}`)}</Choice>)}
      </SheetGroup>
      <SheetGroup title={t("career.p.target")}>
        {[null, "B", "M", "D"].map((d) => <Choice key={d || "none"} on={degree === d} onClick={() => setDegree(d)}>{d ? t(`career.deg.${d}`) : t("career.p.none")}</Choice>)}
        <select value={gradYear || ""} onChange={(e) => setGradYear(e.target.value ? Number(e.target.value) : null)} aria-label={t("career.p.gradYear")} style={{ padding: "7px 12px", borderRadius: 999, border: `1px solid ${gradYear ? T.txH : T.bd}`, background: T.bg2, color: T.txH, fontSize: 13, font: "inherit" }}>
          <option value="">{t("career.p.gradYear")}: {t("career.p.none")}</option>
          {Array.from({ length: 8 }, (_, i) => y0 + i).map((y) => <option key={y} value={y}>{gradLabel(y)}</option>)}
        </select>
      </SheetGroup>
      {fromYear.gradYear && (fromYear.degree !== degree || fromYear.gradYear !== gradYear) && (
        <TextBtn onClick={() => { setDegree(fromYear.degree); setGradYear(fromYear.gradYear); }} style={{ marginTop: 10, fontSize: 12.5 }}>{t("career.p.fromYear", { v: `${t(`career.deg.${fromYear.degree}`)} ${gradLabel(fromYear.gradYear)}` })}</TextBtn>
      )}
    </Sheet>
  );
}

// ── 絞り込みと並び順（その場で効く。件数を見ながら選べる） ──
function FilterSheet({ open, onClose, mob, prefs, setPrefs, count, interested, onTarget }) {
  const cond = prefs.cond;
  const setCond = (patch) => setPrefs((p) => ({ ...p, cond: { ...p.cond, ...patch } }));
  const sorts = [...(interested ? ["match"] : []), "deadline", "new"];
  const sort = interested ? prefs.sort : prefs.sort === "match" ? "deadline" : prefs.sort;
  return (
    <Sheet open={open} onClose={onClose} mob={mob} title={t("career.filter.title")}
      footer={<><Secondary onClick={() => setPrefs((p) => ({ ...p, cond: { paid: false, remote: false, duration: null, reward: null }, onlyEligible: true }))}>{t("career.cond.reset")}</Secondary><Primary onClick={onClose} style={{ flex: 1 }}>{t("career.filter.show", { n: count })}</Primary></>}>
      <SheetGroup title={t("career.sortLabel")}>
        {sorts.map((s) => <Choice key={s} on={sort === s} onClick={() => setPrefs({ sort: s })}>{t(`career.sort.${s}`)}</Choice>)}
      </SheetGroup>
      <SheetGroup title={t("career.cond.work")}>
        <Choice on={cond.paid} onClick={() => setCond({ paid: !cond.paid })}>{t("career.cond.paid")}</Choice>
        <Choice on={cond.remote} onClick={() => setCond({ remote: !cond.remote })}>{t("career.cond.remote")}</Choice>
        <Choice on={cond.duration === "short"} onClick={() => setCond({ duration: cond.duration === "short" ? null : "short" })}>{t("career.dur.short")}</Choice>
        <Choice on={cond.duration === "long"} onClick={() => setCond({ duration: cond.duration === "long" ? null : "long" })}>{t("career.dur.long")}</Choice>
      </SheetGroup>
      <SheetGroup title={t("career.cond.event")}>
        {["money", "prize", "any"].map((r) => <Choice key={r} on={cond.reward === r} onClick={() => setCond({ reward: cond.reward === r ? null : r })}>{t(`career.cond.${r}`)}</Choice>)}
      </SheetGroup>
      <SheetGroup title={t("career.p.target")} hint={!prefs.degree && !prefs.gradYear ? <>{t("career.cond.eligibleHint")} <TextBtn onClick={onTarget} style={{ fontSize: 12 }}>{t("career.filter.setTarget")}</TextBtn></> : null}>
        <Choice on={prefs.onlyEligible} onClick={() => setPrefs({ onlyEligible: !prefs.onlyEligible })}>{t("career.cond.eligible")}</Choice>
      </SheetGroup>
    </Sheet>
  );
}

// ── 保存した募集 ──
function SavedSheet({ open, onClose, mob, items, savedMap, pal, onOpen }) {
  const live = items.filter((it) => savedMap[it.id]);
  const gone = Object.keys(savedMap).filter((id) => !items.some((it) => it.id === id)).map((id) => ({ id, ...savedMap[id] }));
  return (
    <Sheet open={open} onClose={onClose} mob={mob} title={t("career.savedTitle")}>
      {!live.length && !gone.length && <div style={{ fontSize: 13, color: T.txD, lineHeight: 1.8, padding: "6px 0" }}>{t("career.savedEmpty")}</div>}
      {live.map((it, i) => {
        const due = dueInfo(it);
        return (
          <button key={it.id} type="button" onClick={() => onOpen(it.id)} style={{ display: "block", width: "100%", padding: "12px 0", border: "none", borderTop: i ? `1px solid ${T.bd}` : "none", background: "transparent", cursor: "pointer", font: "inherit", textAlign: "left" }}>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <KindText kind={it.kind} pal={pal} size={11.5} />
              <span style={{ flex: 1 }} />
              <span style={{ ...NUM, fontSize: 12, fontWeight: due.urgent ? 700 : 500, color: due.urgent ? pal.urgent : T.txD }}>{due.label}</span>
            </div>
            <div style={{ ...PALT, ...ellipsis, fontSize: 14.5, fontWeight: 700, color: T.txH, marginTop: 3 }}>{it.title}</div>
            <div style={{ fontSize: 12.5, color: T.tx, marginTop: 1 }}>{it.org}</div>
          </button>
        );
      })}
      {gone.length > 0 && (
        <>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: T.txD, margin: "18px 0 6px" }}>{t("career.savedGone")}</div>
          {gone.map((g) => (
            <div key={g.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 0", borderTop: `1px solid ${T.bd}` }}>
              <span style={{ ...ellipsis, flex: 1, minWidth: 0, fontSize: 13, color: T.txD }}>{g.title}{" ・ "}{g.org}</span>
              <TextBtn onClick={() => removeSaved(g.id)} style={{ color: T.txD, fontSize: 12.5, textDecoration: "underline" }}>{t("career.remove")}</TextBtn>
            </div>
          ))}
        </>
      )}
    </Sheet>
  );
}

// ── 学生からの情報提供（URL とひとこと。運営者が公式ページを確かめてから載せる） ──
function TipSheet({ open, onClose, mob }) {
  const auth = useAuth();
  const [url, setUrl] = useState("");
  const [note, setNote] = useState("");
  const [state, setState] = useState(null); // sending | done | エラー文
  useEffect(() => { if (open) setState(null); }, [open]);
  const valid = /^https?:\/\/\S+/.test(url.trim());
  const send = async () => {
    setState("sending");
    try {
      const r = await fetch("/api/career/tips", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: url.trim(), note }) });
      const d = await r.json().catch(() => ({}));
      if (r.ok) { setState("done"); setUrl(""); setNote(""); } else setState(d.error || t("career.loadError"));
    } catch { setState(t("career.loadError")); }
  };
  const field = { width: "100%", boxSizing: "border-box", padding: "10px 12px", borderRadius: 8, border: `1px solid ${T.bd}`, background: T.bg2, color: T.txH, fontSize: 14, font: "inherit" };
  const account = auth.status === "account";
  return (
    <Sheet open={open} onClose={onClose} mob={mob} title={t("career.tip.title")}
      footer={account && state !== "done" ? <Primary disabled={state === "sending" || !valid} onClick={send} style={{ flex: 1 }}>{t("career.tip.send")}</Primary> : null}>
      <div style={{ fontSize: 13, color: T.tx, lineHeight: 1.75, marginBottom: 14 }}>{t("career.tip.body")}</div>
      {!account ? (
        <div style={{ fontSize: 13, color: T.tx, lineHeight: 1.75 }}>
          {t("career.tip.login")}
          <div style={{ marginTop: 12 }}><Primary onClick={() => { onClose(); openLogin({ intent: "career", returnTo: "career" }); }}>{t("career.tip.loginBtn")}</Primary></div>
        </div>
      ) : state === "done" ? (
        <div style={{ fontSize: 14, color: T.green, fontWeight: 700 }}>{t("career.tip.done")}</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder={t("career.tip.url")} inputMode="url" style={field} />
          <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder={t("career.tip.note")} rows={3} maxLength={300} style={{ ...field, resize: "vertical" }} />
          {state && state !== "sending" && <div style={{ fontSize: 12.5, color: T.red }}>{state}</div>}
        </div>
      )}
    </Sheet>
  );
}

// ── 初めての人向け: その場で分野を選ぶ（選ぶたびに下の一覧が並び替わる） ──
function Hero({ prefs, setPrefs, dept, onMore, mob }) {
  const [all, setAll] = useState(false);
  const suggested = fieldsForDept(dept);
  const order = [...suggested, ...CAREER_FIELDS.filter((f) => !suggested.includes(f))];
  const shown = all ? order : order.slice(0, mob ? 6 : 10);
  const toggle = (id) => setPrefs((p) => ({ ...p, fields: p.fields.includes(id) ? p.fields.filter((x) => x !== id) : [...p.fields, id] }));
  return (
    <section style={{ padding: mob ? "16px 16px 14px" : "18px 20px 16px", borderRadius: 12, border: `1px solid ${T.bd}`, background: T.bg2, marginBottom: 16 }}>
      <h2 style={{ ...PALT, fontSize: mob ? 16.5 : 18, fontWeight: 800, color: T.txH, lineHeight: 1.45, margin: 0 }}>{t("career.hero.title")}</h2>
      <div style={{ fontSize: 12.5, color: T.txD, lineHeight: 1.65, marginTop: 4 }}>{t("career.hero.body")} <TextBtn onClick={onMore} style={{ fontSize: 12.5 }}>{t("career.hero.detail")}</TextBtn></div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginTop: 12 }}>
        {shown.map((id) => <Choice key={id} on={prefs.fields.includes(id)} onClick={() => toggle(id)}>{t(`career.f.${id}`)}</Choice>)}
        {!all && <button type="button" onClick={() => setAll(true)} style={{ padding: "7px 10px", border: "none", background: "transparent", color: T.txD, fontSize: 13, cursor: "pointer", font: "inherit", textDecoration: "underline" }}>{t("career.hero.more", { n: order.length - shown.length })}</button>}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 14 }}>
        <Primary disabled={!prefs.fields.length} onClick={() => setPrefs({ setup: true })}>{prefs.fields.length ? t("career.hero.done", { n: prefs.fields.length }) : t("career.hero.pick")}</Primary>
        <TextBtn onClick={() => setPrefs({ setup: true })} style={{ color: T.txD }}>{t("career.later")}</TextBtn>
      </div>
    </section>
  );
}

// 設定済みの興味（その場で外せる）
function InterestStrip({ prefs, setPrefs, onEdit }) {
  const chips = [...prefs.fields.map((id) => ({ k: "f", id, label: t(`career.f.${id}`) })), ...prefs.skills.map((id) => ({ k: "s", id, label: t(`career.s.${id}`) }))];
  const remove = (c) => setPrefs((p) => (c.k === "f" ? { ...p, fields: p.fields.filter((x) => x !== c.id) } : { ...p, skills: p.skills.filter((x) => x !== c.id) }));
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
      <span style={{ fontSize: 12.5, fontWeight: 700, color: T.txD, flexShrink: 0 }}>{t("career.interests")}</span>
      <div className="cr-scroll" style={{ display: "flex", gap: 6, overflowX: "auto", flex: "0 1 auto", minWidth: 0, padding: "1px 0" }}>
        {chips.length === 0 && <span style={{ fontSize: 13, color: T.txD, whiteSpace: "nowrap" }}>{t("career.chooseInterests")}</span>}
        {chips.map((c) => (
          <span key={`${c.k}:${c.id}`} style={{ display: "inline-flex", alignItems: "center", gap: 2, padding: "4px 5px 4px 11px", borderRadius: 999, border: `1px solid ${T.bd}`, background: T.bg2, color: T.txH, fontSize: 12.5, fontWeight: 600, whiteSpace: "nowrap" }}>
            {c.label}
            <button type="button" onClick={() => remove(c)} aria-label={`${c.label} ×`} style={{ width: 20, height: 20, border: "none", borderRadius: "50%", background: "transparent", color: T.txD, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", padding: 0 }}><Icon n="x" s={12} w={2.4} /></button>
          </span>
        ))}
      </div>
      <TextBtn onClick={onEdit} style={{ flexShrink: 0, fontSize: 13 }}>{chips.length ? t("career.editInterests") : t("career.choose")}</TextBtn>
    </div>
  );
}

// ── メイン ──
export function CareerView({ mob }) {
  const user = useCurrentUser();
  const isPublic = useCareerPublic();
  // 限定公開中（メニューに出していない）でも、この画面はリンク（#career）から誰でも開ける
  const { items, loading, error, reload } = useCareer(true);
  const [prefs, setPrefs] = useCareerPrefs();
  const savedMap = useSaved();
  const [kind, setKind] = useState("all");
  const [query, setQuery] = useState("");
  const [sheet, setSheet] = useState(null); // filter | prefs | saved | tip
  const [detailId, setDetailId] = useState(null); // 狭い画面: 全画面の詳細
  const [selectedId, setSelectedId] = useState(null); // 広い画面: 右側の詳細
  // 前回開いた時刻（「新着」の目印用）。この画面を開いた時点で既読にするので、先に控えておく
  const [prevSeen] = useState(getSeenAt);
  const rootRef = useRef(null);
  const headRef = useRef(null);
  const frameRef = useRef(null);
  const [width, setWidth] = useState(0);
  const [frameH, setFrameH] = useState(0);
  const dept = user?.myDept || null;
  const pal = palette();

  useEffect(() => { markSeen(); }, []);
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return undefined;
    setWidth(el.clientWidth);
    if (typeof ResizeObserver === "undefined") return undefined;
    const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const wide = !mob && width >= 920;

  // PC: 一覧と詳細の枠を画面の下端までの高さにし、左右それぞれをスクロールさせる
  useEffect(() => {
    if (!wide) return undefined;
    const measure = () => {
      const root = rootRef.current, fr = frameRef.current;
      if (!root || !fr) return;
      const top = fr.getBoundingClientRect().top - root.getBoundingClientRect().top + root.scrollTop;
      setFrameH(Math.max(460, Math.floor(root.clientHeight - top - 20)));
    };
    measure();
    if (typeof ResizeObserver === "undefined") return undefined;
    const ro = new ResizeObserver(measure);
    if (rootRef.current) ro.observe(rootRef.current);
    if (headRef.current) ro.observe(headRef.current);
    return () => ro.disconnect();
  }, [wide]);

  const needle = query.trim().toLowerCase();
  const test = useMemo(() => (needle ? (it) => haystack(it).includes(needle) : null), [needle]);
  const { matched, rest, interested } = useMemo(() => buildSections(items, prefs, { kind, dept, test }), [items, prefs, kind, dept, test]);
  const rows = useMemo(() => [...matched, ...rest], [matched, rest]);
  const byId = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const kindCounts = useMemo(() => {
    const c = { all: items.length, intern: 0, job: 0, event: 0 };
    for (const it of items) c[it.kind] = (c[it.kind] || 0) + 1;
    return c;
  }, [items]);
  const savedCount = Object.keys(savedMap).length;
  const cond = prefs.cond;
  const setCond = (patch) => setPrefs((p) => ({ ...p, cond: { ...p.cond, ...patch } }));
  const active = [
    cond.paid && { k: "paid", label: t("career.cond.paid"), off: () => setCond({ paid: false }) },
    cond.remote && { k: "remote", label: t("career.cond.remote"), off: () => setCond({ remote: false }) },
    cond.duration && { k: "dur", label: t(`career.dur.${cond.duration}`), off: () => setCond({ duration: null }) },
    cond.reward && { k: "reward", label: t(`career.cond.${cond.reward}`), off: () => setCond({ reward: null }) },
    !prefs.onlyEligible && { k: "elig", label: t("career.filter.allTargets"), off: () => setPrefs({ onlyEligible: true }) },
  ].filter(Boolean);
  const sortNow = interested ? prefs.sort : prefs.sort === "match" ? "deadline" : prefs.sort;

  const selected = wide ? (rows.find((r) => r.item.id === selectedId)?.item || rows[0]?.item || null) : null;
  const detailItem = !wide && detailId ? byId.get(detailId) || null : null;
  const open = (id) => (wide ? setSelectedId(id) : setDetailId(id));
  const nothing = !loading && !error && rows.length === 0;

  // 一覧の段（PC の枠の中では帯の見出し、スマホではまとまりの上の見出し）
  const sortBtn = rows.length > 1 ? (
    <button type="button" onClick={() => setSheet("filter")} style={{ ...btnBase, padding: 0, border: "none", background: "transparent", color: T.txD, fontSize: 12, fontWeight: 600, gap: 3 }}>{t(`career.sort.${sortNow}`)}<Icon n="down" s={12} /></button>
  ) : null;
  const sectionHead = (title, n, right) => (
    <div style={wide
      ? { position: "sticky", top: 0, zIndex: 1, display: "flex", alignItems: "center", gap: 8, padding: "8px 16px", background: T.bg, borderTop: `1px solid ${T.bd}`, borderBottom: `1px solid ${T.bd}`, marginTop: -1 }
      : { display: "flex", alignItems: "center", gap: 8, margin: "20px 4px 8px" }}>
      <span style={{ ...PALT, fontSize: wide ? 12.5 : 13.5, fontWeight: 800, color: T.txH }}>{title}</span>
      <span style={{ ...NUM, fontSize: 12, color: T.txD }}>{t("career.count", { n })}</span>
      <span style={{ flex: 1 }} />
      {right}
    </div>
  );
  const group = (list) => (
    <div style={wide ? null : { borderRadius: 12, border: `1px solid ${T.bd}`, background: T.bg2, overflow: "hidden" }}>
      {list.map((row, i) => (
        <OpportunityRow key={row.item.id} row={row} pal={pal} interested={interested} divider={i > 0}
          selected={wide && selected?.id === row.item.id} isNew={prevSeen > 0 && (Date.parse(row.item.created_at) || 0) > prevSeen}
          saved={!!savedMap[row.item.id]} onOpen={() => open(row.item.id)} />
      ))}
    </div>
  );

  const searchRow = (
    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
      <label style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 8, padding: "0 11px", height: 40, borderRadius: 10, border: `1px solid ${T.bd}`, background: T.bg2, color: T.txD }}>
        <Icon n="search" s={16} />
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("career.searchPh")} enterKeyHint="search" aria-label={t("career.searchPh")} style={{ flex: 1, minWidth: 0, border: "none", outline: "none", background: "transparent", color: T.txH, fontSize: 14.5, font: "inherit" }} />
        {query && <button type="button" onClick={() => setQuery("")} aria-label={t("career.clearSearch")} style={{ width: 22, height: 22, border: "none", borderRadius: 6, background: "transparent", color: T.txD, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", padding: 0 }}><Icon n="x" s={14} w={2.4} /></button>}
      </label>
      <button type="button" onClick={() => setSheet("filter")} aria-label={t("career.filter")} style={{ ...btnBase, height: 40, padding: "0 12px", border: `1px solid ${active.length ? T.txH : T.bd}`, background: T.bg2, color: T.txH, fontWeight: 600 }}>
        <Icon n="sliders" s={16} />{!mob && t("career.filter")}
        {active.length > 0 && <span style={{ ...NUM, fontSize: 12, fontWeight: 700 }}>{active.length}</span>}
      </button>
      <button type="button" onClick={() => setSheet("saved")} aria-label={t("career.savedTitle")} style={{ ...btnBase, height: 40, padding: "0 11px", border: `1px solid ${T.bd}`, background: T.bg2, color: T.txH, fontWeight: 600 }}>
        <Icon n="bmark" s={16} fill={savedCount > 0} />{savedCount > 0 && <span style={{ ...NUM, fontSize: 12.5 }}>{savedCount}</span>}
      </button>
    </div>
  );
  // 種類: 文字のタブ（選んでいるものに下線）
  const tabs = (
    <div role="tablist" style={{ display: "flex", gap: mob ? 18 : 22, marginTop: 8, borderBottom: wide ? "none" : `1px solid ${T.bd}` }}>
      {KINDS.map((k) => {
        const on = kind === k;
        return (
          <button key={k} type="button" role="tab" aria-selected={on} onClick={() => setKind(k)} style={{ padding: "9px 0 8px", marginBottom: -1, border: "none", borderBottom: `2px solid ${on ? T.txH : "transparent"}`, background: "transparent", color: on ? T.txH : T.txD, fontSize: 13.5, fontWeight: on ? 700 : 500, cursor: "pointer", font: "inherit", whiteSpace: "nowrap" }}>
            {t(`career.kind.${k}`)}<span style={{ ...NUM, fontSize: 11.5, fontWeight: 500, color: T.txD, marginLeft: 4 }}>{kindCounts[k] || 0}</span>
          </button>
        );
      })}
    </div>
  );
  const activeRow = active.length > 0 ? (
    <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginTop: 10 }}>
      {active.map((a) => (
        <span key={a.k} style={{ display: "inline-flex", alignItems: "center", gap: 2, padding: "3px 4px 3px 10px", borderRadius: 999, border: `1px solid ${T.bd}`, background: T.bg2, color: T.txH, fontSize: 12, fontWeight: 600 }}>
          {a.label}
          <button type="button" onClick={a.off} aria-label={`${a.label} ×`} style={{ width: 18, height: 18, border: "none", borderRadius: "50%", background: "transparent", color: T.txD, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", padding: 0 }}><Icon n="x" s={11} w={2.4} /></button>
        </span>
      ))}
    </div>
  ) : null;

  const list = (
    <>
      {loading && <div style={{ padding: "36px 16px", textAlign: "center", color: T.txD, fontSize: 13 }}>…</div>}
      {error && (
        <div style={{ textAlign: "center", padding: "40px 16px", color: T.txD, fontSize: 13.5 }}>
          {t("career.loadError")}
          <div style={{ marginTop: 12 }}><Secondary onClick={reload}>{t("career.retry")}</Secondary></div>
        </div>
      )}
      {!loading && !error && interested && (
        <>
          {sectionHead(t("career.sec.matched"), matched.length, sortBtn)}
          {matched.length ? group(matched) : (
            <div style={{ padding: wide ? "14px 16px" : "14px 16px", borderRadius: wide ? 0 : 12, border: wide ? "none" : `1px solid ${T.bd}`, background: T.bg2, fontSize: 13, color: T.tx, lineHeight: 1.7 }}>
              {t("career.sec.matchedNone")} <TextBtn onClick={() => setSheet("prefs")}>{t("career.editInterests")}</TextBtn>
            </div>
          )}
        </>
      )}
      {!loading && !error && rest.length > 0 && (
        <>
          {sectionHead(interested ? t("career.sec.rest") : t("career.sec.all"), rest.length, interested ? null : sortBtn)}
          {group(rest)}
        </>
      )}
      {nothing && (
        <div style={{ textAlign: "center", padding: "44px 16px 36px" }}>
          <div style={{ ...PALT, fontSize: 15, fontWeight: 800, color: T.txH }}>{items.length === 0 ? t("career.emptyNone") : t("career.emptyFilter")}</div>
          <div style={{ fontSize: 13, color: T.txD, lineHeight: 1.7, marginTop: 6 }}>{items.length === 0 ? t("career.emptyNoneBody") : t("career.emptyFilterBody")}</div>
          {items.length > 0 && (
            <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap", marginTop: 14 }}>
              {query && <Secondary onClick={() => setQuery("")}>{t("career.clearSearch")}</Secondary>}
              {(active.length > 0 || kind !== "all" || prefs.onlyEligible) && <Secondary onClick={() => { setKind("all"); setPrefs((p) => ({ ...p, cond: { paid: false, remote: false, duration: null, reward: null }, onlyEligible: false })); }}>{t("career.loosen")}</Secondary>}
            </div>
          )}
        </div>
      )}
      {/* 情報提供と掲載方針（一覧の終わりに、文字だけで） */}
      <div style={{ padding: wide ? "20px 16px 24px" : "26px 4px 4px", borderTop: wide ? `1px solid ${T.bd}` : "none", fontSize: 12.5, color: T.txD, lineHeight: 1.75 }}>
        <div style={{ ...PALT, fontSize: 13.5, fontWeight: 800, color: T.txH }}>{t("career.tipCard.title")}</div>
        <div>{t("career.tipCard.body")}</div>
        <TextBtn onClick={() => setSheet("tip")} style={{ marginTop: 4 }}>{t("career.tip.button")} ›</TextBtn>
        <div style={{ marginTop: 16 }}>{t("career.footer")} <TextBtn onClick={() => openLink(policyUrl(), mob)} style={{ fontSize: 12.5 }}>{t("career.policyRead")} ›</TextBtn></div>
      </div>
    </>
  );

  return (
    <div ref={rootRef} style={{ flex: 1, overflowY: "auto", WebkitOverflowScrolling: "touch", background: T.bg }}>
      <style>{`
@keyframes crUp{from{transform:translateY(24px);opacity:0}to{transform:none;opacity:1}}
@keyframes crFade{from{opacity:0}to{opacity:1}}
@media (hover:hover){.cr-card:not([aria-selected="true"]):hover{background:${pal.dark ? "rgba(255,255,255,.03)" : "rgba(0,0,0,.025)"}!important}}
.cr-card:focus-visible{outline:2px solid ${T.accent};outline-offset:-2px}
.cr-scroll{scrollbar-width:none}.cr-scroll::-webkit-scrollbar{display:none}
`}</style>
      <div style={{ maxWidth: wide ? 1180 : 720, margin: "0 auto", padding: mob ? "12px 16px 32px" : wide ? "20px 24px 0" : "20px 24px 40px" }}>
        <div ref={headRef}>
          {!isPublic && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: T.txD, marginBottom: 12, lineHeight: 1.6 }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: pal.pr, flexShrink: 0 }} />{t("career.unlisted")}
            </div>
          )}
          {!mob && (
            <div style={{ marginBottom: 14 }}>
              <h1 style={{ ...PALT, fontSize: 24, fontWeight: 800, color: T.txH, margin: 0 }}>{t("career.pageTitle")}</h1>
              <div style={{ fontSize: 13, color: T.txD, marginTop: 3 }}>{t("career.subtitle")}</div>
            </div>
          )}
          {!prefs.setup
            ? <Hero prefs={prefs} setPrefs={setPrefs} dept={dept} mob={mob} onMore={() => setSheet("prefs")} />
            : <InterestStrip prefs={prefs} setPrefs={setPrefs} onEdit={() => setSheet("prefs")} />}
        </div>

        {wide ? (
          // PC: 1 枚の枠を縦線で「一覧 | 詳細」に分け、左右それぞれをスクロールさせる
          <div ref={frameRef} style={{ display: "flex", height: frameH || 640, border: `1px solid ${T.bd}`, borderRadius: 12, background: T.bg2, overflow: "hidden" }}>
            <section aria-label={t("career.listTitle")} style={{ width: 420, flexShrink: 0, display: "flex", flexDirection: "column", borderRight: `1px solid ${T.bd}` }}>
              <div style={{ padding: "12px 16px 0" }}>{searchRow}{activeRow}{tabs}</div>
              <div style={{ flex: 1, overflowY: "auto" }}>{list}</div>
            </section>
            <article aria-label={t("career.detailTitle")} style={{ flex: 1, minWidth: 0, overflowY: "auto" }}>
              {selected ? (
                <div style={{ maxWidth: 700, padding: "26px 32px 36px" }}>
                  <DetailBody key={selected.id} item={selected} pal={pal} prefs={prefs} dept={dept}
                    actions={<div style={{ display: "flex", gap: 8, marginTop: 16 }}><DetailActions item={selected} saved={!!savedMap[selected.id]} mob={false} /></div>} />
                </div>
              ) : (
                <div style={{ padding: 48, textAlign: "center", color: T.txD, fontSize: 13.5 }}>{loading ? "" : t("career.pickOne")}</div>
              )}
            </article>
          </div>
        ) : (
          <>{searchRow}{activeRow}{tabs}{list}</>
        )}
      </div>

      {detailItem && <DetailScreen item={detailItem} pal={pal} prefs={prefs} dept={dept} saved={!!savedMap[detailItem.id]} mob={mob} onClose={() => setDetailId(null)} />}
      <PrefsSheet open={sheet === "prefs"} onClose={() => setSheet(null)} mob={mob} prefs={prefs} setPrefs={setPrefs} user={user} />
      <FilterSheet open={sheet === "filter"} onClose={() => setSheet(null)} mob={mob} prefs={prefs} setPrefs={setPrefs} count={rows.length} interested={interested} onTarget={() => setSheet("prefs")} />
      <SavedSheet open={sheet === "saved"} onClose={() => setSheet(null)} mob={mob} items={items} savedMap={savedMap} pal={pal} onOpen={(id) => { setSheet(null); open(id); }} />
      <TipSheet open={sheet === "tip"} onClose={() => setSheet(null)} mob={mob} />
    </div>
  );
}

// ── ホームの小窓: 興味を選んでいて、前回キャリアを開いた後に増えた「興味に合う」掲載があるときだけ出す ──
export function CareerHomeWidget({ setView, isAdmin }) {
  const isPublic = useCareerPublic();
  const prefs = getPrefs();
  const enabled = (isPublic || !!isAdmin) && hasInterests(prefs);
  const { items } = useCareer(enabled);
  const pal = palette();
  const fresh = useMemo(() => {
    if (!enabled) return [];
    const seen = getSeenAt();
    return buildList(items, { ...prefs, mode: "mine", sort: "new" }, {}).list.filter((r) => (Date.parse(r.item.created_at) || 0) > seen).slice(0, 3);
  }, [enabled, items, prefs]);
  if (!fresh.length) return null;
  return (
    <div style={{ borderRadius: 12, border: `1px solid ${T.bd}`, background: T.bg2, margin: "10px 0", overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", padding: "11px 14px 9px" }}>
        <span style={{ ...PALT, flex: 1, fontSize: 13.5, fontWeight: 800, color: T.txH }}>{t("career.home.title", { n: fresh.length })}</span>
        <TextBtn onClick={() => setView("career")} style={{ fontSize: 12.5 }}>{t("career.home.more")} ›</TextBtn>
      </div>
      {fresh.map((r) => {
        const due = dueInfo(r.item);
        return (
          <button key={r.item.id} type="button" onClick={() => setView("career")} style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", border: "none", borderTop: `1px solid ${T.bd}`, background: "none", cursor: "pointer", font: "inherit", textAlign: "left" }}>
            <KindText kind={r.item.kind} pal={pal} size={11.5} />
            <span style={{ ...ellipsis, flex: 1, minWidth: 0, fontSize: 13.5, fontWeight: 600, color: T.txH }}>{r.item.title}</span>
            <span style={{ ...NUM, fontSize: 12, fontWeight: due.urgent ? 700 : 500, color: due.urgent ? pal.urgent : T.txD, whiteSpace: "nowrap" }}>{due.label}</span>
          </button>
        );
      })}
    </div>
  );
}
