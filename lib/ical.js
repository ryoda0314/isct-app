// Minimal RFC 5545 (iCalendar) writer for the subscription feed (/api/ical/<token>).
// Timed events are written in UTC ("...Z"), so no VTIMEZONE block is needed;
// all-day events use VALUE=DATE.

const UID_DOMAIN = 'sciencetokyo.app';

// TEXT value escaping (RFC 5545 §3.3.11).
const esc = (s) => String(s)
  .replace(/\\/g, '\\\\')
  .replace(/;/g, '\\;')
  .replace(/,/g, '\\,')
  .replace(/\r\n|\r|\n/g, '\\n');

// Fold content lines at 75 octets (§3.1) without splitting a UTF-8 character —
// Japanese titles are 3 bytes per char, so counting JS chars is not enough.
function fold(line) {
  const enc = new TextEncoder();
  if (enc.encode(line).length <= 75) return line;
  const out = [];
  let cur = '';
  let bytes = 0;
  for (const ch of line) {
    const n = enc.encode(ch).length;
    if (bytes + n > 75) {
      out.push(cur);
      cur = ' '; // continuation lines start with one space, counted in the 75
      bytes = 1;
    }
    cur += ch;
    bytes += n;
  }
  out.push(cur);
  return out.join('\r\n');
}

const utc = (d) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
const dateOnly = (ymd) => ymd.replace(/-/g, '');

/**
 * @param {Object} opts
 * @param {string} opts.name  - calendar display name
 * @param {Array}  opts.events - [{ uid, summary, start, end?, allDay?, location?, description?, free? }]
 *   start/end: Date for timed events, "YYYY-MM-DD" for all-day (end exclusive).
 *   A timed event without `end` is a zero-length point in time (used for deadlines).
 *   free: TRANSP:TRANSPARENT (doesn't block the time as busy).
 * @param {Date}   [opts.stamp] - DTSTAMP for every event
 */
export function buildICalendar({ name, events, stamp = new Date() }) {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//ScienceTokyo App//Calendar Feed//JA',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${esc(name)}`,
    'X-WR-TIMEZONE:Asia/Tokyo',
    // Hints for Apple Calendar / Outlook; Google ignores them and polls on its own schedule.
    'REFRESH-INTERVAL;VALUE=DURATION:PT3H',
    'X-PUBLISHED-TTL:PT3H',
  ];
  const dtstamp = utc(stamp);
  for (const ev of events) {
    lines.push('BEGIN:VEVENT');
    lines.push(`UID:${esc(ev.uid)}@${UID_DOMAIN}`);
    lines.push(`DTSTAMP:${dtstamp}`);
    if (ev.allDay) {
      lines.push(`DTSTART;VALUE=DATE:${dateOnly(ev.start)}`);
      if (ev.end) lines.push(`DTEND;VALUE=DATE:${dateOnly(ev.end)}`);
    } else {
      lines.push(`DTSTART:${utc(ev.start)}`);
      if (ev.end) lines.push(`DTEND:${utc(ev.end)}`);
    }
    lines.push(`SUMMARY:${esc(ev.summary)}`);
    if (ev.location) lines.push(`LOCATION:${esc(ev.location)}`);
    if (ev.description) lines.push(`DESCRIPTION:${esc(ev.description)}`);
    lines.push(`TRANSP:${ev.free ? 'TRANSPARENT' : 'OPAQUE'}`);
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}
