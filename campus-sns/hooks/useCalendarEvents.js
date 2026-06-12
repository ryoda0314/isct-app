import { useState, useEffect, useCallback } from 'react';
import { isDemoMode } from '../demoMode.js';

// Client shape: { id, title, color, memo, date:Date, end:Date|null }.
const norm = (e) => ({
  id: e.id,
  title: e.title,
  color: e.color,
  memo: e.memo || '',
  date: e.date ? new Date(e.date) : null,
  end: e.end ? new Date(e.end) : null,
});

// RSVP-derived calendar entries use a `rsvp_<id>` id and are NOT persisted here —
// they are regenerated from RSVP state by App. Everything else is a manual event.
const isManual = (id) => !String(id).startsWith('rsvp_');

const toRow = (e) => ({
  title: e.title,
  color: e.color || null,
  memo: e.memo || '',
  start: e.date instanceof Date ? e.date.toISOString() : new Date(e.date).toISOString(),
  end: e.end ? (e.end instanceof Date ? e.end.toISOString() : new Date(e.end).toISOString()) : null,
});

// Personal calendar events, server-persisted via /api/my-events. Demo mode stays
// local. Manual events are optimistic; adds resync afterwards to pick up real ids.
export function useCalendarEvents(enabled = true) {
  const [events, setEventsRaw] = useState([]);
  const [loading, setLoading] = useState(true);

  // Setter exposed for RSVP-mirror manipulation / demo seeding / logout reset.
  const setEvents = useCallback((v) => {
    setEventsRaw((prev) => {
      const next = typeof v === 'function' ? v(prev) : v;
      return (next || []).map(norm);
    });
  }, []);

  const fetchEvents = useCallback(async () => {
    if (isDemoMode()) { setLoading(false); return; }
    try {
      const r = await fetch('/api/my-events');
      if (r.ok) {
        const manual = (await r.json()).map(norm);
        // Keep any RSVP-mirror entries already added locally.
        setEventsRaw((prev) => [...manual, ...prev.filter((e) => !isManual(e.id))]);
      }
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { if (enabled) fetchEvents(); }, [fetchEvents, enabled]);

  const addEvents = useCallback(async (list) => {
    const arr = (list || []).filter((e) => e && e.title && e.date);
    if (arr.length === 0) return;
    // Optimistic insert with temp ids so the calendar updates instantly.
    setEventsRaw((p) => [
      ...p,
      ...arr.map((e, i) => norm({ id: `ev_${Date.now()}_${i}_${Math.random().toString(36).slice(2, 6)}`, ...e })),
    ]);
    if (isDemoMode()) return;
    try {
      const r = await fetch('/api/my-events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ events: arr.map(toRow) }),
      });
      if (r.ok) fetchEvents(); // resync to replace temp ids with real db ids
    } catch {}
  }, [fetchEvents]);

  const addEvent = useCallback((e) => addEvents([e]), [addEvents]);

  const updateEvent = useCallback((id, patch) => {
    setEventsRaw((p) => p.map((e) => (e.id === id ? norm({ ...e, ...patch }) : e)));
    if (isDemoMode() || !isManual(id)) return;
    fetch('/api/my-events', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, ...toRow(patch) }),
    }).catch(() => {});
  }, []);

  const deleteEvent = useCallback((id) => {
    setEventsRaw((p) => p.filter((e) => e.id !== id));
    if (isDemoMode() || !isManual(id)) return;
    fetch('/api/my-events', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    }).catch(() => {});
  }, []);

  return { events, loading, setEvents, addEvent, addEvents, updateEvent, deleteEvent, refetch: fetchEvents };
}
