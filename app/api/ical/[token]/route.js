import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '../../../../lib/supabase/server.js';
import { buildICalendar } from '../../../../lib/ical.js';
import { feedItemToEvent, personalRowToEvent } from '../../../../lib/ical-items.js';

// Public iCal subscription feed: /api/ical/<token>.ics
// Calendar apps (Google Calendar, Apple Calendar, Outlook) fetch this without
// cookies, so the secret token in the URL is the only credential.
// Content = the client-uploaded snapshot (classes / deadlines / exams / RSVP'd
// events) + the user's personal events read live from user_events.

const DAY = 86400000;
const PERSONAL_LOOKBACK_DAYS = 180;

const notFound = () => new NextResponse('Not found', { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });

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

    // 項目 → 予定の変換は lib/ical-items.js（端末での .ics 書き出しと共用）
    const events = [...(feed.items || []).map(feedItemToEvent), ...(personal || []).map(personalRowToEvent)];

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
