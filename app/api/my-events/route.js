import { NextResponse } from 'next/server';
import { requireAuth } from '../../../lib/auth/require-auth.js';
import { getSupabaseAdmin } from '../../../lib/supabase/server.js';

// NOTE: /api/events is the campus-event RSVP endpoint. Personal calendar events
// live here (/api/my-events) in the user_events table.

const MAX_TITLE = 200;
const MAX_BATCH = 60; // covers weekly-repeat (12) with margin

// DB row -> client shape used by CalendarView ({ id, title, color, memo, date, end }).
const toClient = (r) => ({ id: r.id, title: r.title, color: r.color, memo: r.memo || '', date: r.start_at, end: r.end_at });

const toRow = (e, userId) => {
  const startMs = new Date(e.start).getTime();
  if (!e.title || !String(e.title).trim() || !Number.isFinite(startMs)) return null;
  let end_at = null;
  if (e.end) { const ms = new Date(e.end).getTime(); if (Number.isFinite(ms)) end_at = new Date(ms).toISOString(); }
  return {
    user_id: userId,
    title: String(e.title).trim().slice(0, MAX_TITLE),
    color: e.color || null,
    memo: e.memo ? String(e.memo).slice(0, 1000) : null,
    start_at: new Date(startMs).toISOString(),
    end_at,
  };
};

// GET: list my calendar events
export async function GET(request) {
  try {
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;
    const sb = getSupabaseAdmin();
    const { data, error } = await sb
      .from('user_events')
      .select('id, title, color, memo, start_at, end_at')
      .eq('user_id', auth.userid)
      .order('start_at', { ascending: true });
    if (error) throw error;
    return NextResponse.json((data || []).map(toClient));
  } catch (err) {
    console.error('[MyEvents] GET error:', err.message, err.stack);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

// POST: create one or more events { events: [{ title, color, memo, start, end }] }
export async function POST(request) {
  try {
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;
    const body = await request.json();
    const list = Array.isArray(body.events) ? body.events : [body];
    const rows = list.slice(0, MAX_BATCH).map((e) => toRow(e, auth.userid)).filter(Boolean);
    if (rows.length === 0) return NextResponse.json({ error: 'no valid events' }, { status: 400 });

    const sb = getSupabaseAdmin();
    // Ensure a profile row exists (FK target) — same guard as /api/messages.
    await sb.from('profiles').upsert(
      { moodle_id: auth.userid, name: auth.fullname || `User ${auth.userid}` },
      { onConflict: 'moodle_id', ignoreDuplicates: false }
    );

    const { data, error } = await sb
      .from('user_events')
      .insert(rows)
      .select('id, title, color, memo, start_at, end_at');
    if (error) throw error;
    return NextResponse.json((data || []).map(toClient));
  } catch (err) {
    console.error('[MyEvents] POST error:', err.message, err.stack);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

// PATCH: update an event { id, title?, color?, memo?, start?, end? }
export async function PATCH(request) {
  try {
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;
    const { id, title, color, memo, start, end } = await request.json();
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

    const patch = { updated_at: new Date().toISOString() };
    if (title !== undefined) {
      const tt = String(title || '').trim();
      if (!tt) return NextResponse.json({ error: 'title cannot be empty' }, { status: 400 });
      patch.title = tt.slice(0, MAX_TITLE);
    }
    if (color !== undefined) patch.color = color || null;
    if (memo !== undefined) patch.memo = memo ? String(memo).slice(0, 1000) : null;
    if (start !== undefined) {
      const ms = new Date(start).getTime();
      if (!Number.isFinite(ms)) return NextResponse.json({ error: 'invalid start' }, { status: 400 });
      patch.start_at = new Date(ms).toISOString();
    }
    if (end !== undefined) {
      let end_at = null;
      if (end) { const ms = new Date(end).getTime(); if (Number.isFinite(ms)) end_at = new Date(ms).toISOString(); }
      patch.end_at = end_at;
    }

    const sb = getSupabaseAdmin();
    const { data, error } = await sb
      .from('user_events')
      .update(patch)
      .eq('id', id)
      .eq('user_id', auth.userid)
      .select('id, title, color, memo, start_at, end_at')
      .single();
    if (error) throw error;
    if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json(toClient(data));
  } catch (err) {
    console.error('[MyEvents] PATCH error:', err.message, err.stack);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

// DELETE: remove an event { id }
export async function DELETE(request) {
  try {
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;
    const { id } = await request.json();
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
    const sb = getSupabaseAdmin();
    const { error } = await sb
      .from('user_events')
      .delete()
      .eq('id', id)
      .eq('user_id', auth.userid);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[MyEvents] DELETE error:', err.message, err.stack);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
