// ============================================================
// カレンダーの .ics 書き出し（ログイン任意化 Phase 7）
//
// 購読フィード（/api/ical/<token>。サーバー保存なのでアカウントが要る）と同じ中身を、端末で .ics ファイルにする。
// ログインしていなくても使える: 時間割（LMS または「時間割をつくる」）・課題の締切・自分の試験・参加予定・
// 自分の予定・学年暦。期間は購読フィードと同じ（先月 1 日〜4 か月先）。
// 項目 → 予定の変換は lib/ical-items.js、ファイル化は lib/ical.js（どちらもサーバーと共用）。
// ============================================================
import { buildICalendar } from "../lib/ical.js";
import { feedItemToEvent, personalRowToEvent } from "../lib/ical-items.js";
import { makeClassResolver, matchMyExams, buildFeedItems, feedWindow, isoOf } from "./calendarItems.js";
import { ACADEMIC_EVENTS } from "./academicCalendar.js";
import { t, locCal } from "./i18n.js";
import { isNative } from "./capacitor.js";

export async function buildIcs({ qDataAll = {}, pastTTCache = {}, courses = [], records = {}, medSessions = [], asgn = [], hiddenAsgn = [], myEvents = [], now = new Date() }) {
  let exams = [];
  try { const r = await fetch("/api/exams"); if (r.ok) exams = (await r.json()).exams || []; } catch {}
  const getClasses = makeClassResolver({ qDataAll, pastTTCache, courses, records, medSessions });
  const labels = {
    deadline: (title) => `[${t("cal.deadline")}] ${title}`,
    exam: (name) => `[${t("cal.typeExam")}] ${name}`,
    sessionN: (n) => t("cal.sessionN", { n }),
    makeup: (dow) => t("cal.makeupOf", { d: t("dow.s." + dow) }),
  };
  const items = buildFeedItems({
    getClasses, asgn, hiddenAsgn, courses,
    myExams: matchMyExams(exams, courses),
    rsvpEvents: myEvents.filter((e) => String(e.id).startsWith("rsvp_")),
    labels, now,
  });
  const events = items.map(feedItemToEvent);

  // 自分の予定（RSVP の写しは上で入れた）
  for (const e of myEvents) {
    if (String(e.id).startsWith("rsvp_") || !e.date) continue;
    const start = new Date(e.date);
    if (!Number.isFinite(start.getTime())) continue;
    events.push(personalRowToEvent({ id: e.id, title: e.title, memo: e.memo, start_at: start.toISOString(), end_at: e.end ? new Date(e.end).toISOString() : null }));
  }

  // 学年暦（終日。期間内のものだけ）
  const { from, to } = feedWindow(now);
  for (const a of ACADEMIC_EVENTS) {
    const d = a.date instanceof Date ? a.date : new Date(a.date);
    if (!Number.isFinite(d.getTime()) || d < from || d >= to) continue;
    const last = new Date(a.end || d);
    last.setDate(last.getDate() + 1);
    events.push({ uid: `acal-${a.id}`, summary: locCal(a.title), description: a.desc ? locCal(a.desc) : undefined, location: a.loc ? locCal(a.loc) : undefined, allDay: true, start: isoOf(d), end: isoOf(last) });
  }

  return { text: buildICalendar({ name: "ScienceTokyo App", events }), count: events.length };
}

/** .ics を保存・共有する（savePdf.js と同じ「OS に委ねる」順: 共有シート → ネイティブ → ダウンロード） */
export async function saveIcs(text, fname = "sciencetokyo.ics") {
  const blob = new Blob([text], { type: "text/calendar;charset=utf-8" });
  const file = (() => { try { return new File([blob], fname, { type: "text/calendar" }); } catch { return null; } })();
  if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: fname }); return "ok"; }
    catch (e) { if (/Abort/i.test(String(e?.name || e?.message || ""))) return "cancel"; }
  }
  if (isNative()) {
    try {
      const { Filesystem, Directory, Encoding } = await import("@capacitor/filesystem");
      const { Share } = await import("@capacitor/share");
      const { uri } = await Filesystem.writeFile({ path: fname, data: text, directory: Directory.Cache, encoding: Encoding.UTF8 });
      await Share.share({ title: fname, text: fname, url: uri });
      return "ok";
    } catch (e) {
      if (/cancel/i.test(String(e?.message || e || ""))) return "cancel";
      console.error("[icsExport] native save", e?.message || e);
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fname;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 60000);
  return "ok";
}
