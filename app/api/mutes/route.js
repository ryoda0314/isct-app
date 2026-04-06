import { NextResponse } from 'next/server';
import { requireAuth } from '../../../lib/auth/require-auth.js';
import { getSupabaseAdmin } from '../../../lib/supabase/server.js';
import { invalidateMuteCache } from '../../../lib/mutes.js';

// GET: list muted users
export async function GET(request) {
  try {
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;
    const sb = getSupabaseAdmin();
    const { data, error } = await sb
      .from('user_mutes')
      .select('muted_id, created_at')
      .eq('muter_id', auth.userid)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return NextResponse.json(data || []);
  } catch (err) {
    console.error('[Mutes] GET error:', err.message, err.stack);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

// POST: mute a user
export async function POST(request) {
  try {
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;
    const { muted_id } = await request.json();
    if (!muted_id || muted_id === auth.userid) {
      return NextResponse.json({ error: 'Invalid user' }, { status: 400 });
    }
    const sb = getSupabaseAdmin();
    const { error } = await sb
      .from('user_mutes')
      .upsert({ muter_id: auth.userid, muted_id }, { onConflict: 'muter_id,muted_id' });
    if (error) throw error;
    invalidateMuteCache(auth.userid);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[Mutes] POST error:', err.message, err.stack);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

// DELETE: unmute a user
export async function DELETE(request) {
  try {
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;
    const { muted_id } = await request.json();
    if (!muted_id) {
      return NextResponse.json({ error: 'Missing muted_id' }, { status: 400 });
    }
    const sb = getSupabaseAdmin();
    await sb.from('user_mutes').delete()
      .eq('muter_id', auth.userid)
      .eq('muted_id', muted_id);
    invalidateMuteCache(auth.userid);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[Mutes] DELETE error:', err.message, err.stack);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
