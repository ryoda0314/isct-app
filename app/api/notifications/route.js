import { NextResponse } from 'next/server';
import { getToken, isAuthenticated } from '../../../lib/auth/token-manager.js';
import { getSupabaseAdmin } from '../../../lib/supabase/server.js';

// GET: list notifications for current user
export async function GET() {
  try {
    if (!isAuthenticated()) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }
    const { userid } = await getToken();
    const sb = getSupabaseAdmin();

    const { data, error } = await sb
      .from('notifications')
      .select('*')
      .eq('moodle_user_id', userid)
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) throw error;
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// PATCH: mark notifications as read
export async function PATCH(request) {
  try {
    if (!isAuthenticated()) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }
    const { userid } = await getToken();
    const { id, all } = await request.json();
    const sb = getSupabaseAdmin();

    if (all) {
      const { error } = await sb
        .from('notifications')
        .update({ read: true })
        .eq('moodle_user_id', userid)
        .eq('read', false);
      if (error) throw error;
    } else if (id) {
      const { error } = await sb
        .from('notifications')
        .update({ read: true })
        .eq('id', id)
        .eq('moodle_user_id', userid);
      if (error) throw error;
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
