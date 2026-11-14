import { useState } from "react";
import { T } from "../theme.js";
import { t } from "../i18n.js";
import { I } from "../icons.jsx";
import { getSciSessions } from "../attendanceUtils.js";
import { checkInsideBuilding } from "../hooks/useLocationSharing.js";
import { showToast } from "../hooks/useToast.js";
import { getAuth } from "../authState.js";
import { useCourseMaterials } from "../hooks/useCourseMaterials.js";
import { ymd } from "./todayPlan.js";
import { DAY_NAMES, fm, dayWord, SectionHead } from "./ui.jsx";

// ホームの「今日の予定」。前のホームと同じ行の形（時限・授業の色の縦線・行き方・出席）で、時刻順に並べる。
// いまの授業の行は授業の色で淡く塗って出席ボタンを出し、いま（なければ次）の授業の行には教材のリンクも付ける。
// 終わった予定は薄く残す。授業がない日・終わった後は「次の授業」を出す。締切はここに出さない（締切の欄）。

const EXAM = "#d97706";
const colorOf = (it) => (it.type === "exam" ? EXAM : it.type === "event" ? it.ev.color || T.orange : it.co?.col || T.accent);
const nameOf = (it) => (it.type === "exam" ? it.ex.name : it.type === "event" ? it.ev.title : it.co?.name || "");
const leadOf = (it) => (it.type === "class" ? t("home.periodLabel", { p: it.pi + 1 }) : it.type === "exam" ? t("home.itemExam") : it.type === "med" ? it.s.timeStart : t("home.itemEvent"));
const leadSubOf = (it) => (it.type === "med" ? "" : it.type === "exam" ? t("home.periodLabel", { p: it.ex.period }) : fm(it.sM));
const timeOf = (it) => (it.type === "med" ? `${it.s.timeStart}–${it.s.timeEnd}` : `${fm(it.sM)}–${fm(it.eM)}`);
const placeOf = (it) => (it.type === "class" ? [it.co.room, it.co.bldg && `(${it.co.bldg})`].filter(Boolean).join(" ")
  : it.type === "exam" ? it.ex.room : it.type === "med" ? it.s.room : it.ev.memo);

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

const DirIcon = () => <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="3 11 22 2 13 21 11 13 3 11"/></svg>;
const DocIcon = () => <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>;

/** 行の中の小さなリンク（行き方・教材）。行そのものを押したときの動きとは別 */
function LinkBtn({ onClick, children }) {
  const go = (e) => { e.stopPropagation(); onClick(); };
  return (
    <span role="button" tabIndex={0} onClick={go} onKeyDown={(e) => { if (e.key === "Enter") go(e); }}
      style={{ cursor: "pointer", color: T.accent, fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 2, flexShrink: 0 }}>{children}</span>
  );
}

/** 教材のリンク（ログインしている人だけ。件数が分かれば添える） */
function MatLink({ co, account, onOpen }) {
  const moodleId = co && account ? co.moodleId : null;
  const mat = useCourseMaterials(moodleId);
  if (!moodleId) return null;
  return <LinkBtn onClick={() => onOpen(co)}><DocIcon />{t("home.materials")}{mat.totalFiles > 0 ? ` ${mat.totalFiles}` : ""}</LinkBtn>;
}

function NameBadges({ it, now }) {
  return <>
    {it.sub && <span style={{ fontSize: 9, fontWeight: 700, color: EXAM, background: `${EXAM}15`, padding: "1px 4px", borderRadius: 3, marginLeft: 4, verticalAlign: "middle" }}>{t("home.badgeMakeup")}</span>}
    {it.type === "class" && it.dow && DAY_NAMES[now.getDay()] !== it.dow && (
      <span style={{ fontSize: 9, fontWeight: 600, color: T.txD, background: T.bg3, padding: "1px 4px", borderRadius: 3, marginLeft: 4, verticalAlign: "middle" }}>{t("home.dowBadge", { dow: t("dow.s." + it.dow) })}</span>
    )}
  </>;
}

function AttendBtn({ co, col, checkIn }) {
  const ok = checkIn.done(co), busy = checkIn.busy === co.id;
  return (
    <button type="button" onClick={(e) => { e.stopPropagation(); if (!ok && !busy) checkIn.mark(co); }} disabled={busy || ok}
      style={{ alignSelf: "center", flexShrink: 0, border: "none", borderRadius: 6, padding: "5px 9px", fontSize: 11, fontWeight: 700, cursor: ok ? "default" : "pointer", color: "#fff", background: ok ? T.green : col, opacity: busy ? 0.6 : 1, display: "inline-flex", alignItems: "center", gap: 3, whiteSpace: "nowrap", fontFamily: "inherit" }}>
      {ok ? `✓ ${t("home.attendDone")}` : busy ? t("home.attendChecking") : t("home.attend")}
    </button>
  );
}

/** 予定の 1 行 */
function Row({ it, items, now, checkIn, goToBuilding, open, showMat, account, openMaterials }) {
  const col = colorOf(it);
  const done = it.st === "done", act = it.st === "now";
  const co = it.type === "class" ? it.co : null;
  const exam = it.type === "exam";
  // 行き方の出発地: 前の授業の建物、なければ大岡山駅
  const prev = items.slice(0, items.indexOf(it)).filter((x) => x.type === "class" && x.co?.building).pop();
  const place = placeOf(it);
  return (
    <div role="button" tabIndex={0} onClick={() => open(it)} onKeyDown={(e) => { if (e.key === "Enter") open(it); }}
      style={{ display: "flex", gap: 8, padding: "6px 10px", borderRadius: 8, background: act ? `${col}12` : exam ? `${EXAM}08` : T.bg2, border: `1px solid ${act ? col : exam ? `${EXAM}20` : T.bd}`, cursor: "pointer", opacity: done ? 0.4 : 1, outline: "none" }}>
      <div style={{ width: 38, flexShrink: 0, textAlign: "center" }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: done ? T.txD : col }}>{leadOf(it)}</div>
        {leadSubOf(it) && <div style={{ fontSize: 9, color: T.txD }}>{leadSubOf(it)}</div>}
      </div>
      <div style={{ width: 3, borderRadius: 2, background: done ? T.txD : col, flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: done ? T.txD : T.txH, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{nameOf(it)}<NameBadges it={it} now={now} /></div>
        <div style={{ display: "flex", gap: 6, fontSize: 10, color: T.txD, marginTop: 1, alignItems: "center", minWidth: 0 }}>
          <span style={{ flexShrink: 0 }}>{timeOf(it)}</span>
          {place && <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{place}</span>}
          <span style={{ marginLeft: "auto", display: "inline-flex", gap: 8, flexShrink: 0 }}>
            {co?.building && !done && <LinkBtn onClick={() => goToBuilding?.(co.building, prev?.co?.building || "eki")}><DirIcon />{t("home.directions")}</LinkBtn>}
            {showMat && <MatLink co={co} account={account} onOpen={openMaterials} />}
          </span>
        </div>
      </div>
      {act && co?.building && <AttendBtn co={co} col={col} checkIn={checkIn} />}
    </div>
  );
}

/** 授業がない日・終わった後の「次の授業」（予定と同じ行の形。押すと時間割へ） */
function NextRow({ nextDay, now, onClick }) {
  const f = nextDay.first;
  const col = f.co?.col || T.accent;
  return (
    <div role="button" tabIndex={0} onClick={onClick} onKeyDown={(e) => { if (e.key === "Enter") onClick(); }}
      style={{ display: "flex", gap: 8, padding: "6px 10px", borderRadius: 8, background: T.bg2, border: `1px solid ${T.bd}`, cursor: "pointer", outline: "none" }}>
      <div style={{ width: 38, flexShrink: 0, textAlign: "center" }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: col }}>{dayWord(nextDay.day, now)}</div>
        <div style={{ fontSize: 9, color: T.txD }}>{f.type === "class" ? t("home.periodLabel", { p: f.pi + 1 }) : f.s.timeStart}</div>
      </div>
      <div style={{ width: 3, borderRadius: 2, background: col, flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: T.txH, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.co?.name}</div>
        <div style={{ fontSize: 10, color: T.txD, marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t("home.nextClass")}　{timeOf(f)}{f.co?.room ? `　${f.co.room}` : ""}</div>
      </div>
      <span style={{ color: T.txD, display: "flex", alignSelf: "center" }}>{I.arr}</span>
    </div>
  );
}

export function TodayCard({ items, nextDay, now, hasTimetable, periodLabel, account, ttView, setView, setCid, setCh, goToBuilding, records, setStatus }) {
  const checkIn = useCheckIn(records, setStatus, now);
  const hero = items.find((x) => x.st === "now") || items.find((x) => x.st === "next") || null;
  const openMaterials = (co) => { setCid(co.id); setCh("materials"); setView("course"); };
  const open = (it) => {
    if (it.type === "class") openMaterials(it.co);
    else if (it.type === "med") setView("med-tt");
    else if (it.type === "exam") setView("exams");
    else setView("calendar");
  };
  const rowProps = { items, now, checkIn, goToBuilding, open, account, openMaterials };
  const gray = { padding: "12px 0", textAlign: "center", color: T.txD, fontSize: 12 };

  return (
    <section>
      <SectionHead icon={I.cal} title={t("home.todayTitle")} action={hasTimetable ? t("nav.timetable") : null} onAction={() => setView(ttView)} />
      {!hasTimetable ? (
        <div style={{ ...gray, padding: "8px 0 4px" }}>
          <div>{t("home.noTT")}</div>
          <button type="button" onClick={() => setView("ttbuild")} style={{ marginTop: 8, border: `1px solid ${T.accent}30`, borderRadius: 8, padding: "6px 12px", background: `${T.accent}10`, color: T.accent, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>{t("home.makeTT")}</button>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {items.map((it, i) => <Row key={i} it={it} showMat={it === hero} {...rowProps} />)}
          {!hero && (
            <>
              <div style={gray}>{items.length ? t("home.allDone") : t("home.noPlans")}{!items.length && periodLabel ? `（${periodLabel}）` : ""}</div>
              {nextDay?.first && <NextRow nextDay={nextDay} now={now} onClick={() => setView(ttView)} />}
            </>
          )}
        </div>
      )}
    </section>
  );
}
