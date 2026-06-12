import { NextResponse } from 'next/server';
import { requireAuth } from '../../../lib/auth/require-auth.js';
import { getSupabaseAdmin } from '../../../lib/supabase/server.js';

const MAX_TITLE = 200;

// DB row -> client shape used by AsgnView ({ id, t:title, d:done, due }).
const toClient = (r) => ({ id: r.id, t: r.title, d: r.done, due: r.due_at });

// GET: list my tasks (oldest first, matches add order)
export async function GET(request) {
  try {
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;
    const sb = getSupabaseAdmin();
    const { data, error } = await sb
      .from('user_tasks')
      .select('id, title, done, due_at, created_at')
      .eq('user_id', auth.userid)
      .order('created_at', { ascending: true });
    if (error) throw error;
    return NextResponse.json((data || []).map(toClient));
  } catch (err) {
    console.error('[Tasks] GET error:', err.message, err.stack);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

// POST: create a task { title, due? }
export async function POST(request) {
  try {
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;
    const { title, due } = await request.json();
    const t = String(title || '').trim();
    if (!t) return NextResponse.json({ error: 'title required' }, { status: 400 });

    let due_at = null;
    if (due) {
      const ms = new Date(due).getTime();
      if (Number.isFinite(ms)) due_at = new Date(ms).toISOString();
    }

    const sb = getSupabaseAdmin();
    // Ensure a profile row exists (FK target) — same guard as /api/messages.
    await sb.from('profiles').upsert(
      { moodle_id: auth.userid, name: auth.fullname || `User ${auth.userid}` },
      { onConflict: 'moodle_id', ignoreDuplicates: false }
    );

    const { data, error } = await sb
      .from('user_tasks')
      .insert({ user_id: auth.userid, title: t.slice(0, MAX_TITLE), due_at })
      .select('id, title, done, due_at')
      .single();
    if (error) throw error;
    return NextResponse.json(toClient(data));
  } catch (err) {
    console.error('[Tasks] POST error:', err.message, err.stack);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

// PATCH: update a task { id, done?, title?, due? }
export async function PATCH(request) {
  try {
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;
    const { id, done, title, due } = await request.json();
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

    const patch = { updated_at: new Date().toISOString() };
    if (typeof done === 'boolean') patch.done = done;
    if (title !== undefined) {
      const t = String(title || '').trim();
      if (!t) return NextResponse.json({ error: 'title cannot be empty' }, { status: 400 });
      patch.title = t.slice(0, MAX_TITLE);
    }
    if (due !== undefined) {
      let due_at = null;
      if (due) { const ms = new Date(due).getTime(); if (Number.isFinite(ms)) due_at = new Date(ms).toISOString(); }
      patch.due_at = due_at;
    }

    const sb = getSupabaseAdmin();
    const { data, error } = await sb
      .from('user_tasks')
      .update(patch)
      .eq('id', id)
      .eq('user_id', auth.userid)
      .select('id, title, done, due_at')
      .single();
    if (error) throw error;
    if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json(toClient(data));
  } catch (err) {
    console.error('[Tasks] PATCH error:', err.message, err.stack);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

// DELETE: remove a task { id }
export async function DELETE(request) {
  try {
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;
    const { id } = await request.json();
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
    const sb = getSupabaseAdmin();
    const { error } = await sb
      .from('user_tasks')
      .delete()
      .eq('id', id)
      .eq('user_id', auth.userid);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[Tasks] DELETE error:', err.message, err.stack);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
