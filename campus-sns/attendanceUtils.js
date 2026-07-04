// 出欠管理: 授業回（セッション）リスト生成ユーティリティ
// 理工学系 = 学年暦から授業回を自動生成 / 医歯学系 = med_sessions の各授業日をそのまま使う
import { getClassDates } from "./academicCalendar.js";

const DOW_RE = /([月火水木金土])/;

/** 現在の学年度（4月始まり）。1〜3月は前年扱い。 */
function currentAcademicYear() {
  const d = new Date();
  const y = d.getFullYear();
  return d.getMonth() >= 3 ? y : y - 1; // getMonth: 0=1月, 3=4月
}

/**
 * 科目が開講される曜日の集合を返す（主時限 per + 副時限 extraSlots）。
 * 例: per="月1-4", extraSlots=[{per:"水1-2"}] → ["月","水"]
 */
export function getCourseDays(course) {
  const days = [];
  const push = (per) => {
    const m = (per || "").match(DOW_RE);
    if (m && !days.includes(m[1])) days.push(m[1]);
  };
  push(course?.per);
  if (Array.isArray(course?.extraSlots)) {
    for (const s of course.extraSlots) push(s?.per);
  }
  return days;
}

/**
 * 理工学系: 科目の全授業回を [{sessionKey, dateStr, dow, n, sub, label}] で返す（日付昇順）。
 * 週複数回授業は曜日ごとに回が積まれるため自然に複数回ぶん生成される。
 */
export function getSciSessions(course) {
  const qs = (course?.quarters && course.quarters.length) ? course.quarters
    : (course?.quarter ? [course.quarter] : []);
  if (!course || qs.length === 0) return [];
  const days = getCourseDays(course);
  if (days.length === 0) return [];
  const ay = course.year != null ? Number(course.year) : currentAcademicYear();
  // 複数クォーター科目(例:1-2Q)は 1Q/2Q で回番号(第N回)が重複するため、
  // sessionKey に qN を付けて衝突を防ぐ。単一クォーター科目は従来キーのまま
  // (保存済み出欠レコードを壊さないため)。
  const multi = qs.length > 1;
  const out = [];
  for (const q of qs) {
    for (const c of getClassDates(ay, q)) {
      if (!days.includes(c.dow)) continue;
      out.push({
        sessionKey: `${multi ? `q${q}` : ""}${c.dow}${c.n}${c.sub ? "s" : ""}`,
        dateStr: c.dateStr,
        dow: c.dow,
        n: c.n,
        sub: c.sub,
        label: `${c.dow} 第${c.n}回${c.sub ? "(振替)" : ""}`,
      });
    }
  }
  out.sort((a, b) => (a.dateStr < b.dateStr ? -1 : a.dateStr > b.dateStr ? 1 : 0));
  return out;
}

/**
 * 医歯学系: medSessions を科目code ごとにまとめ、各授業日を日付順で返す。
 * 返り値: [{ code, name, instructor, sessions:[{sessionKey, dateStr, date, day, timeStart, timeEnd, periodStr, room, title}] }]
 */
export function getMedSessionsByCourse(medSessions = []) {
  const byCode = new Map();
  for (const s of medSessions) {
    if (!s || !s.code || !s.date) continue;
    if (!byCode.has(s.code)) {
      byCode.set(s.code, { code: s.code, name: s.name, instructor: s.instructor, sessions: [] });
    }
    byCode.get(s.code).sessions.push({
      sessionKey: `${s.date}_${s.timeStart || ""}`,
      dateStr: medDateToISO(s.date),
      date: s.date,
      day: s.day,
      timeStart: s.timeStart,
      timeEnd: s.timeEnd,
      periodStr: s.periodStr,
      room: s.room,
      title: s.sessionTitle,
    });
  }
  const out = Array.from(byCode.values());
  for (const c of out) {
    c.sessions.sort((a, b) =>
      a.date === b.date
        ? (a.timeStart || "") < (b.timeStart || "") ? -1 : 1
        : a.date < b.date ? -1 : 1
    );
  }
  return out;
}

/** "2026/04/03" → "2026-04-03"（DB session_date 用）。不正値は null。 */
export function medDateToISO(d) {
  if (!d) return null;
  const m = d.match(/(\d{4})\/(\d{1,2})\/(\d{1,2})/);
  if (!m) return null;
  return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
}

/** デフォルトの欠席可能上限（総回数の 1/3 まで欠席可＝1/3超で不可）。 */
export function defaultAbsenceLimit(total) {
  return Math.floor((total || 0) / 3);
}

/**
 * 臨時休講(cancelled)を考慮して授業回に「実際の第N回(ordinal)」と cancelled を付与する。
 * sessions: getSciSessions の返り値（日付昇順であることが前提）。
 * cancelledKeys: 休講指定された sessionKey の Set。
 * ordinal = その回までの「休講でない」授業の通し番号（休講回は ordinal=null）。
 * 週複数回科目でも sessionKey が日付順に並ぶため、ordinal は科目全体の通し回数になる。
 */
export function annotateSessions(sessions = [], cancelledKeys = new Set()) {
  let held = 0;
  return sessions.map((s) => {
    const cancelled = cancelledKeys.has(s.sessionKey);
    if (!cancelled) held += 1;
    return { ...s, cancelled, ordinal: cancelled ? null : held };
  });
}
