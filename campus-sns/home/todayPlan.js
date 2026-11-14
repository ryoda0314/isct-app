// ホームの「今日の予定」「次の授業」「近い試験」を作る。画面を持たない計算だけ。
import { useState, useEffect, useMemo } from "react";
import { getTodayClasses } from "../todayClasses.js";
import { PERIOD_TIMES } from "../examData.js";
import { isDemoMode } from "../demoMode.js";
import { DEMO_EXAMS } from "../demoData.js";

export const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const sameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
const stOf = (nowMin, sM, eM) => (nowMin >= eM ? "done" : nowMin >= sM ? "now" : "next");
const minutesOf = (hhmm) => { const [h, m] = String(hhmm).split(":").map(Number); return h * 60 + (m || 0); };
const dayStart = (d, plus = 0) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + plus);

/** 医歯学の授業（medSessions は日付ごとの授業）のうち、その日のもの */
function medClassesOn(medSessions, day, nowMin) {
  if (!medSessions?.length) return [];
  const key = `${day.getFullYear()}/${String(day.getMonth() + 1).padStart(2, "0")}/${String(day.getDate()).padStart(2, "0")}`;
  const seen = new Set();
  return medSessions
    .filter((s) => { if (s.date !== key) return false; const k = `${s.code}|${s.timeStart}|${s.timeEnd}`; if (seen.has(k)) return false; seen.add(k); return true; })
    .map((s) => {
      const sM = minutesOf(s.timeStart), eM = minutesOf(s.timeEnd);
      return { type: "med", s, sM, eM, st: stOf(nowMin, sM, eM), co: { name: s.name, col: "#e04e6a", room: s.room, code: s.code } };
    });
}

/** その日の授業（理工学系の時間割＋医歯学）を時刻順に */
function classesOn(qDataAll, medSessions, day, nowMin) {
  return [
    ...getTodayClasses(qDataAll, day).map((c) => ({ ...c, type: "class" })),
    ...medClassesOn(medSessions, day, nowMin),
  ].sort((a, b) => a.sM - b.sM);
}

/**
 * 今日の予定: 授業・医歯学の授業・自分の予定・試験を時刻順に（st: done | now | next）。
 * 締切はここに入れない（ホームの「締切」に出す）。
 */
export function buildToday({ qDataAll, medSessions, myEvents, myExams, courses, now }) {
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const items = classesOn(qDataAll, medSessions, now, nowMin);
  for (const ev of myEvents || []) {
    const d = ev.date instanceof Date ? ev.date : new Date(ev.date);
    if (Number.isNaN(d.getTime()) || !sameDay(d, now)) continue;
    const sM = d.getHours() * 60 + d.getMinutes();
    const end = ev.end ? (ev.end instanceof Date ? ev.end : new Date(ev.end)) : null;
    const eM = end && sameDay(end, now) && end > d ? end.getHours() * 60 + end.getMinutes() : sM + 60;
    items.push({ type: "event", ev, sM, eM, st: stOf(nowMin, sM, eM) });
  }
  const today = ymd(now);
  for (const ex of myExams || []) {
    if (ex.date !== today) continue;
    const pt = PERIOD_TIMES[ex.period];
    if (!pt) continue;
    const sM = minutesOf(pt.start), eM = minutesOf(pt.end);
    const co = courses.find((c) => c.codeRaw === ex.code_raw || (c.code && c.code === ex.code));
    items.push({ type: "exam", ex, co, sM, eM, st: stOf(nowMin, sM, eM) });
  }
  return items.sort((a, b) => a.sM - b.sM);
}

/** 明日から 14 日先までで、最初に授業がある日とその日の 1 つ目の授業 */
export function findNextClassDay({ qDataAll, medSessions, now }) {
  for (let i = 1; i <= 14; i++) {
    const day = dayStart(now, i);
    const list = classesOn(qDataAll, medSessions, day, -1);
    if (list.length) return { day, first: list[0], count: list.length, inDays: i };
  }
  return null;
}

/** 明日から days 日先までの、自分の試験（日付・時限の順） */
export function upcomingExams(myExams, now, days = 7) {
  const from = ymd(dayStart(now, 1)), to = ymd(dayStart(now, days));
  return (myExams || [])
    .filter((e) => e.date && e.date >= from && e.date <= to)
    .sort((a, b) => `${a.date}|${a.period}`.localeCompare(`${b.date}|${b.period}`));
}

/** 試験の開始時刻（Date）。時限が分からなければその日の 0 時 */
export function examStart(ex) {
  const [y, m, d] = ex.date.split("-").map(Number);
  const pt = PERIOD_TIMES[ex.period];
  const min = pt ? minutesOf(pt.start) : 0;
  return new Date(y, m - 1, d, Math.floor(min / 60), min % 60);
}

/**
 * 自分の試験: 公開の試験日程（/api/exams）のうち、履修している科目のもの。
 * 年度・クォーターをそろえて比べる（カレンダーと同じ判定。複数クォーターの科目は該当する全クォーターに合う）。
 */
export function useMyExams(courses) {
  const [exams, setExams] = useState([]);
  useEffect(() => {
    if (isDemoMode()) { setExams(DEMO_EXAMS.exams || []); return; }
    fetch("/api/exams").then((r) => r.json()).then((d) => setExams(d.exams || [])).catch(() => {});
  }, []);
  return useMemo(() => {
    if (!courses?.length || !exams.length) return [];
    const normQ = (q) => { if (q == null || q === "") return ""; const m = String(q).match(/(\d)/); return m ? m[1] : ""; };
    const examAY = (ds) => { const [y, m] = ds.split("-").map(Number); return m - 1 >= 3 ? y : y - 1; };
    const matchYQ = (c, ey, eq) => {
      if (ey && (!c.year || String(c.year) !== ey)) return false;
      if (eq) {
        const qs = c.quarters && c.quarters.length ? c.quarters.map(String) : c.quarter == null ? [] : [normQ(c.quarter)];
        if (!qs.includes(eq)) return false;
      }
      return true;
    };
    return exams.filter((e) => {
      const ey = e.year == null ? "" : String(e.year);
      const eq = normQ(e.quarter);
      if (ey && e.date && String(examAY(e.date)) !== ey) return false;
      return courses.some((c) => matchYQ(c, ey, eq) && (c.codeRaw && c.codeRaw !== c.code ? c.codeRaw === e.code_raw : c.code === e.code));
    });
  }, [exams, courses]);
}
