import { NextResponse } from 'next/server';
import { requireAuth } from '../../../../lib/auth/require-auth.js';
import { getSupabaseAdmin } from '../../../../lib/supabase/server.js';

// POST: register/refresh a native push device token (APNs / iOS)
export async function POST(request) {
  try {
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;
    const { userid } = auth;
    const { token, platform } = await request.json();

    if (!token) {
      return NextResponse.json({ error: 'Missing token' }, { status: 400 });
    }

    const sb = getSupabaseAdmin();
    const { error } = await sb
      .from('device_push_tokens')
      .upsert(
        { moodle_id: userid, token, platform: platform || 'ios', updated_at: new Date().toISOString() },
        { onConflict: 'token' }
      );
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[PushDevice] POST error:', err.message, err.stack);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

// DELETE: unregister a device token (logout / notifications disabled)
export async function DELETE(request) {
  try {
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;
    const { userid } = auth;
    const { token } = await request.json();

    if (!token) {
      return NextResponse.json({ error: 'Missing token' }, { status: 400 });
    }

    const sb = getSupabaseAdmin();
    await sb.from('device_push_tokens').delete()
      .eq('moodle_id', userid)
      .eq('token', token);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[PushDevice] DELETE error:', err.message, err.stack);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
