import assert from "node:assert/strict";
import test from "node:test";
import { takiClock, takiDay, takiHours } from "../campus-sns/takiAvailability.js";

const thursday = "2026-11-26";
const at = (date, time) => new Date(`${date}T${time}:00+09:00`);
const slot = (start, end, title = "Meeting") => ({ start, end, title, org: "Test club" });
function week(date, slots, name = "Workshop Room 1") {
  return { days: [{ date }], spaces: [{ name, group: "Taki Plaza", slots: [slots] }] };
}

test("Tokyo date and minute roll over at 15:00 UTC regardless of the device zone", () => {
  assert.deepEqual(takiClock(new Date("2026-11-25T14:59:59Z")), { date: "2026-11-25", minutes: 1439 });
  assert.deepEqual(takiClock(new Date("2026-11-25T15:00:00Z")), { date: thursday, minutes: 0 });
});

test("Taki hours distinguish regular holidays, vacation Saturdays, and announced closures", () => {
  const hours = date => { const { open, close } = takiHours(date); return [open, close]; };
  assert.deepEqual(hours(thursday), [510, 1260]);
  assert.deepEqual(hours("2026-11-23"), [540, 1200]); // public holiday on Monday
  assert.deepEqual(hours("2026-08-15"), [660, 1020]);
  assert.deepEqual(hours("2026-08-16"), [0, 0]);
  assert.deepEqual(hours("2026-08-10"), [0, 0]); // university summer closure
  assert.deepEqual(hours("2026-09-22"), [0, 0]); // citizen's holiday
  assert.deepEqual(hours("2026-12-29"), [0, 0]);
  assert.deepEqual(hours("2027-01-03"), [0, 0]);
  assert.deepEqual(hours("2027-01-04"), [510, 1260]);
  assert.deepEqual(hours("2027-03-22"), [0, 0]); // substitute holiday in the academic calendar
});

test("gaps merge overlapping and adjacent bookings and clip to operating hours", () => {
  const rows = [slot("10:50", "11:30", "Second"), slot("11:30", "12:00", "Third"),
    slot("10:00", "11:00", "First"), slot("07:00", "08:45"), slot("20:00", "22:00")];
  const data = week(thursday, rows);
  const dayAt = time => takiDay(data, thursday, at(thursday, time));
  const roomAt = time => dayAt(time).rooms[0];
  assert.equal(roomAt("08:29").state, "closed");
  assert.equal(roomAt("08:30").state, "busy");
  const room = roomAt("09:00");
  assert.deepEqual(room.free, [{ start: 525, end: 600 }, { start: 720, end: 1200 }]);
  assert.deepEqual(room.freeNow, { start: 525, end: 600 });
  assert.equal(room.next.title, "First");
  assert.equal(roomAt("10:00").current.title, "First");
  assert.deepEqual(roomAt("10:55").nextFree, { start: 720, end: 1200 });
  assert.equal(roomAt("11:00").current.title, "Second");
  assert.equal(roomAt("11:30").current.title, "Third");
  assert.equal(roomAt("12:00").state, "free");
  assert.equal(dayAt("21:00").phase, "after");
  assert.equal(roomAt("21:00").state, "closed");
  assert.equal(roomAt("21:00").current, null);
  assert.equal(rows[0].title, "Second");
});

test("the selected day uses its own timetable; future and past days never report present occupancy", () => {
  const tomorrow = "2026-11-27";
  const data = { days: [{ date: thursday }, { date: tomorrow }], spaces: [
    { name: "Workshop Room 2", slots: [[], [slot("12:00", "13:00")]] },
  ] };
  const day = takiDay(data, tomorrow, at(thursday, "12:30"));
  assert.equal(day.phase, "future");
  const room = day.rooms[0];
  assert.equal(room.state, "schedule");
  assert.equal(room.current, null);
  assert.equal(room.freeNow, null);
  assert.equal(room.next.startMin, 720);
  assert.deepEqual(room.nextFree, { start: 510, end: 720 });
  assert.equal(takiDay(data, thursday, at(tomorrow, "12:00")).rooms[0].state, "schedule");
});

test("an unimported day or incomplete room's data cannot imply free space", () => {
  const now = at(thursday, "13:00");
  for (const bad of [null, { notCached: true }, week("2026-11-25", []), { days: [{ date: thursday }], spaces: [] }]) {
    const day = takiDay(bad, thursday, now);
    assert.equal(day.cached, false);
    assert.deepEqual(day.rooms, []);
  }
  for (const records of [undefined, [slot("invalid", "14:30")], [slot("14:30", "14:00")]]) {
    const room = takiDay(week(thursday, records), thursday, now).rooms[0];
    assert.equal(room.state, "unknown");
    assert.deepEqual(room.free, []);
  }
  assert.equal(takiDay(week(thursday, []), thursday, now).rooms[0].state, "free");
});

test("WORK POD has weekday availability only; the event and workshop areas are on B2", () => {
  const holiday = "2026-11-23";
  for (const date of ["2026-11-21", holiday]) {
    const pod = takiDay(week(date, [], "WORK POD A"), date, at(date, "14:00")).rooms[0];
    assert.equal(pod.weekdayOnly, true);
    assert.equal(pod.floor, "B1F");
    assert.equal(pod.state, "closed");
    assert.deepEqual(pod.free, []);
  }
  for (const [name, floor] of [["WORK POD B","B1F"], ["ワークショップルーム２","B2F"],
    ["Event space (Dry Garden Side)","B2F"], ["Grand Staircase","B2F"], ["大階段","B2F"], ["Other room","その他"]]) {
    const room = takiDay(week(thursday, [], name), thursday, at(thursday, "12:00")).rooms[0];
    assert.equal(room.rawName, name);
    assert.equal(room.floor, floor);
    assert.equal(room.state, "free");
  }
  const split = week(holiday, [], "A");
  split.spaces[0].group = "WORK POD";
  const pod = takiDay(split, holiday, at(holiday,"14:00")).rooms[0];
  assert.equal(pod.name, "WORK POD A");
  assert.equal(pod.englishName, "WORK POD A");
  assert.equal(pod.state, "closed");
});

test("both languages retain the full room name for split portal cells", () => {
  for (const [group, name, englishName] of [
    ["ワークショップルーム", "２", "Workshop Room 2"],
    ["Event space", "Library Side", "Event Space (Library Side)"],
    ["滝プラザ", "大階段", "Grand Staircase"],
    ["Other", "Unlisted room", "Unlisted room"],
  ]) {
    const data = week(thursday, [], name);
    data.spaces[0].group = group;
    const room = takiDay(data, thursday, at(thursday,"12:00")).rooms[0];
    assert.equal(room.englishName, englishName);
    assert.equal(room.rawName, name);
  }
});
