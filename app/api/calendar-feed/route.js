import { NextResponse } from 'next/server';
import { randomBytes, createHash } from 'crypto';
import { requireAuth } from '../../../lib/auth/require-auth.js';
import { getSupabaseAdmin } from '../../../lib/supabase/server.js';

// Owner-side management of the iCal subscription feed (see supabase/calendar-feed.sql).
// The public feed itself is served by /api/ical/<token>.ics.

const KINDS = new Set(['class', 'asgn', 'exam', 'event']);
const MAX_ITEMS = 3000;

const newToken = () => randomBytes(24).toString('base64url'); // 32 chars

// Built server-side: inside the native app the page origin is capacitor://localhost.
const feedUrl = (request, token) => `${new URL(request.url).origin}/api/ical/${token}.ics`;

const str = (v, max) => (v == null || v === '' ? undefined : String(v).slice(0, max));
const isYmd = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);

// Snapshot item from the client (campus-sns/calendarItems.js buildFeedItems) → stored shape.
function normItem(it) {
  if (!it || !KINDS.has(it.k)) return null;
  const id = str(it.id, 120);
  const t = str(it.t, 200);
  if (!id || !t) return null;
  const out = { k: it.k, id, t };
  if (it.allDay) {
    if (!isYmd(it.s)) return null;
    out.s = it.s;
    if (isYmd(it.e) && it.e > it.s) out.e = it.e;
    out.allDay = true;
  } else {
    const sm = Date.parse(it.s);
    if (!Number.isFinite(sm)) return null;
    out.s = new Date(sm).toISOString();
    const em = it.e ? Date.parse(it.e) : NaN;
    if (Number.isFinite(em) && em > sm) out.e = new Date(em).toISOString();
  }
  const l = str(it.l, 200);
  if (l) out.l = l;
  const d = str(it.d, 500);
  if (d) out.d = d;
  return out;
}

// GET: feed status { enabled, url, syncedAt }
export async function GET(request) {
  try {
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;
    const sb = getSupabaseAdmin();
    const { data, error } = await sb
      .from('calendar_feeds')
      .select('token, synced_at')
      .eq('user_id', auth.userid)
      .maybeSingle();
    if (error) throw error;
    if (!data) return NextResponse.json({ enabled: false });
    return NextResponse.json({ enabled: true, url: feedUrl(request, data.token), syncedAt: data.synced_at });
  } catch (err) {
    console.error('[CalendarFeed] GET error:', err.message);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

// POST: turn the feed on (idempotent) { rotate?: true } — rotate issues a new URL,
// so the old one stops working.
export async function POST(request) {
  try {
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;
    const { rotate } = await request.json().catch(() => ({}));
    const sb = getSupabaseAdmin();

    const { data: existing, error: selErr } = await sb
      .from('calendar_feeds')
      .select('token, synced_at')
      .eq('user_id', auth.userid)
      .maybeSingle();
    if (selErr) throw selErr;
    if (existing && !rotate) {
      return NextResponse.json({ enabled: true, url: feedUrl(request, existing.token), syncedAt: existing.synced_at });
    }

    const token = newToken();
    if (existing) {
      const { error } = await sb.from('calendar_feeds').update({ token }).eq('user_id', auth.userid);
      if (error) throw error;
      return NextResponse.json({ enabled: true, url: feedUrl(request, token), syncedAt: existing.synced_at });
    }

    // Ensure a profile row exists (FK target) — same guard as /api/my-events.
    await sb.from('profiles').upsert(
      { moodle_id: auth.userid, name: auth.fullname || `User ${auth.userid}` },
      { onConflict: 'moodle_id', ignoreDuplicates: false }
    );
    const { error } = await sb.from('calendar_feeds').insert({ user_id: auth.userid, token });
    if (error) throw error;
    return NextResponse.json({ enabled: true, url: feedUrl(request, token), syncedAt: null });
  } catch (err) {
    console.error('[CalendarFeed] POST error:', err.message);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

// PUT: upload the client-built snapshot { items: [...] }. Writes only when the
// content actually changed (disk-IO budget), and never creates a feed.
export async function PUT(request) {
  try {
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;
    const body = await request.json().catch(() => ({}));
    if (!Array.isArray(body.items)) return NextResponse.json({ error: 'items required' }, { status: 400 });

    const seen = new Set();
    const items = [];
    for (const raw of body.items.slice(0, MAX_ITEMS)) {
      const it = normItem(raw);
      if (!it) continue;
      const key = `${it.k}:${it.id}`; // becomes the event UID — must be unique
      if (seen.has(key)) continue;
      seen.add(key);
      items.push(it);
    }
    const hash = createHash('sha256').update(JSON.stringify(items)).digest('hex');

    const sb = getSupabaseAdmin();
    const { data: row, error: selErr } = await sb
      .from('calendar_feeds')
      .select('items_hash')
      .eq('user_id', auth.userid)
      .maybeSingle();
    if (selErr) throw selErr;
    if (!row) return NextResponse.json({ enabled: false }, { status: 404 });
    if (row.items_hash === hash) return NextResponse.json({ ok: true, unchanged: true });

    const syncedAt = new Date().toISOString();
    const { error } = await sb
      .from('calendar_feeds')
      .update({ items, items_hash: hash, synced_at: syncedAt })
      .eq('user_id', auth.userid);
    if (error) throw error;
    return NextResponse.json({ ok: true, count: items.length, syncedAt });
  } catch (err) {
    console.error('[CalendarFeed] PUT error:', err.message);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

// DELETE: turn the feed off — the URL stops working immediately.
export async function DELETE(request) {
  try {
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;
    const sb = getSupabaseAdmin();
    const { error } = await sb.from('calendar_feeds').delete().eq('user_id', auth.userid);
    if (error) throw error;
    return NextResponse.json({ enabled: false });
  } catch (err) {
    console.error('[CalendarFeed] DELETE error:', err.message);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
