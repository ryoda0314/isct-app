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
// 見やすさの方針
// - 1 枚のカードで「何か・どこの・いつまで・何がもらえる/待遇」が読めるようにする（事実は 3 つまで、締切は残り日数で）
// - 興味に合うものを上の段に、そのほかを下の段に、同じページに続けて出す（切り替えで隠さない）
// - 詳細は PC では右側に並べて出し、スマホでは全画面で開いて「公式ページで応募」を下に固定する
//
// 守ること（計画書 2 章）
// - 興味・検索語・保存・既読は端末の中だけ（careerPrefs.js）。/api/career は全件を返すだけ
// - 報酬は種類（全員 / 条件付き / 抽選 / 賞金 / 交通費のみ / なし）を金額より先に出し、金額は募集元の記載どおり
// - PR・提携はラベルを付けるだけで並び順は変えない。掲載ごとに最終確認日と、誤り・終了の連絡先を出す
// ─────────────────────────────────────────────────────────────────────────────

const CONTACT_EMAIL = "sciencetokyo.app@gmail.com"; // app/support と同じ公開の窓口
const KINDS = ["all", "intern", "job", "event"];
const DAY = 86400e3;

// ── 色（テーマの明暗に合わせて、種類・報酬・急ぎの色を選ぶ） ──
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
    intern: d ? "#60a5fa" : "#2563eb",
    job: d ? "#34d399" : "#047857",
    event: d ? "#fbbf24" : "#b45309",
    urgent: d ? "#f87171" : "#dc2626",
    pr: d ? "#fcd34d" : "#a16207",
    reward: {
      all: d ? "#4ade80" : "#15803d", conditional: d ? "#2dd4bf" : "#0f766e", lottery: d ? "#c4b5fd" : "#6d28d9",
      prize: d ? "#f9a8d4" : "#be185d", travel: d ? "#cbd5e1" : "#475569", none: d ? "#94a3b8" : "#64748b",
    },
  };
}

// ── アイコン（このページ用の細い線のアイコン） ──
const PATHS = {
  yen: <><path d="M6 4l6 8 6-8" /><path d="M12 12v8" /><path d="M8 13h8M8 17h8" /></>,
  pin: <><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0116 0z" /><circle cx="12" cy="10" r="3" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  cal: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 10h18" /></>,
  user: <><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0116 0" /></>,
  gift: <><rect x="3" y="8" width="18" height="4" rx="1" /><path d="M12 8v13M5 12v9h14v-9" /><path d="M12 8C10 4 6 4 6 6.5S12 8 12 8zM12 8c2-4 6-4 6-1.5S12 8 12 8z" /></>,
  bmark: <path d="M6 3h12v18l-6-4-6 4z" />,
  ext: <><path d="M14 4h6v6" /><path d="M20 4l-9 9" /><path d="M18 14v5a1 1 0 01-1 1H5a1 1 0 01-1-1V7a1 1 0 011-1h5" /></>,
  sliders: <><path d="M4 7h9M17 7h3M4 17h3M11 17h9" /><circle cx="15" cy="7" r="2" /><circle cx="9" cy="17" r="2" /></>,
  search: <><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></>,
  x: <path d="M6 6l12 12M18 6L6 18" />,
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  plus: <path d="M12 5v14M5 12h14" />,
  down: <path d="M6 9l6 6 6-6" />,
  spark: <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" />,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></>,
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
// カードに出す事実（3 つまで。種類ごとに大事な順）
function cardFacts(item) {
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
function OrgMark({ name, size = 22, pal }) {
  const clean = String(name || "").replace(/^(株式会社|有限会社|合同会社|一般社団法人|一般財団法人|公益財団法人|国立研究開発法人)\s*/, "").trim();
  const ch = [...clean][0] || "?";
  const hue = ([...String(name || "")].reduce((a, c) => a + c.charCodeAt(0), 0) * 47) % 360;
  return (
    <span aria-hidden="true" style={{ width: size, height: size, borderRadius: size * 0.3, flexShrink: 0, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: size * 0.5, fontWeight: 800, background: `hsl(${hue} 50% ${pal.dark ? 26 : 92}%)`, color: `hsl(${hue} 55% ${pal.dark ? 78 : 32}%)` }}>{ch}</span>
  );
}
const KindLabel = ({ kind, pal }) => (
  <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 800, color: pal[kind], letterSpacing: .2 }}>
    <span style={{ width: 7, height: 7, borderRadius: "50%", background: pal[kind] }} />{t(`career.kind.${kind}`)}
  </span>
);
const MiniTag = ({ color, children }) => (
  <span style={{ fontSize: 10.5, fontWeight: 800, lineHeight: 1, padding: "4px 6px", borderRadius: 5, color, background: `${color}1c`, whiteSpace: "nowrap" }}>{children}</span>
);
function RewardBand({ item, pal, big = false }) {
  if (!item.reward_kind) return null;
  const c = pal.reward[item.reward_kind];
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", padding: big ? "10px 12px" : "8px 10px", borderRadius: 11, background: `${c}14`, border: `1px solid ${c}30` }}>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: big ? 13.5 : 12.5, fontWeight: 800, color: c, whiteSpace: "nowrap" }}><Icon n="gift" s={big ? 16 : 14} />{t(`career.r.${item.reward_kind}`)}</span>
      {item.reward_text && <span style={{ fontSize: big ? 14 : 13, fontWeight: 600, color: T.txH, minWidth: 0 }}>{item.reward_text}</span>}
    </div>
  );
}
const Choice = ({ on, onClick, children, color }) => {
  const c = color || T.accent;
  return (
    <button type="button" aria-pressed={on} onClick={onClick} style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "7px 12px", borderRadius: 999, border: `1px solid ${on ? c : T.bd}`, background: on ? `${c}1a` : T.bg2, color: on ? c : T.tx, fontSize: 13, fontWeight: on ? 700 : 500, cursor: "pointer", whiteSpace: "nowrap", font: "inherit" }}>
      {on && <Icon n="check" s={13} w={2.6} />}{children}
    </button>
  );
};
const btnBase = { display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, borderRadius: 12, fontSize: 13.5, fontWeight: 700, cursor: "pointer", font: "inherit", whiteSpace: "nowrap" };
const Primary = ({ children, style, ...p }) => <button type="button" {...p} style={{ ...btnBase, padding: "11px 18px", border: "none", background: T.accent, color: "#fff", fontWeight: 800, opacity: p.disabled ? .45 : 1, ...style }}>{children}</button>;
const Secondary = ({ children, style, ...p }) => <button type="button" {...p} style={{ ...btnBase, padding: "10px 16px", border: `1px solid ${T.bd}`, background: T.bg2, color: T.txH, ...style }}>{children}</button>;
const TextBtn = ({ children, style, ...p }) => <button type="button" {...p} style={{ border: "none", background: "none", padding: 0, color: T.accent, fontSize: 13, fontWeight: 700, cursor: "pointer", font: "inherit", ...style }}>{children}</button>;

// ── カード ──
function OpportunityCard({ row, pal, selected, onOpen, isNew, saved, interested }) {
  const { item, m, elig } = row;
  const due = dueInfo(item);
  const facts = cardFacts(item).slice(0, 3);
  const showReasons = interested && m.reasons.length > 0;
  const tags = showReasons ? m.reasons.slice(0, 3).map(reasonText) : (item.fields || []).slice(0, 2).map((f) => t(`career.f.${f}`));
  return (
    <div role="button" tabIndex={0} className="cr-card" aria-current={selected || undefined}
      onClick={onOpen} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(); } }}
      style={{ position: "relative", padding: "14px 16px 12px", borderRadius: 18, background: T.bg2, border: `1px solid ${selected ? pal[item.kind] : T.bd}`, boxShadow: selected ? `0 0 0 1px ${pal[item.kind]}` : "none", cursor: "pointer", outline: "none" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 7 }}>
        <KindLabel kind={item.kind} pal={pal} />
        {item.promo && <MiniTag color={pal.pr}>{t(`career.promo.${item.promo}`)}</MiniTag>}
        {isNew && <MiniTag color={pal.urgent}>{t("career.new")}</MiniTag>}
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 12, fontWeight: 800, color: due.urgent ? pal.urgent : T.txD, whiteSpace: "nowrap" }}>{due.label}</span>
      </div>
      <div style={{ fontSize: 16, fontWeight: 800, color: T.txH, lineHeight: 1.4, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{item.title}</div>
      <div style={{ display: "flex", alignItems: "center", gap: 7, marginTop: 6 }}>
        <OrgMark name={item.org} pal={pal} size={20} />
        <span style={{ fontSize: 13, color: T.tx, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{item.org}</span>
      </div>
      {item.kind === "event" && item.reward_kind && <div style={{ marginTop: 10 }}><RewardBand item={item} pal={pal} /></div>}
      {facts.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "5px 14px", marginTop: 10 }}>
          {facts.map(([ic, v], i) => (
            <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12.5, color: T.tx, maxWidth: "100%", minWidth: 0 }}>
              <span style={{ color: T.txD, display: "flex" }}><Icon n={ic} s={13} /></span>
              <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{v}</span>
            </span>
          ))}
        </div>
      )}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 11, paddingTop: 10, borderTop: `1px solid ${T.bd}` }}>
        <span style={{ flex: 1, minWidth: 0, fontSize: 12, fontWeight: showReasons ? 700 : 500, color: showReasons ? T.accent : T.txD, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {showReasons ? `✓ ${tags.join("　✓ ")}` : tags.join(" · ")}
        </span>
        {elig === "no" && <span style={{ fontSize: 11, fontWeight: 700, color: pal.event, whiteSpace: "nowrap" }}>{t("career.target.notYou")}</span>}
        <span style={{ fontSize: 11, color: T.txD, whiteSpace: "nowrap" }}>{t("career.checked", { d: md(Date.parse(item.checked_at)) })}</span>
        <button type="button" onClick={(e) => { e.stopPropagation(); toggleSaved(item); }} aria-pressed={saved} aria-label={saved ? t("career.saved") : t("career.save")}
          style={{ width: 30, height: 30, marginRight: -6, border: "none", borderRadius: 8, background: "transparent", color: saved ? T.accent : T.txD, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
          <Icon n="bmark" s={17} fill={saved} />
        </button>
      </div>
    </div>
  );
}

// ── シート（スマホは下から、PC は中央） ──
function Sheet({ open, onClose, mob, title, children, footer, width = 520 }) {
  useEffect(() => {
    if (!open) return;
    const k = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [open, onClose]);
  if (!open || typeof document === "undefined") return null;
  return createPortal(
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(8,10,20,.48)", display: "flex", alignItems: mob ? "flex-end" : "center", justifyContent: "center", animation: "crFade .15s ease" }}>
      <div role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()} style={{ width: mob ? "100%" : width, maxWidth: "100%", maxHeight: mob ? "90vh" : "86vh", display: "flex", flexDirection: "column", background: T.bg, borderRadius: mob ? "22px 22px 0 0" : 20, boxShadow: "0 24px 64px rgba(0,0,0,.3)", animation: "crUp .24s cubic-bezier(.2,.8,.2,1)" }}>
        {mob && <div style={{ width: 40, height: 5, borderRadius: 3, background: T.bdL, margin: "8px auto 2px" }} />}
        <div style={{ display: "flex", alignItems: "center", padding: mob ? "8px 18px 10px" : "18px 22px 10px" }}>
          <div style={{ flex: 1, fontSize: 18, fontWeight: 800, color: T.txH }}>{title}</div>
          <button type="button" onClick={onClose} aria-label={t("common.close")} style={{ width: 32, height: 32, border: "none", borderRadius: "50%", background: T.bg3, color: T.tx, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}><Icon n="x" s={16} /></button>
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: mob ? "2px 18px 18px" : "2px 22px 20px" }}>{children}</div>
        {footer && <div style={{ display: "flex", gap: 8, padding: mob ? "10px 16px calc(12px + env(safe-area-inset-bottom))" : "12px 22px 18px", borderTop: `1px solid ${T.bd}` }}>{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}
const SheetGroup = ({ title, children, hint }) => (
  <div style={{ marginTop: 18 }}>
    <div style={{ fontSize: 13, fontWeight: 800, color: T.txH, marginBottom: 8 }}>{title}</div>
    <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>{children}</div>
    {hint && <div style={{ fontSize: 12, color: T.txD, lineHeight: 1.6, marginTop: 7 }}>{hint}</div>}
  </div>
);
const DetailHeading = ({ children }) => <div style={{ fontSize: 13.5, fontWeight: 800, color: T.txH, margin: "24px 0 9px" }}>{children}</div>;

// ── 詳細の中身（PC の右側とスマホの全画面で共通） ──
// framed … PC の右パネル用。見出し（種類・タイトル・組織・応募ボタン）を種類の色の帯に入れ、
//           左の一覧（白いカードが並ぶ面）とは別の面だとひと目で分かるようにする
function DetailBody({ item, pal, prefs, dept, actions = null, framed = false }) {
  const auth = useAuth();
  const [reportOpen, setReportOpen] = useState(false);
  const [reportText, setReportText] = useState("");
  const [reportState, setReportState] = useState(null); // sending | done | error
  const m = matchListing(item, prefs, dept);
  const elig = eligibility(item, prefs);
  const due = dueInfo(item);
  const partner = partnerName(item);

  const tiles = [];
  if (item.kind === "event" && item.starts_at) tiles.push({ ic: "cal", label: t("career.facts.date"), value: eventWhen(item) });
  if (item.deadline) tiles.push({ ic: "clock", label: t("career.facts.deadline"), value: mdw(deadlineMs(item.deadline)), sub: due.days != null && due.days <= 14 ? due.label : null, urgent: due.urgent });
  else if (!item.starts_at) tiles.push({ ic: "clock", label: t("career.facts.deadline"), value: t("career.due.rolling") });
  if (item.kind !== "event" && payText(item)) tiles.push({ ic: "yen", label: t("career.facts.pay"), value: payText(item) });
  if (item.kind !== "event" && periodText(item)) tiles.push({ ic: "clock", label: t("career.facts.period"), value: periodText(item) });
  if (placeText(item)) tiles.push({ ic: "pin", label: t("career.facts.place"), value: placeText(item) });

  const who = [
    [t("career.detail.target"), targetText(item) || t("career.target.unknown"), elig === "no" ? t("career.target.notYou") : null],
    [t("career.detail.skillsReq"), (item.skills_req || []).map((s) => t(`career.s.${s}`)).join("、")],
    [t("career.detail.skillsPref"), (item.skills_pref || []).map((s) => t(`career.s.${s}`)).join("、")],
    [t("career.detail.depts"), (item.depts || []).map(deptName).join("、")],
    [t("career.detail.type"), item.intern_type ? t(`career.it.${item.intern_type}`) : null],
  ].filter(([, v]) => v);

  const sendReport = async () => {
    setReportState("sending");
    try {
      const r = await fetch("/api/reports", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ targetType: "career", targetId: item.id, reason: "inaccurate", detail: `${item.title}（${item.org}）\n${reportText}`.slice(0, 2000) }) });
      setReportState(r.ok || r.status === 409 ? "done" : "error");
    } catch { setReportState("error"); }
  };
  const mailto = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(`[キャリア掲載] ${item.title}`)}&body=${encodeURIComponent(`掲載ID: ${item.id}\n${item.title}（${item.org}）\n\n内容の誤り・終了など:\n`)}`;

  const head = (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
        <KindLabel kind={item.kind} pal={pal} />
        {item.promo && <MiniTag color={pal.pr}>{t(`career.promo.${item.promo}`)}</MiniTag>}
      </div>
      <h2 style={{ fontSize: framed ? 23 : 21, fontWeight: 800, color: T.txH, lineHeight: 1.4, margin: "8px 0 10px" }}>{item.title}</h2>
      <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
        <OrgMark name={item.org} pal={pal} size={30} />
        <span style={{ fontSize: 14, fontWeight: 600, color: T.tx }}>{item.org}</span>
      </div>
      {actions}
    </>
  );

  return (
    <div>
      {framed ? (
        <div style={{ margin: "0 -26px 6px", padding: "16px 26px 20px", background: `linear-gradient(0deg, ${pal[item.kind]}12, ${pal[item.kind]}12), ${T.bg2}`, borderBottom: `1px solid ${T.bd}` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 800, color: T.txD, letterSpacing: .4, marginBottom: 12 }}><Icon n="info" s={13} />{t("career.detailTitle")}</div>
          {head}
        </div>
      ) : head}
      {item.promo &&<div style={{ display: "flex", gap: 6, fontSize: 12, color: pal.pr, background: `${pal.pr}12`, borderRadius: 10, padding: "8px 10px", marginTop: 12, lineHeight: 1.6 }}><Icon n="info" s={14} />{t(`career.promoNote.${item.promo}`)}{item.promo_note ? `（${item.promo_note}）` : ""}</div>}

      {item.kind === "event" && item.reward_kind && <div style={{ marginTop: 16 }}><RewardBand item={item} pal={pal} big /></div>}

      {tiles.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 14 }}>
          {tiles.map((x, i) => (
            <div key={i} style={{ padding: "10px 12px", borderRadius: 13, background: T.bg3, minWidth: 0, gridColumn: tiles.length % 2 === 1 && i === tiles.length - 1 ? "1 / -1" : undefined }}>
              <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11.5, fontWeight: 700, color: T.txD }}><Icon n={x.ic} s={13} />{x.label}</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: T.txH, marginTop: 4, lineHeight: 1.45, wordBreak: "break-word" }}>{x.value}</div>
              {x.sub && <div style={{ fontSize: 12, fontWeight: 800, color: x.urgent ? pal.urgent : T.txD, marginTop: 2 }}>{x.sub}</div>}
            </div>
          ))}
        </div>
      )}

      {m.reasons.length > 0 && (
        <>
          <DetailHeading>{t("career.detail.match")}</DetailHeading>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {m.reasons.map((r, i) => <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12.5, fontWeight: 700, color: T.accent, background: `${T.accent}14`, borderRadius: 8, padding: "5px 9px" }}><Icon n="check" s={12} w={2.6} />{reasonText(r)}</span>)}
          </div>
        </>
      )}

      {item.summary && (<><DetailHeading>{t("career.detail.summary")}</DetailHeading><div style={{ fontSize: 14, color: T.tx, lineHeight: 1.85, whiteSpace: "pre-wrap" }}>{item.summary}</div></>)}

      <DetailHeading>{t("career.detail.who")}</DetailHeading>
      <div style={{ borderRadius: 13, border: `1px solid ${T.bd}`, overflow: "hidden" }}>
        {who.map(([k, v, warn], i) => (
          <div key={i} style={{ display: "flex", gap: 12, padding: "10px 12px", borderTop: i ? `1px solid ${T.bd}` : "none" }}>
            <div style={{ width: 76, flexShrink: 0, fontSize: 12, fontWeight: 700, color: T.txD, paddingTop: 1 }}>{k}</div>
            <div style={{ flex: 1, minWidth: 0, fontSize: 13.5, color: T.txH, lineHeight: 1.6 }}>{v}{warn && <span style={{ color: pal.event, fontWeight: 700 }}>{`（${warn}）`}</span>}</div>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginTop: 10 }}>
        {(item.fields || []).map((f) => {
          const hit = prefs.fields.includes(f);
          return <span key={f} style={{ fontSize: 11.5, fontWeight: 600, padding: "3px 8px", borderRadius: 999, color: hit ? T.accent : T.txD, background: hit ? `${T.accent}14` : T.bg3 }}>{t(`career.f.${f}`)}</span>;
        })}
      </div>

      {(item.deadline || item.starts_at) && (
        <Secondary onClick={() => addToCalendar(item)} style={{ width: "100%", marginTop: 18 }}><Icon n="cal" s={15} />{t("career.toCalendar")}</Secondary>
      )}

      <DetailHeading>{t("career.detail.info")}</DetailHeading>
      <div style={{ fontSize: 12.5, color: T.tx, lineHeight: 1.75 }}>
        <div>{partner ? t("career.src.partner", { name: partner }) : t(`career.src.${item.source === "tip" ? "tip" : "manual"}`)}</div>
        <div>{t("career.detail.checkedNote", { d: new Date(item.checked_at).toLocaleDateString(locale()) })}</div>
        <div style={{ color: T.txD, marginTop: 4 }}>{t("career.asStated")} {t("career.applyNote")}</div>
      </div>
      <div style={{ marginTop: 12 }}>
        {!reportOpen ? (
          <TextBtn onClick={() => setReportOpen(true)} style={{ color: T.txD, fontSize: 12.5, fontWeight: 600, textDecoration: "underline" }}>{t("career.reportLink")}</TextBtn>
        ) : auth.status === "account" ? (
          reportState === "done" ? <div style={{ fontSize: 13, color: T.green, fontWeight: 700 }}>{t("career.reportDone")}</div> : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <textarea value={reportText} onChange={(e) => setReportText(e.target.value)} placeholder={t("career.reportPlaceholder")} rows={3} maxLength={1500} style={{ width: "100%", boxSizing: "border-box", padding: "9px 11px", borderRadius: 11, border: `1px solid ${T.bd}`, background: T.bg2, color: T.txH, fontSize: 13.5, resize: "vertical", font: "inherit" }} />
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <Primary disabled={reportState === "sending"} onClick={sendReport} style={{ padding: "8px 16px" }}>{t("career.reportSend")}</Primary>
                {reportState === "error" && <span style={{ fontSize: 12, color: pal.urgent }}>{t("career.loadError")}</span>}
              </div>
            </div>
          )
        ) : (
          <div style={{ fontSize: 12.5, color: T.txD, lineHeight: 1.7 }}>
            {t("career.reportGuestNote")}
            <div><a href={mailto} style={{ color: T.accent, fontWeight: 700 }}>{t("career.reportGuest")}</a>（{CONTACT_EMAIL}）</div>
          </div>
        )}
      </div>
    </div>
  );
}

// 下に固定する「保存」「公式ページで応募」
function DetailActions({ item, saved, mob }) {
  const partner = partnerName(item);
  return (
    <>
      <button type="button" onClick={() => toggleSaved(item)} aria-pressed={saved} aria-label={saved ? t("career.saved") : t("career.save")}
        style={{ width: 50, height: 50, flexShrink: 0, borderRadius: 15, border: `1px solid ${saved ? T.accent : T.bd}`, background: saved ? `${T.accent}14` : T.bg2, color: saved ? T.accent : T.txH, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
        <Icon n="bmark" s={20} fill={saved} />
      </button>
      <button type="button" onClick={() => openLink(item.apply_url, mob)} style={{ ...btnBase, flex: 1, minWidth: 0, height: 50, borderRadius: 15, border: "none", background: T.accent, color: "#fff", fontSize: 15, fontWeight: 800, padding: "0 16px" }}>
        <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{partner ? t("career.openPartner", { name: partner }) : t("career.applyBtn")}</span><Icon n="ext" s={16} />
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
    <div role="dialog" aria-modal="true" aria-label={item.title} style={{ position: "fixed", inset: 0, zIndex: 1000, background: T.bg, display: "flex", flexDirection: "column", animation: "crUp .24s cubic-bezier(.2,.8,.2,1)" }}>
      <div style={{ display: "flex", alignItems: "center", padding: "calc(8px + env(safe-area-inset-top)) 10px 6px", borderBottom: `1px solid ${T.bd}` }}>
        <button type="button" onClick={onClose} aria-label={t("common.close")} style={{ width: 40, height: 40, border: "none", borderRadius: "50%", background: "transparent", color: T.txH, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}><Icon n="down" s={22} /></button>
        <div style={{ flex: 1, fontSize: 13, fontWeight: 700, color: T.txD, textAlign: "center", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", padding: "0 6px" }}>{item.org}</div>
        <span style={{ width: 40 }} />
      </div>
      <div style={{ flex: 1, overflowY: "auto", WebkitOverflowScrolling: "touch" }}>
        <div style={{ maxWidth: 680, margin: "0 auto", padding: mob ? "16px 18px 28px" : "22px 26px 30px" }}>
          <DetailBody key={item.id} item={item} pal={pal} prefs={prefs} dept={dept} />
        </div>
      </div>
      <div style={{ borderTop: `1px solid ${T.bd}`, background: T.bg }}>
        <div style={{ display: "flex", gap: 10, maxWidth: 680, margin: "0 auto", padding: "10px 16px calc(12px + env(safe-area-inset-bottom))" }}>
          <DetailActions item={item} saved={saved} mob={mob} />
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
      {deptFields.length > 0 && <TextBtn onClick={() => setFields((f) => [...new Set([...f, ...deptFields])])} style={{ marginTop: 10, fontSize: 12.5 }}>＋ {t("career.p.fromDept", { d: deptName(user.myDept) })}</TextBtn>}
      <SheetGroup title={t("career.p.skills")}>
        {CAREER_SKILLS.map((id) => <Choice key={id} on={skills.includes(id)} onClick={() => tog(skills, setSkills, id)}>{t(`career.s.${id}`)}</Choice>)}
      </SheetGroup>
      <SheetGroup title={t("career.p.target")}>
        {[null, "B", "M", "D"].map((d) => <Choice key={d || "none"} on={degree === d} onClick={() => setDegree(d)}>{d ? t(`career.deg.${d}`) : t("career.p.none")}</Choice>)}
        <select value={gradYear || ""} onChange={(e) => setGradYear(e.target.value ? Number(e.target.value) : null)} aria-label={t("career.p.gradYear")} style={{ padding: "7px 12px", borderRadius: 999, border: `1px solid ${gradYear ? T.accent : T.bd}`, background: T.bg2, color: T.txH, fontSize: 13, font: "inherit" }}>
          <option value="">{t("career.p.gradYear")}: {t("career.p.none")}</option>
          {Array.from({ length: 8 }, (_, i) => y0 + i).map((y) => <option key={y} value={y}>{gradLabel(y)}</option>)}
        </select>
      </SheetGroup>
      {fromYear.gradYear && (fromYear.degree !== degree || fromYear.gradYear !== gradYear) && (
        <TextBtn onClick={() => { setDegree(fromYear.degree); setGradYear(fromYear.gradYear); }} style={{ marginTop: 10, fontSize: 12.5 }}>＋ {t("career.p.fromYear", { v: `${t(`career.deg.${fromYear.degree}`)} ${gradLabel(fromYear.gradYear)}` })}</TextBtn>
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
      {!live.length && !gone.length && <div style={{ fontSize: 13, color: T.txD, lineHeight: 1.8, padding: "8px 0 4px" }}>{t("career.savedEmpty")}</div>}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {live.map((it) => {
          const due = dueInfo(it);
          return (
            <button key={it.id} type="button" onClick={() => onOpen(it.id)} style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "11px 12px", borderRadius: 14, border: `1px solid ${T.bd}`, background: T.bg2, cursor: "pointer", font: "inherit", textAlign: "left" }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: pal[it.kind], flexShrink: 0 }} />
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: "block", fontSize: 14, fontWeight: 700, color: T.txH, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{it.title}</span>
                <span style={{ display: "block", fontSize: 12, color: T.txD, marginTop: 2 }}>{it.org}</span>
              </span>
              <span style={{ fontSize: 12, fontWeight: 800, color: due.urgent ? pal.urgent : T.txD, whiteSpace: "nowrap" }}>{due.label}</span>
            </button>
          );
        })}
      </div>
      {gone.length > 0 && (
        <>
          <div style={{ fontSize: 12.5, fontWeight: 800, color: T.txD, margin: "18px 0 8px" }}>{t("career.savedGone")}</div>
          {gone.map((g) => (
            <div key={g.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 12px", borderRadius: 12, border: `1px dashed ${T.bd}`, marginBottom: 6 }}>
              <span style={{ flex: 1, minWidth: 0, fontSize: 13, color: T.tx, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{g.title}<span style={{ color: T.txD }}>{" · "}{g.org}</span></span>
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
  const field = { width: "100%", boxSizing: "border-box", padding: "11px 12px", borderRadius: 12, border: `1px solid ${T.bd}`, background: T.bg2, color: T.txH, fontSize: 14, font: "inherit" };
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

// ── 初めての人向け: その場で分野を選べる案内（選ぶたびに下の一覧が並び替わる） ──
function Hero({ prefs, setPrefs, dept, pal, onMore, mob }) {
  const [all, setAll] = useState(false);
  const suggested = fieldsForDept(dept);
  const order = [...suggested, ...CAREER_FIELDS.filter((f) => !suggested.includes(f))];
  const shown = all ? order : order.slice(0, mob ? 6 : 9);
  const toggle = (id) => setPrefs((p) => ({ ...p, fields: p.fields.includes(id) ? p.fields.filter((x) => x !== id) : [...p.fields, id] }));
  return (
    <section style={{ borderRadius: 22, padding: mob ? "16px 16px 14px" : "20px 20px 16px", border: `1px solid ${T.bd}`, background: T.bg2, marginBottom: 16 }}>
      <div style={{ fontSize: 12, fontWeight: 800, color: T.accent }}>{t("career.hero.kicker")}</div>
      <h2 style={{ fontSize: mob ? 17.5 : 20, fontWeight: 800, color: T.txH, lineHeight: 1.45, margin: "5px 0 4px" }}>{t("career.hero.title")}</h2>
      <div style={{ fontSize: 12.5, color: T.tx, lineHeight: 1.65 }}>{t("career.hero.body")} <TextBtn onClick={onMore} style={{ fontSize: 12.5 }}>{t("career.hero.detail")} ›</TextBtn></div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginTop: 12 }}>
        {shown.map((id) => <Choice key={id} on={prefs.fields.includes(id)} onClick={() => toggle(id)}>{t(`career.f.${id}`)}</Choice>)}
        {!all && <button type="button" onClick={() => setAll(true)} style={{ padding: "7px 12px", borderRadius: 999, border: `1px dashed ${T.bdL}`, background: "transparent", color: T.txD, fontSize: 13, cursor: "pointer", font: "inherit" }}>{t("career.hero.more", { n: order.length - shown.length })}</button>}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 14 }}>
        <Primary disabled={!prefs.fields.length} onClick={() => setPrefs({ setup: true })} style={{ padding: "10px 18px" }}>{prefs.fields.length ? t("career.hero.done", { n: prefs.fields.length }) : t("career.hero.pick")}</Primary>
        <span style={{ flex: 1 }} />
        <TextBtn onClick={() => setPrefs({ setup: true })} style={{ color: T.txD, fontWeight: 600 }}>{t("career.later")}</TextBtn>
      </div>
    </section>
  );
}

// 設定済みの興味（その場で外せる。＋で編集）
function InterestStrip({ prefs, setPrefs, onEdit }) {
  const chips = [...prefs.fields.map((id) => ({ k: "f", id, label: t(`career.f.${id}`) })), ...prefs.skills.map((id) => ({ k: "s", id, label: t(`career.s.${id}`) }))];
  const remove = (c) => setPrefs((p) => (c.k === "f" ? { ...p, fields: p.fields.filter((x) => x !== c.id) } : { ...p, skills: p.skills.filter((x) => x !== c.id) }));
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
      <span style={{ fontSize: 12.5, fontWeight: 800, color: T.txD, flexShrink: 0 }}>{t("career.interests")}</span>
      <div className="cr-scroll" style={{ display: "flex", gap: 6, overflowX: "auto", flex: 1, minWidth: 0, padding: "2px 0" }}>
        {chips.length === 0 && <span style={{ fontSize: 13, color: T.txD, whiteSpace: "nowrap" }}>{t("career.chooseInterests")}</span>}
        {chips.map((c) => (
          <span key={`${c.k}:${c.id}`} style={{ display: "inline-flex", alignItems: "center", gap: 2, padding: "5px 6px 5px 11px", borderRadius: 999, background: `${T.accent}16`, color: T.accent, fontSize: 12.5, fontWeight: 700, whiteSpace: "nowrap" }}>
            {c.label}
            <button type="button" onClick={() => remove(c)} aria-label={`${c.label} ×`} style={{ width: 20, height: 20, border: "none", borderRadius: "50%", background: "transparent", color: T.accent, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", padding: 0 }}><Icon n="x" s={12} w={2.6} /></button>
          </span>
        ))}
      </div>
      <button type="button" onClick={onEdit} style={{ ...btnBase, flexShrink: 0, padding: "6px 11px", borderRadius: 999, border: `1px solid ${T.bd}`, background: T.bg2, color: T.txH, fontSize: 12.5 }}><Icon n="plus" s={13} w={2.4} />{chips.length ? t("career.editInterests") : t("career.choose")}</button>
    </div>
  );
}

const SectionHead = ({ title, n, accent, right }) => (
  <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "20px 2px 10px" }}>
    <h3 style={{ fontSize: 15.5, fontWeight: 800, color: T.txH, margin: 0, whiteSpace: "nowrap" }}>{title}</h3>
    <span style={{ fontSize: 12.5, color: T.txD, fontWeight: 700, whiteSpace: "nowrap" }}>{t("career.count", { n })}</span>
    <span style={{ flex: 1 }} />
    {right}
  </div>
);

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
  const [width, setWidth] = useState(0);
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
  const twoCol = !mob && !wide && width >= 640;

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
  const card = (row) => (
    <OpportunityCard key={row.item.id} row={row} pal={pal} interested={interested} selected={wide && selected?.id === row.item.id}
      isNew={prevSeen > 0 && (Date.parse(row.item.created_at) || 0) > prevSeen} saved={!!savedMap[row.item.id]} onOpen={() => open(row.item.id)} />
  );
  const grid = (list) => <div style={{ display: "grid", gridTemplateColumns: twoCol ? "1fr 1fr" : "1fr", gap: 12 }}>{list.map(card)}</div>;
  const nothing = !loading && !error && rows.length === 0;
  // 並び順（最初の段の見出しの右に出す）
  const sortBtn = rows.length > 1 ? (
    <button type="button" onClick={() => setSheet("filter")} style={{ ...btnBase, padding: "4px 0", border: "none", background: "transparent", color: T.txD, fontSize: 12.5, fontWeight: 700 }}>{t(`career.sort.${sortNow}`)}<Icon n="down" s={13} /></button>
  ) : null;

  const searchRow = (
    <>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <label style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 8, padding: "0 12px", height: 44, borderRadius: 14, border: `1px solid ${T.bd}`, background: T.bg2, color: T.txD }}>
          <Icon n="search" s={17} />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("career.searchPh")} enterKeyHint="search" aria-label={t("career.searchPh")} style={{ flex: 1, minWidth: 0, border: "none", outline: "none", background: "transparent", color: T.txH, fontSize: 15, font: "inherit" }} />
          {query && <button type="button" onClick={() => setQuery("")} aria-label={t("career.clearSearch")} style={{ width: 24, height: 24, border: "none", borderRadius: "50%", background: T.bg3, color: T.tx, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", padding: 0 }}><Icon n="x" s={12} w={2.6} /></button>}
        </label>
        <button type="button" onClick={() => setSheet("filter")} aria-label={t("career.filter")} style={{ ...btnBase, height: 44, padding: mob ? "0 12px" : "0 14px", borderRadius: 14, border: `1px solid ${active.length ? T.accent : T.bd}`, background: active.length ? `${T.accent}14` : T.bg2, color: active.length ? T.accent : T.txH }}>
          <Icon n="sliders" s={17} />{!mob && t("career.filter")}
          {active.length > 0 && <span style={{ minWidth: 17, height: 17, borderRadius: 9, background: T.accent, color: "#fff", fontSize: 10.5, fontWeight: 800, display: "inline-flex", alignItems: "center", justifyContent: "center", padding: "0 4px" }}>{active.length}</span>}
        </button>
        <button type="button" onClick={() => setSheet("saved")} aria-label={t("career.savedTitle")} style={{ ...btnBase, height: 44, padding: mob ? "0 12px" : "0 14px", borderRadius: 14, border: `1px solid ${T.bd}`, background: T.bg2, color: savedCount ? T.accent : T.txH }}>
          <Icon n="bmark" s={17} fill={savedCount > 0} />{savedCount > 0 ? savedCount : !mob && !wide ? t("career.savedTitle") : null}
        </button>
      </div>
      {active.length > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginTop: 10 }}>
          {active.map((a) => (
            <span key={a.k} style={{ display: "inline-flex", alignItems: "center", gap: 2, padding: "4px 5px 4px 10px", borderRadius: 999, background: T.bg3, color: T.txH, fontSize: 12, fontWeight: 700 }}>
              {a.label}
              <button type="button" onClick={a.off} aria-label={`${a.label} ×`} style={{ width: 18, height: 18, border: "none", borderRadius: "50%", background: "transparent", color: T.tx, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", padding: 0 }}><Icon n="x" s={11} w={2.6} /></button>
            </span>
          ))}
        </div>
      )}
    </>
  );
  // 種類: 幅を 4 等分（width:0 で文字の長さに関係なく同じ幅にする。スマホでも「インターン」が切れない）
  const kindRow = (
    <div role="tablist" style={{ display: "flex", gap: 3, padding: 3, margin: "12px 0 2px", borderRadius: 13, background: T.bg3 }}>
      {KINDS.map((k) => {
        const on = kind === k;
        const c = k === "all" ? T.txH : pal[k];
        return (
          <button key={k} type="button" role="tab" aria-selected={on} onClick={() => setKind(k)} style={{ ...btnBase, flex: "1 1 0", width: 0, minWidth: 0, gap: 3, height: 36, padding: "0 2px", borderRadius: 10, border: "none", background: on ? T.bg2 : "transparent", boxShadow: on ? "0 1px 3px rgba(0,0,0,.12)" : "none", color: on ? c : T.txD, fontSize: mob ? 12.5 : 13.5, fontWeight: on ? 800 : 600 }}>
            <span>{t(`career.kind.${k}`)}</span><span style={{ fontSize: 10.5, fontWeight: 700, opacity: on ? .8 : .65 }}>{kindCounts[k] || 0}</span>
          </button>
        );
      })}
    </div>
  );

  const list = (
    <div>
      {loading && <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 18 }}>{[0, 1, 2].map((i) => <div key={i} style={{ height: 150, borderRadius: 18, background: T.bg2, border: `1px solid ${T.bd}`, opacity: .6 }} />)}</div>}
      {error && (
        <div style={{ textAlign: "center", padding: "40px 16px", color: T.txD, fontSize: 13.5 }}>
          {t("career.loadError")}
          <div style={{ marginTop: 12 }}><Secondary onClick={reload}>{t("career.retry")}</Secondary></div>
        </div>
      )}
      {!loading && !error && interested && (
        <>
          <SectionHead title={t("career.sec.matched")} n={matched.length} accent right={sortBtn} />
          {matched.length ? grid(matched) : (
            <div style={{ padding: "14px 16px", borderRadius: 16, border: `1px dashed ${T.bdL}`, fontSize: 13, color: T.tx, lineHeight: 1.7 }}>
              {t("career.sec.matchedNone")}
              <div style={{ marginTop: 6 }}><TextBtn onClick={() => setSheet("prefs")}>{t("career.editInterests")}</TextBtn></div>
            </div>
          )}
        </>
      )}
      {!loading && !error && rest.length > 0 && (
        <>
          <SectionHead title={interested ? t("career.sec.rest") : t("career.sec.all")} n={rest.length} right={interested ? null : sortBtn} />
          {grid(rest)}
        </>
      )}
      {nothing && (
        <div style={{ textAlign: "center", padding: "44px 16px 36px" }}>
          <div style={{ width: 56, height: 56, borderRadius: 18, margin: "0 auto 14px", display: "flex", alignItems: "center", justifyContent: "center", background: T.bg3, color: T.txD }}><Icon n={items.length ? "search" : "info"} s={26} /></div>
          <div style={{ fontSize: 15, fontWeight: 800, color: T.txH }}>{items.length === 0 ? t("career.emptyNone") : t("career.emptyFilter")}</div>
          <div style={{ fontSize: 13, color: T.txD, lineHeight: 1.7, marginTop: 6 }}>{items.length === 0 ? t("career.emptyNoneBody") : t("career.emptyFilterBody")}</div>
          {items.length > 0 && (
            <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap", marginTop: 14 }}>
              {query && <Secondary onClick={() => setQuery("")}>{t("career.clearSearch")}</Secondary>}
              {(active.length > 0 || kind !== "all" || prefs.onlyEligible) && <Secondary onClick={() => { setKind("all"); setPrefs((p) => ({ ...p, cond: { paid: false, remote: false, duration: null, reward: null }, onlyEligible: false })); }}>{t("career.loosen")}</Secondary>}
            </div>
          )}
        </div>
      )}

      {/* 情報提供と、この情報について */}
      <div style={{ display: "grid", gridTemplateColumns: twoCol ? "1fr 1fr" : "1fr", gap: 12, marginTop: 28 }}>
        <div style={{ padding: "16px 16px 14px", borderRadius: 18, border: `1px solid ${T.bd}`, background: T.bg2 }}>
          <div style={{ fontSize: 14.5, fontWeight: 800, color: T.txH }}>{t("career.tipCard.title")}</div>
          <div style={{ fontSize: 12.5, color: T.tx, lineHeight: 1.7, margin: "4px 0 12px" }}>{t("career.tipCard.body")}</div>
          <Secondary onClick={() => setSheet("tip")}><Icon n="plus" s={14} w={2.4} />{t("career.tip.button")}</Secondary>
        </div>
        <div style={{ padding: "16px 16px 14px", borderRadius: 18, background: T.bg3 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 14.5, fontWeight: 800, color: T.txH }}><Icon n="info" s={16} />{t("career.policy")}</div>
          <div style={{ fontSize: 12.5, color: T.tx, lineHeight: 1.7, margin: "4px 0 10px" }}>{t("career.footer")}</div>
          <TextBtn onClick={() => openLink(policyUrl(), mob)} style={{ fontSize: 13 }}>{t("career.policyRead")} ›</TextBtn>
        </div>
      </div>
    </div>
  );

  return (
    <div ref={rootRef} style={{ flex: 1, overflowY: "auto", WebkitOverflowScrolling: "touch", background: T.bg }}>
      <style>{`
@keyframes crUp{from{transform:translateY(28px);opacity:0}to{transform:none;opacity:1}}
@keyframes crFade{from{opacity:0}to{opacity:1}}
.cr-card{transition:border-color .15s ease, box-shadow .15s ease}
@media (hover:hover){.cr-card:hover{border-color:${T.bdL}!important;box-shadow:0 6px 18px rgba(0,0,0,${pal.dark ? .35 : .07})}}
.cr-card:focus-visible{outline:2px solid ${T.accent};outline-offset:2px}
.cr-scroll{scrollbar-width:none}.cr-scroll::-webkit-scrollbar{display:none}
`}</style>
      <div style={{ maxWidth: wide ? 1120 : 760, margin: "0 auto", padding: mob ? "12px 16px 32px" : "22px 24px 40px" }}>
        {!isPublic && (
          <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12, fontWeight: 600, color: pal.pr, background: `${pal.pr}14`, borderRadius: 12, padding: "8px 12px", marginBottom: 14, lineHeight: 1.6 }}>
            <Icon n="info" s={15} />{t("career.unlisted")}
          </div>
        )}
        {!mob && (
          <div style={{ marginBottom: 16 }}>
            <h1 style={{ fontSize: 26, fontWeight: 800, color: T.txH, margin: 0, letterSpacing: -.3 }}>{t("career.pageTitle")}</h1>
            <div style={{ fontSize: 13.5, color: T.txD, marginTop: 4 }}>{t("career.subtitle")}</div>
          </div>
        )}
        {!prefs.setup
          ? <Hero prefs={prefs} setPrefs={setPrefs} dept={dept} pal={pal} mob={mob} onMore={() => setSheet("prefs")} />
          : <InterestStrip prefs={prefs} setPrefs={setPrefs} onEdit={() => setSheet("prefs")} />}

        {wide ? (
          // PC: 左は「募集一覧」（検索・種類・カード。ページの面に並ぶ）、右は「募集の詳細」（影のある 1 枚のパネル）。
          // 右の見出しは種類の色の帯にし、選んでいるカードにも同じ色の帯を付けて「これの詳細」とつなげる。
          // 応募ボタンはタイトルのすぐ下（右側が長くても最初から見える）
          <div style={{ display: "flex", gap: 28, alignItems: "flex-start" }}>
            <section aria-label={t("career.listTitle")} style={{ width: 470, flexShrink: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 800, color: T.txD, letterSpacing: .4, margin: "4px 2px 10px" }}><Icon n="search" s={13} />{t("career.listTitle")}</div>
              {searchRow}{kindRow}{list}
            </section>
            <aside aria-label={t("career.detailTitle")} style={{ flex: 1, minWidth: 0, position: "sticky", top: 16, maxHeight: "calc(100vh - 92px)", overflowY: "auto", borderRadius: 22, border: `1px solid ${T.bdL}`, background: T.bg2, boxShadow: `0 14px 40px rgba(0,0,0,${pal.dark ? .5 : .1})` }}>
              {selected ? (
                <div style={{ padding: "0 26px 28px" }}>
                  <DetailBody key={selected.id} item={selected} pal={pal} prefs={prefs} dept={dept} framed
                    actions={<div style={{ display: "flex", gap: 10, marginTop: 16 }}><DetailActions item={selected} saved={!!savedMap[selected.id]} mob={false} /></div>} />
                </div>
              ) : (
                <div style={{ padding: 40, textAlign: "center", color: T.txD, fontSize: 13.5 }}>{loading ? "" : t("career.pickOne")}</div>
              )}
            </aside>
          </div>
        ) : (
          <>{searchRow}{kindRow}{list}</>
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
    <div style={{ borderRadius: 18, border: `1px solid ${T.bd}`, background: T.bg2, padding: "12px 14px 6px", margin: "10px 0" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
        <span style={{ flex: 1, fontSize: 14, fontWeight: 800, color: T.txH }}>{t("career.home.title", { n: fresh.length })}</span>
        <TextBtn onClick={() => setView("career")} style={{ fontSize: 12.5 }}>{t("career.home.more")} ›</TextBtn>
      </div>
      {fresh.map((r) => {
        const due = dueInfo(r.item);
        return (
          <button key={r.item.id} type="button" onClick={() => setView("career")} style={{ width: "100%", display: "flex", alignItems: "center", gap: 9, padding: "9px 0", border: "none", borderTop: `1px solid ${T.bd}`, background: "none", cursor: "pointer", font: "inherit", textAlign: "left" }}>
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: pal[r.item.kind], flexShrink: 0 }} />
            <span style={{ flex: 1, minWidth: 0, fontSize: 13.5, fontWeight: 600, color: T.txH, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.item.title}</span>
            <span style={{ fontSize: 12, fontWeight: 700, color: due.urgent ? pal.urgent : T.txD, whiteSpace: "nowrap" }}>{due.label}</span>
          </button>
        );
      })}
    </div>
  );
}
