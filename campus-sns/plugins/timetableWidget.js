/**
 * Timetable Widget — Native Capacitor Plugin Bridge
 *
 * Pushes the current quarter's timetable into the iOS App Group shared
 * UserDefaults so the WidgetKit home-screen widget can render it.
 * On web (or if the native plugin is missing) this is a no-op.
 *
 * Native side: docs/ios-native/TimetablePlugin.swift  (jsName "Timetable")
 * Widget side: docs/ios-native/TimetableWidget/
 */

import { isNative } from '../capacitor.js';

let Timetable = null;

async function ensurePlugin() {
  if (Timetable) return;
  if (!isNative()) return;
  try {
    const { registerPlugin } = await import('@capacitor/core');
    // NOTE: do not return the proxy from an async fn (its .then is intercepted)
    Timetable = registerPlugin('Timetable');
  } catch {}
}

// 月火水木金土日 -> 0..6 (Mon..Sun). Widget only shows 0..4 (Mon..Fri).
const DAY_MAP = { '月': 0, '火': 1, '水': 2, '木': 3, '金': 4, '土': 5, '日': 6 };

function dayFromPer(per) {
  if (!per || typeof per !== 'string') return -1;
  const d = DAY_MAP[per.trim().charAt(0)];
  return d === undefined ? -1 : d;
}

/** Flatten one course (+ its extraSlots) into widget slot rows. */
function courseToSlots(c) {
  const slots = [];
  const push = (per, ps, pe, room) => {
    const day = dayFromPer(per);
    if (day < 0 || day > 4) return; // weekday-only widget
    const psN = Number(ps) || 0;
    const peN = Number(pe) || psN;
    if (!psN) return;
    slots.push({
      day,
      ps: psN,
      pe: peN,
      name: c.name || c.code || '',
      room: room || c.room || '',
      col: c.col || '#6375f0',
    });
  };
  push(c.per, c.periodStart, c.periodEnd, c.room);
  if (Array.isArray(c.extraSlots)) {
    for (const s of c.extraSlots) push(s.per, s.periodStart, s.periodEnd, s.room);
  }
  return slots;
}

/**
 * Save the given quarter timetable to the widget.
 *
 * @param {Object} qd      - quarter data: { C: course[], TT: grid }
 * @param {number} quarter - 1..4
 * @param {number} [year]  - academic year
 */
export async function saveTimetableToWidget(qd, quarter, year) {
  if (!isNative()) return;
  await ensurePlugin();
  if (!Timetable) return;

  const courses = (qd && Array.isArray(qd.C)) ? qd.C : [];
  const slots = courses.flatMap(courseToSlots);

  try {
    await Timetable.save({
      quarter: Number(quarter) || 0,
      year: Number(year) || 0,
      // Stored as a JSON string for a stable native decode boundary.
      slots: JSON.stringify(slots),
    });
  } catch (e) {
    // Widget is best-effort; never block the app on failure.
    console.warn('[Timetable] widget save failed', e);
  }
}
