import { NextResponse } from 'next/server';
import { requireAuth } from '../../../lib/auth/require-auth.js';
import { getSupabaseAdmin } from '../../../lib/supabase/server.js';

// GET: get RSVPs for events
export async function GET(request) {
  try {
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;

    const { searchParams } = new URL(request.url);
    const eventId = searchParams.get('event_id');

    const sb = getSupabaseAdmin();

    if (eventId) {
      // Get RSVP counts + current user's status (他ユーザーのプロフィールは返さない)
      const { data, error } = await sb
        .from('event_rsvps')
        .select('moodle_user_id, status')
        .eq('event_id', eventId);
      if (error) throw error;
      const counts = { going: 0, maybe: 0, not_going: 0 };
      let myStatus = null;
      for (const r of (data || [])) {
        if (counts[r.status] !== undefined) counts[r.status]++;
        if (r.moodle_user_id === auth.userid) myStatus = r.status;
      }
      return NextResponse.json({ counts, myStatus });
    }

    // Get all RSVPs for current user
    const { data, error } = await sb
      .from('event_rsvps')
      .select('event_id, status')
      .eq('moodle_user_id', auth.userid);
    if (error) throw error;

    // Convert to map: { eventId: status }
    const rsvpMap = {};
    (data || []).forEach(r => { rsvpMap[r.event_id] = r.status; });
    return NextResponse.json(rsvpMap);
  } catch (err) {
    console.error('[Events] GET error:', err.message, err.stack);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

// POST: set RSVP for an event
export async function POST(request) {
  try {
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;
    const { userid } = auth;

    const { event_id, status } = await request.json();
    if (!event_id || !status) {
      return NextResponse.json({ error: 'event_id and status required' }, { status: 400 });
    }
    if (!['going', 'maybe', 'not_going'].includes(status)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
    }

    const sb = getSupabaseAdmin();

    const { data, error } = await sb
      .from('event_rsvps')
      .upsert(
        { event_id, moodle_user_id: userid, status },
        { onConflict: 'event_id,moodle_user_id' }
      )
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json(data);
  } catch (err) {
    console.error('[Events] POST error:', err.message, err.stack);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

// DELETE: remove RSVP
export async function DELETE(request) {
  try {
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;
    const { userid } = auth;

    const { event_id } = await request.json();
    if (!event_id) {
      return NextResponse.json({ error: 'event_id required' }, { status: 400 });
    }

    const sb = getSupabaseAdmin();
    const { error } = await sb
      .from('event_rsvps')
      .delete()
      .eq('event_id', event_id)
      .eq('moodle_user_id', userid);

    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[Events] DELETE error:', err.message, err.stack);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
