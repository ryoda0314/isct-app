/**
 * Timetable Widget — Native Capacitor Plugin Bridge
 *
 * Pushes the FULL timetable the app knows about (every quarter, every loaded
 * year) into the iOS App Group shared UserDefaults. The WidgetKit widget then
 * filters by the year + quarter chosen in its configuration screen (AppIntent).
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

/** Flatten one course (+ its extraSlots) into widget slot rows, tagged year+quarter. */
function courseToSlots(c, year, quarter) {
  const slots = [];
  const push = (per, ps, pe, room) => {
    const day = dayFromPer(per);
    if (day < 0 || day > 4) return; // weekday-only widget
    const psN = Number(ps) || 0;
    const peN = Number(pe) || psN;
    if (!psN) return;
    slots.push({
      year: Number(year) || 0,
      quarter: Number(quarter) || 0,
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
 * Push the full timetable to the widget.
 *
 * @param {Object}   opts
 * @param {Array}    opts.allCourses     - every loaded course (each carries .year/.quarter)
 * @param {Object}   [opts.pastTTCache]  - { [year]: { qData: { 1:{C:[]}, ... } } }
 * @param {number}   [opts.defaultYear]  - selection shown by an unconfigured widget
 * @param {number}   [opts.defaultQuarter]
 */
export async function saveTimetableToWidget({
  allCourses = [],
  pastTTCache = {},
  defaultYear = 0,
  defaultQuarter = 0,
} = {}) {
  if (!isNative()) return;
  await ensurePlugin();
  if (!Timetable) return;

  const slots = [];
  const seen = new Set();
  const add = (s) => {
    const k = `${s.year}|${s.quarter}|${s.day}|${s.ps}|${s.name}`;
    if (seen.has(k)) return;
    seen.add(k);
    slots.push(s);
  };

  // Loaded courses carry their own year + quarter. Multi-quarter courses
  // (e.g. 1-2Q) must emit slots for every quarter they span.
  for (const c of allCourses) {
    const y = Number(c.year) || Number(defaultYear) || 0;
    const qs = (Array.isArray(c.quarters) && c.quarters.length) ? c.quarters : [c.quarter];
    for (const rawQ of qs) {
      const q = Number(rawQ) || 0;
      if (!q) continue;
      for (const s of courseToSlots(c, y, q)) add(s);
    }
  }

  // Past years fetched on demand: pastTTCache[year] = { qData: { 1:{C}, ... } }.
  for (const [yStr, d] of Object.entries(pastTTCache)) {
    const y = Number(yStr);
    const qData = d && d.qData;
    if (!y || !qData) continue;
    for (const q of [1, 2, 3, 4]) {
      const cs = qData[q] && qData[q].C;
      if (!Array.isArray(cs)) continue;
      for (const c of cs) for (const s of courseToSlots(c, y, q)) add(s);
    }
  }

  try {
    await Timetable.save({
      // Stored as a JSON string for a stable native decode boundary.
      slots: JSON.stringify(slots),
      defaultYear: Number(defaultYear) || 0,
      defaultQuarter: Number(defaultQuarter) || 0,
    });
  } catch (e) {
    // Widget is best-effort; never block the app on failure.
    console.warn('[Timetable] widget save failed', e);
  }
}
