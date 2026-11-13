// カレンダーの項目 → iCalendar の予定（lib/ical.js の buildICalendar に渡す形）への変換。
// 購読フィード（app/api/ical/[token]）と、端末での .ics 書き出し（campus-sns/icsExport.js）で共用する。
// import が無いので、サーバーでもブラウザでも動く。

const DAY = 86400000;
const JST = 9 * 3600000;
const kindLabel = { class: 'class', asgn: 'deadline', exam: 'exam', event: 'event', acal: 'acal' };

/** buildFeedItems（campus-sns/calendarItems.js）の 1 項目 → 予定 */
export function feedItemToEvent(it) {
  const ev = { uid: `${kindLabel[it.k] || it.k}-${it.id}`, summary: it.t, location: it.l, description: it.d };
  if (it.allDay) Object.assign(ev, { allDay: true, start: it.s, end: it.e });
  else Object.assign(ev, { start: new Date(it.s), end: it.e ? new Date(it.e) : undefined });
  if (it.k === 'asgn') ev.free = true; // a deadline is a point in time, not busy time
  return ev;
}

/** 自分の予定（{ id, title, memo, start_at, end_at }）→ 予定 */
export function personalRowToEvent(r) {
  const startMs = new Date(r.start_at).getTime();
  const ev = { uid: `my-${r.id}`, summary: r.title, description: r.memo || undefined };
  if (r.end_at) {
    Object.assign(ev, { start: new Date(startMs), end: new Date(r.end_at) });
  } else if ((startMs + JST) % DAY === 0) {
    // Saved with no time (00:00 JST, no end) → all-day on that JST date.
    const ymd = new Date(startMs + JST).toISOString().slice(0, 10);
    const next = new Date(startMs + JST + DAY).toISOString().slice(0, 10);
    Object.assign(ev, { allDay: true, start: ymd, end: next });
  } else {
    // No end time: show as one hour, as the in-app overlap check assumes.
    Object.assign(ev, { start: new Date(startMs), end: new Date(startMs + 3600000) });
  }
  return ev;
}
