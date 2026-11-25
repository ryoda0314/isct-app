import holidays from "../lib/data/jp-holidays.json" with { type: "json" };
import { getAcademicInfo } from "./academicCalendar.js";

const publicHolidays = new Set(holidays);
// University-wide closures are announced for each year.
const closures = [
  ["2025-08-12", "2025-08-13"], // https://www.isct.ac.jp/ja/news/wef928vdeha8
  ["2025-12-28", "2026-01-04"], // https://www.isct.ac.jp/ja/news/02y94p55ivn6
  ["2026-08-08", "2026-08-12"], // https://www.isct.ac.jp/ja/news/m5k26th50gk6
  ["2026-12-29", "2027-01-03"], // https://www.isct.ac.jp/ja/news/jvd9i2lzdjjx
];

export function takiClock(now = new Date()) {
  const jst = new Date(now.getTime() + 9 * 60 * 60000);
  return { date: jst.toISOString().slice(0, 10), minutes: jst.getUTCHours() * 60 + jst.getUTCMinutes() };
}

// Building hours and reservable floors follow the university facility guide.
// https://www.titech.ac.jp/student-support/students/facilities/takiplaza
export function takiHours(date) {
  const calendarDay = new Date(`${date}T12:00:00`);
  const dow = calendarDay.getDay();
  const holiday = publicHolidays.has(date) || getAcademicInfo(calendarDay).items.some(item => item.type === "holiday");
  const weekendHours = dow === 0 || dow === 6 || holiday;
  const shortSeason = [2, 3, 8, 9].includes(calendarDay.getMonth() + 1);
  if (closures.some(([from, to]) => from <= date && date <= to) || (shortSeason && (dow === 0 || holiday))) {
    return { open: 0, close: 0, weekendHours };
  }
  if (shortSeason && dow === 6) return { open: 660, close: 1020, weekendHours };
  return weekendHours ? { open: 540, close: 1200, weekendHours } : { open: 510, close: 1260, weekendHours };
}

const roomNames = [
  ["WORK POD A", "WORK POD A", "B1F"],
  ["WORK POD B", "WORK POD B", "B1F"],
  ["Workshop Room 1", "ワークショップルーム1", "B2F"],
  ["Workshop Room 2", "ワークショップルーム2", "B2F"],
  ["Event Space (Library Side)", "イベントスペース（図書館側）", "B2F"],
  ["Event Space (Dry Garden Side)", "イベントスペース（ドライガーデン側）", "B2F"],
  ["Event Space (Kitchen)", "キッチンエリア", "B2F"],
  ["Grand Staircase", "大階段エリア", "B2F", "大階段"],
];
const key = str => str.normalize("NFKC").toLowerCase().replace(/[\s()]+/g, "");
const names = new Map(roomNames.flatMap(([englishName, name, floor, ...aliases]) =>
  [englishName, name, ...aliases].map(alias => [key(alias), { name, englishName, floor }])));

function minutes(value) {
  const match = /^(\d{1,2}):([0-5]\d)$/.exec(value);
  if (!match || +match[1] > 24 || (+match[1] === 24 && +match[2] !== 0)) return NaN;
  return +match[1] * 60 + +match[2];
}

// Subtract the union of the day's bookings from operating hours. Intervals
// include their start and exclude their end, including at the closing minute.
function freeIntervals(slots, open, close) {
  const free = [];
  let start = open;
  for (const slot of slots) {
    if (slot.startMin >= close) break;
    if (slot.startMin > start) free.push({ start, end: slot.startMin });
    start = Math.max(start, slot.endMin);
  }
  if (start < close) free.push({ start, end: close });
  return free;
}

function roomAvailability(space, index, day) {
  const rawName = String(space.name || "").trim();
  const group = space.group || "";
  // Depending on its layout the portal puts e.g. “WORK POD” and “A” in separate cells.
  const { name, englishName, floor } = names.get(key(rawName)) ?? names.get(key(group + rawName))
    ?? { name: rawName, englishName: rawName, floor: "その他" };
  const weekdayOnly = name === "WORK POD A" || name === "WORK POD B";
  const rows = space.slots?.[index];
  const slots = [];
  let known = Array.isArray(rows);
  for (const row of known ? rows : []) {
    const startMin = minutes(row?.start), endMin = minutes(row?.end);
    if (!(endMin > startMin)) known = false;
    else slots.push({ ...row, startMin, endMin });
  }
  slots.sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin);
  const room = { name, englishName, rawName, group, floor, weekdayOnly, slots,
    state: "unknown", free: [], current: null, next: null, freeNow: null, nextFree: null };
  if (day.phase === "closed" || (weekdayOnly && day.weekendHours)) return { ...room, state: "closed" };
  if (!known) return room;
  room.free = freeIntervals(slots, day.open, day.close);
  const inHours = slots.filter(slot => slot.startMin < day.close && slot.endMin > day.open);
  if (day.phase === "future" || day.phase === "before") {
    room.next = inHours[0] ?? null;
    room.nextFree = room.free[0] ?? null;
  }
  if (day.phase !== "open") {
    room.state = ["future", "past"].includes(day.phase) ? "schedule" : "closed";
    return room;
  }
  const minute = day.nowMin;
  room.current = inHours.find(slot => slot.startMin <= minute && minute < slot.endMin) ?? null;
  room.next = inHours.find(slot => slot.startMin > minute) ?? null;
  room.freeNow = room.free.find(interval => interval.start <= minute && minute < interval.end) ?? null;
  room.nextFree = room.free.find(interval => interval.start > minute) ?? null;
  room.state = room.current ? "busy" : "free";
  return room;
}

/** All-day schedule plus current occupancy when the selected date is today in Japan. */
export function takiDay(data, dateISO, now = new Date()) {
  const { date: today, minutes: nowMin } = takiClock(now);
  const date = dateISO || today;
  const { open, close, weekendHours } = takiHours(date);
  let phase = "open";
  if (open === close) phase = "closed";
  else if (date < today) phase = "past";
  else if (date > today) phase = "future";
  else if (nowMin < open) phase = "before";
  else if (nowMin >= close) phase = "after";
  const index = data?.days?.findIndex(d => d?.date === date) ?? -1;
  const cached = !data?.notCached && !data?.error && index >= 0 && Array.isArray(data.spaces) && data.spaces.length > 0;
  const day = { date, today, isToday: date === today, nowMin, open, close, weekendHours, phase, cached, rooms: [] };
  if (cached) day.rooms = data.spaces.map(space => roomAvailability(space, index, day));
  return day;
}
