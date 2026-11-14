import { useState } from "react";
import { T } from "../theme.js";
import { t } from "../i18n.js";
import { getSciSessions } from "../attendanceUtils.js";
import { checkInsideBuilding } from "../hooks/useLocationSharing.js";
import { showToast } from "../hooks/useToast.js";
import { getAuth } from "../authState.js";
import { useCourseMaterials } from "../hooks/useCourseMaterials.js";
import { ymd } from "./todayPlan.js";
import { DAY_NAMES, fm, dayWord, SectionHead, card, rowStyle } from "./ui.jsx";

// ホームの「今日の予定」。いま受けている（または次の）予定を大きく出し、残りを下に並べる。
// 終わった予定は畳む。授業がない日・終わった後は「次の授業」を出す。締切はここに出さない（締切の欄）。

const colorOf = (it) => (it.type === "exam" ? "#d97706" : it.type === "event" ? it.ev.color || T.orange : it.co?.col || T.accent);
const nameOf = (it) => (it.type === "exam" ? it.ex.name : it.type === "event" ? it.ev.title : it.co?.name || "");
const timeOf = (it) => {
  if (it.type === "class") return `${t("home.periodLabel", { p: it.pi + 1 })} · ${fm(it.sM)}–${fm(it.eM)}`;
  if (it.type === "exam") return `${t("home.itemExam")} · ${t("home.periodLabel", { p: it.ex.period })} · ${fm(it.sM)}–${fm(it.eM)}`;
  if (it.type === "med") return `${it.s.timeStart}–${it.s.timeEnd}`;
  return it.ev.end ? `${fm(it.sM)}–${fm(it.eM)}` : fm(it.sM);
};
const subOf = (it) => {
  if (it.type === "class") return [it.co.room, it.co.bldg && `(${it.co.bldg})`].filter(Boolean).join(" ");
  if (it.type === "exam") return [it.ex.room, it.ex.instructor].filter(Boolean).join(" · ");
  if (it.type === "med") return [it.s.room, it.s.instructor].filter(Boolean).join(" · ");
  return it.ev.memo || "";
};

/** 出席（理工学系の授業）: 現在地が授業の建物の範囲内なら present を記録。ポイントはアカウントのみ */
function useCheckIn(records, setStatus, now) {
  const [busy, setBusy] = useState(null);
  const day = ymd(now);
  const sessionOf = (co) => getSciSessions(co).find((s) => s.dateStr === day) || null;
  const done = (co) => { const s = sessionOf(co); return s ? (records.sci || {})[String(co.id)]?.[s.sessionKey] === "present" : false; };
  const mark = (co) => {
    if (busy) return;
    if (!co?.building) { showToast(t("toast.attendNoBuilding")); return; }
    const sess = sessionOf(co);
    if (!sess) { showToast(t("toast.attendNoSession")); return; }
    if (!navigator.geolocation) { showToast(t("toast.attendNoGps")); return; }
    setBusy(co.id);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude, accuracy } = pos.coords;
        const buf = Math.max(20, Math.min(accuracy || 30, 50)); // GPS の誤差を 20〜50m 許す
        const { ok, distance } = checkInsideBuilding(latitude, longitude, co.building, buf);
        if (ok) {
          setStatus?.("sci", co.id, sess, "present"); showToast(t("toast.attendOk"), "success");
          // ツバメポイント（サーバーがジオフェンスを再確認・授業回ごとに 1 回・1 日の上限あり）
          if (getAuth().status === "account") fetch("/api/attendance/checkin", { method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ kind: "sci", course_key: co.id, session_key: sess.sessionKey, session_date: sess.dateStr || null, building: co.building, lat: latitude, lng: longitude }) })
            .then((r) => (r.ok ? r.json() : null)).then((d) => { if (d && d.awarded > 0) showToast(`+${d.awarded} pt`, "success"); }).catch(() => {});
        } else showToast(t("toast.attendOutside", { d: Math.round(distance) }));
        setBusy(null);
      },
      (err) => {
        // 拒否(1)は設定で許可が必要、タイムアウト(3)は屋内などで再試行を促す
        showToast(t(err?.code === 1 ? "toast.attendGpsDenied" : err?.code === 3 ? "toast.attendGpsTimeout" : "toast.attendNoGps"));
        setBusy(null);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 5000 },
    );
  };
  return { busy, done, mark };
}

function Btn({ children, onClick, primary, color, disabled }) {
  return (
    <button type="button" disabled={disabled} onClick={(e) => { e.stopPropagation(); onClick?.(); }}
      style={{ display: "inline-flex", alignItems: "center", gap: 5, height: 34, padding: "0 13px", borderRadius: 10, fontFamily: "inherit", fontSize: 13, fontWeight: 700, cursor: disabled ? "default" : "pointer",
        border: primary ? "none" : `1px solid ${T.bd}`, background: primary ? color : T.bg, color: primary ? "#fff" : T.txH, opacity: disabled && !primary ? 0.6 : 1, whiteSpace: "nowrap" }}>
      {children}
    </button>
  );
}

const Dir = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><polygon points="3 11 22 2 13 21 11 13 3 11"/></svg>;
const Doc = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>;

/** いま（または次）の予定。出席・行き方・教材のボタン付き */
function Hero({ it, now, items, account, checkIn, open, openMaterials, goToBuilding }) {
  const col = colorOf(it);
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const live = it.st === "now";
  const mins = it.sM - nowMin;
  const until = !live && mins > 0 ? (mins < 60 ? t("home.inMin", { n: mins }) : t("home.inHM", { h: Math.floor(mins / 60), m: mins % 60 })) : null;
  const co = it.type === "class" ? it.co : null;
  const moodleId = co && account ? co.moodleId : null;
  const mat = useCourseMaterials(moodleId);
  // 行き方の出発地: 前の授業の建物、なければ大岡山駅
  const prev = items.slice(0, items.indexOf(it)).filter((x) => x.type === "class" && x.co?.building).pop();
  const otherDay = it.type === "class" && it.dow && DAY_NAMES[now.getDay()] !== it.dow;
  const sub = subOf(it);

  return (
    <div role="button" tabIndex={0} onClick={() => open(it)} onKeyDown={(e) => { if (e.key === "Enter") open(it); }}
      style={{ padding: "14px 14px 13px", cursor: "pointer", outline: "none" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <span style={{ fontSize: 11.5, fontWeight: 800, padding: "3px 8px", borderRadius: 6, background: live ? col : `${col}1c`, color: live ? "#fff" : col }}>
          {live ? t("home.nowLabel") : t("home.nextLabel")}
        </span>
        <span style={{ fontSize: 12.5, fontWeight: 600, color: T.txD }}>{timeOf(it)}</span>
        {until && <span style={{ fontSize: 12.5, fontWeight: 700, color: col }}>{until}</span>}
      </div>
      <div style={{ marginTop: 8, fontSize: 17, fontWeight: 800, color: T.txH, lineHeight: 1.35, overflowWrap: "anywhere" }}>
        {nameOf(it)}
        {it.sub && <span style={{ marginLeft: 6, verticalAlign: "middle", fontSize: 10.5, fontWeight: 700, color: "#d97706", background: "#d9770615", padding: "2px 5px", borderRadius: 4 }}>{t("home.badgeMakeup")}</span>}
        {otherDay && <span style={{ marginLeft: 6, verticalAlign: "middle", fontSize: 10.5, fontWeight: 700, color: T.txD, background: T.bg3, padding: "2px 5px", borderRadius: 4 }}>{t("home.dowBadge", { dow: t("dow.s." + it.dow) })}</span>}
      </div>
      {sub && <div style={{ marginTop: 3, fontSize: 13, color: T.txD }}>{sub}</div>}
      {(co?.building || moodleId) && (
        <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
          {live && co?.building && (() => {
            const ok = checkIn.done(co), busy = checkIn.busy === co.id;
            return <Btn primary color={ok ? T.green : col} disabled={ok || busy} onClick={() => checkIn.mark(co)}>{ok ? `✓ ${t("home.attendDone")}` : busy ? t("home.attendChecking") : t("home.attend")}</Btn>;
          })()}
          {co?.building && <Btn onClick={() => goToBuilding?.(co.building, prev?.co?.building || "eki")}><Dir />{t("home.directions")}</Btn>}
          {moodleId && <Btn onClick={() => openMaterials(co)}><Doc />{t("home.materials")}{mat.totalFiles > 0 && <span style={{ color: T.txD, fontWeight: 600 }}>{mat.totalFiles}</span>}</Btn>}
        </div>
      )}
    </div>
  );
}

/** そのほかの予定の 1 行 */
function Row({ it, open, dim }) {
  const col = colorOf(it);
  const lead = it.type === "class" ? t("home.periodLabel", { p: it.pi + 1 }) : it.type === "exam" ? t("home.itemExam") : it.type === "med" ? it.s.timeStart : t("home.itemEvent");
  const sub = [it.type === "med" ? null : fm(it.sM), subOf(it)].filter(Boolean).join(" · ");
  return (
    <button type="button" onClick={() => open(it)} style={{ ...rowStyle(false), opacity: dim ? 0.5 : 1 }}>
      <span style={{ width: 40, flexShrink: 0, fontSize: 12, fontWeight: 800, color: col }}>{lead}</span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: "block", fontSize: 14, fontWeight: 650, color: T.txH, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{nameOf(it)}</span>
        {sub && <span style={{ display: "block", marginTop: 2, fontSize: 12, color: T.txD, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{sub}</span>}
      </span>
      <span style={{ color: T.txD, fontSize: 16, flexShrink: 0 }}>›</span>
    </button>
  );
}

/** 予定がないとき・終わったときの案内と、次の授業 */
function Quiet({ text, note, action, onAction, nextDay, now, onNext }) {
  const f = nextDay?.first;
  return (
    <div style={{ padding: "16px 14px" }}>
      <div style={{ fontSize: 14.5, fontWeight: 700, color: T.txH }}>{text}</div>
      {note && <div style={{ marginTop: 3, fontSize: 12.5, color: T.txD }}>{note}</div>}
      {action && <div style={{ marginTop: 12 }}><Btn primary color={T.accent} onClick={onAction}>{action}</Btn></div>}
      {f && (
        <button type="button" onClick={onNext} style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", marginTop: 12, padding: "10px 12px", borderRadius: 12, border: `1px solid ${T.bd}`, background: T.bg, cursor: "pointer", font: "inherit", textAlign: "left" }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: T.txD, flexShrink: 0 }}>{t("home.nextClass")}</span>
          <span style={{ flex: 1, minWidth: 0, fontSize: 13.5, fontWeight: 650, color: T.txH, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {dayWord(nextDay.day, now)} {f.type === "class" ? t("home.periodLabel", { p: f.pi + 1 }) : f.s.timeStart}　{f.co.name}
          </span>
          <span style={{ color: T.txD, fontSize: 16 }}>›</span>
        </button>
      )}
    </div>
  );
}

export function TodayCard({ items, nextDay, now, hasTimetable, periodLabel, account, ttView, setView, setCid, setCh, goToBuilding, records, setStatus }) {
  const [showDone, setShowDone] = useState(false);
  const checkIn = useCheckIn(records, setStatus, now);
  const hero = items.find((x) => x.st === "now") || items.find((x) => x.st === "next") || null;
  const rest = items.filter((x) => x !== hero && x.st !== "done");
  const done = items.filter((x) => x !== hero && x.st === "done");

  const openMaterials = (co) => { setCid(co.id); setCh("materials"); setView("course"); };
  const open = (it) => {
    if (it.type === "class") openMaterials(it.co);
    else if (it.type === "med") setView("med-tt");
    else if (it.type === "exam") setView("exams");
    else setView("calendar");
  };

  let quiet = null;
  if (!hero) {
    if (!hasTimetable) quiet = <Quiet text={t("home.noTT")} note={t("home.noTTNote")} action={t("home.makeTT")} onAction={() => setView("ttbuild")} />;
    else quiet = <Quiet text={items.length ? t("home.allDone") : t("home.noClassToday")} note={items.length ? null : periodLabel} nextDay={nextDay} now={now} onNext={() => setView(ttView)} />;
  }

  return (
    <section>
      <SectionHead title={t("home.todayTitle")} action={hasTimetable ? t("nav.timetable") : null} onAction={() => setView(ttView)} />
      <div style={card()}>
        {hero && <Hero it={hero} now={now} items={items} account={account} checkIn={checkIn} open={open} openMaterials={openMaterials} goToBuilding={goToBuilding} />}
        {quiet}
        {rest.map((it, i) => <Row key={`r${i}`} it={it} open={open} />)}
        {done.length > 0 && (
          <button type="button" onClick={() => setShowDone((v) => !v)} style={{ ...rowStyle(false), justifyContent: "center", padding: "9px 14px", fontSize: 12.5, fontWeight: 700, color: T.txD }}>
            {showDone ? t("home.hideDone") : t("home.showDone", { n: done.length })}
          </button>
        )}
        {showDone && done.map((it, i) => <Row key={`d${i}`} it={it} open={open} dim />)}
      </div>
    </section>
  );
}
