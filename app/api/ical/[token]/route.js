import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '../../../../lib/supabase/server.js';
import { buildICalendar } from '../../../../lib/ical.js';

// Public iCal subscription feed: /api/ical/<token>.ics
// Calendar apps (Google Calendar, Apple Calendar, Outlook) fetch this without
// cookies, so the secret token in the URL is the only credential.
// Content = the client-uploaded snapshot (classes / deadlines / exams / RSVP'd
// events) + the user's personal events read live from user_events.

const DAY = 86400000;
const JST = 9 * 3600000;
const PERSONAL_LOOKBACK_DAYS = 180;

const notFound = () => new NextResponse('Not found', { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });

const kindLabel = { class: 'class', asgn: 'deadline', exam: 'exam', event: 'event' };

export async function GET(request, { params }) {
  try {
    const { token: raw } = await params;
    const token = String(raw || '').replace(/\.ics$/i, '');
    if (!/^[A-Za-z0-9_-]{32}$/.test(token)) return notFound();

    const sb = getSupabaseAdmin();
    const { data: feed, error } = await sb
      .from('calendar_feeds')
      .select('user_id, items')
      .eq('token', token)
      .maybeSingle();
    if (error) throw error;
    if (!feed) return notFound();

    const since = new Date(Date.now() - PERSONAL_LOOKBACK_DAYS * DAY).toISOString();
    const { data: personal, error: evErr } = await sb
      .from('user_events')
      .select('id, title, memo, start_at, end_at')
      .eq('user_id', feed.user_id)
      .gte('start_at', since)
      .order('start_at', { ascending: true })
      .limit(2000);
    if (evErr) throw evErr;

    const events = [];
    for (const it of feed.items || []) {
      const ev = { uid: `${kindLabel[it.k] || it.k}-${it.id}`, summary: it.t, location: it.l, description: it.d };
      if (it.allDay) Object.assign(ev, { allDay: true, start: it.s, end: it.e });
      else Object.assign(ev, { start: new Date(it.s), end: it.e ? new Date(it.e) : undefined });
      if (it.k === 'asgn') ev.free = true; // a deadline is a point in time, not busy time
      events.push(ev);
    }
    for (const r of personal || []) {
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
      events.push(ev);
    }

    const body = buildICalendar({ name: 'ScienceTokyo App', events });
    return new NextResponse(body, {
      headers: {
        'Content-Type': 'text/calendar; charset=utf-8',
        'Content-Disposition': 'inline; filename="sciencetokyo.ics"',
      },
    });
  } catch (err) {
    console.error('[iCal] GET error:', err.message);
    return new NextResponse('Internal error', { status: 500, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  }
}
