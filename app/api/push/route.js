import { NextResponse } from 'next/server';
import { requireAuth } from '../../../lib/auth/require-auth.js';
import { getSupabaseAdmin } from '../../../lib/supabase/server.js';

// POST: register push subscription
export async function POST(request) {
  try {
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;
    const { userid } = auth;
    const { endpoint, keys } = await request.json();

    if (!endpoint || !keys?.p256dh || !keys?.auth) {
      return NextResponse.json({ error: 'Invalid subscription' }, { status: 400 });
    }

    const sb = getSupabaseAdmin();
    const { error } = await sb
      .from('push_subscriptions')
      .upsert(
        { moodle_id: userid, endpoint, p256dh: keys.p256dh, auth: keys.auth },
        { onConflict: 'endpoint' }
      );
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[Push] POST error:', err.message, err.stack);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

// DELETE: unregister push subscription
export async function DELETE(request) {
  try {
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;
    const { userid } = auth;
    const { endpoint } = await request.json();

    if (!endpoint) {
      return NextResponse.json({ error: 'Missing endpoint' }, { status: 400 });
    }

    const sb = getSupabaseAdmin();
    await sb.from('push_subscriptions').delete()
      .eq('moodle_id', userid)
      .eq('endpoint', endpoint);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[Push] DELETE error:', err.message, err.stack);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
