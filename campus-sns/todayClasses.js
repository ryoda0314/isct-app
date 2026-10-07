// 「今日の授業」と「次の授業」。HomeView の判定と同じく、学年暦（祝日・休講日・振替授業）を考慮する。
import { getAcademicInfo, getCurrentQuarter } from "./academicCalendar.js";
import { buildTimetable } from "../lib/transform/timetable-builder.js";

export const PERIODS = [
  { s: [8, 50], e: [10, 30], l: "1限" },
  { s: [10, 45], e: [12, 25], l: "2限" },
  { s: [13, 30], e: [15, 10], l: "3限" },
  { s: [15, 25], e: [17, 5], l: "4限" },
  { s: [17, 15], e: [18, 55], l: "5限" },
];
const DOW = { 月: 0, 火: 1, 水: 2, 木: 3, 金: 4 };

/** qDataAll: { [quarter]: { C: courses[] } } → [{ co, pd, pi, sM, eM, st }]（st: done | now | next） */
export function getTodayClasses(qDataAll, now = new Date()) {
  if (!qDataAll) return [];
  const ay = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const cache = {};
  const ttOf = (q) => {
    if (!(q in cache)) {
      const cs = (qDataAll[q]?.C || []).filter((c) => Number(c.year || 0) === ay);
      const tt = cs.length ? buildTimetable(cs) : [];
      cache[q] = tt.some((row) => row.some(Boolean)) ? tt : [];
    }
    return cache[q];
  };
  const row = (tt, di) => PERIODS.map((pd, pi) => {
    const co = tt[pi]?.[di];
    if (!co) return null;
    const sM = pd.s[0] * 60 + pd.s[1];
    const eM = pd.e[0] * 60 + pd.e[1];
    return { co, pd, pi, sM, eM, st: nowMin >= eM ? "done" : nowMin >= sM ? "now" : "next" };
  }).filter(Boolean);

  const acal = getAcademicInfo(now);
  if (acal.items.length > 0 || acal.period) {
    return acal.items
      .filter((it) => it.type === "class" && DOW[it.dow] !== undefined)
      .flatMap((it) => row(ttOf(it.q), DOW[it.dow]));
  }
  const dow = now.getDay();
  if (dow < 1 || dow > 5) return [];
  return row(ttOf(getCurrentQuarter(now)), dow - 1);
}

/**
 * 今日これから向かう授業（建物が分かるもの）。
 * 始まって20分以内の授業は「遅れて向かう」ことがあるので含め、それより前に始まった授業は飛ばす。
 * 2コマ続きの授業は最初のコマ（開始が早い方）が選ばれる。
 */
export function getNextClass(qDataAll, now = new Date()) {
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const list = getTodayClasses(qDataAll, now)
    .filter((c) => c.co.building && (c.st === "next" || (c.st === "now" && nowMin - c.sM <= 20)))
    .sort((a, b) => a.sM - b.sM);
  return list[0] || null;
}
