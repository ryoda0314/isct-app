import { useState, useEffect, useCallback, useMemo } from 'react';
import { isDemoMode } from '../demoMode.js';
import { makeClassResolver, matchMyExams, buildFeedItems } from '../calendarItems.js';
import { t } from '../i18n.js';

// iCal subscription feed (Google Calendar etc.): status + on/off/rotate, and the
// snapshot upload. The LMS blocks server IPs, so the server can't compute classes
// or deadlines — this hook builds them from the same data the calendar shows and
// PUTs them to /api/calendar-feed whenever they change.

const STATUS_KEY = 'calFeedStatus'; // { enabled, url, syncedAt, at }
const HASH_KEY = 'calFeedHash';     // hash of the last snapshot this device uploaded
const STATUS_TTL = 24 * 60 * 60 * 1000; // re-check status once a day (feed may be toggled on another device)
const SYNC_DELAY = 5000; // let startup data (statuses, attendance) settle before uploading

const readLS = (k) => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } };
const writeLS = (k, v) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch {} };

// FNV-1a — only to skip re-uploading an unchanged snapshot; the server re-checks with sha256.
const fnv = (s) => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); } return `${(h >>> 0).toString(36)}:${s.length}`; };

export function useCalendarFeed({ enabled, asgn, hiddenAsgn, courses, qDataAll, pastTTCache, medSessions, records, myEvents }) {
  const [status, setStatusRaw] = useState(() => readLS(STATUS_KEY) || { enabled: false });
  const [busy, setBusy] = useState(false);
  const [exams, setExams] = useState(null);

  const setStatus = useCallback((s) => {
    const next = { enabled: !!s.enabled, url: s.url || null, syncedAt: s.syncedAt || null, at: Date.now() };
    setStatusRaw(next);
    writeLS(STATUS_KEY, next);
  }, []);

  const refresh = useCallback(async () => {
    if (isDemoMode()) return;
    try { const r = await fetch('/api/calendar-feed'); if (r.ok) setStatus(await r.json()); } catch {}
  }, [setStatus]);

  useEffect(() => {
    if (!enabled || isDemoMode()) return;
    const s = readLS(STATUS_KEY);
    if (!s || Date.now() - (s.at || 0) > STATUS_TTL) refresh();
  }, [enabled, refresh]);

  const call = useCallback(async (method, body) => {
    if (isDemoMode()) return false;
    setBusy(true);
    try {
      const r = await fetch('/api/calendar-feed', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
      });
      if (!r.ok) return false;
      // A (re)created feed row starts empty — forget the last upload so it's sent again.
      writeLS(HASH_KEY, null);
      setStatus(await r.json());
      return true;
    } catch { return false; } finally { setBusy(false); }
  }, [setStatus]);

  const enable = useCallback(() => call('POST', {}), [call]);
  const rotate = useCallback(() => call('POST', { rotate: true }), [call]);
  const disable = useCallback(() => call('DELETE'), [call]);

  const on = !!enabled && status.enabled && !isDemoMode();

  useEffect(() => {
    if (!on || exams) return;
    fetch('/api/exams').then((r) => (r.ok ? r.json() : null)).then((d) => { if (d) setExams(d.exams || []); }).catch(() => {});
  }, [on, exams]);

  // Wait until courses are in and submission statuses are known — uploading the
  // empty startup state would briefly wipe the subscribed calendar.
  const dataReady = on && exams !== null && courses?.length > 0 && !asgn.some((a) => a.st === 'loading');

  const items = useMemo(() => {
    if (!dataReady) return null;
    const getClasses = makeClassResolver({ qDataAll, pastTTCache, courses, records, medSessions });
    const labels = {
      deadline: (title) => `[${t('cal.deadline')}] ${title}`,
      exam: (name) => `[${t('cal.typeExam')}] ${name}`,
      sessionN: (n) => t('cal.sessionN', { n }),
      makeup: (dow) => t('cal.makeupOf', { d: t('dow.s.' + dow) }),
    };
    return buildFeedItems({
      getClasses,
      asgn,
      hiddenAsgn,
      courses,
      myExams: matchMyExams(exams, courses),
      rsvpEvents: myEvents.filter((e) => String(e.id).startsWith('rsvp_')),
      labels,
    });
  }, [dataReady, qDataAll, pastTTCache, courses, records, medSessions, asgn, hiddenAsgn, exams, myEvents]);

  useEffect(() => {
    if (!items) return;
    const body = JSON.stringify({ items });
    const h = fnv(body);
    if (h === readLS(HASH_KEY)) return;
    const timer = setTimeout(async () => {
      try {
        const r = await fetch('/api/calendar-feed', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body });
        if (r.status === 404) { setStatus({ enabled: false }); return; } // turned off on another device
        if (!r.ok) return;
        writeLS(HASH_KEY, h);
        const d = await r.json();
        if (d.syncedAt) setStatusRaw((s) => { const next = { ...s, syncedAt: d.syncedAt }; writeLS(STATUS_KEY, next); return next; });
      } catch {}
    }, SYNC_DELAY);
    return () => clearTimeout(timer);
  }, [items, setStatus]);

  return { status, busy, enable, rotate, disable, refresh };
}
