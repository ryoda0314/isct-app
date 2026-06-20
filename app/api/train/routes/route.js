import { NextResponse } from 'next/server';
import { requireAuth } from '../../../../lib/auth/require-auth.js';
import { getSupabaseAdmin } from '../../../../lib/supabase/server.js';

// ユーザーの登録電車ルート CRUD（出欠ルートと同型）。

const COLS = 'id, railway, station, direction, train_type, label, sort_order';

export async function GET(request) {
  try {
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;
    const sb = getSupabaseAdmin();
    const { data, error } = await sb
      .from('user_train_routes')
      .select(COLS)
      .eq('moodle_user_id', auth.userid)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true });
    if (error) {
      console.error('[Train routes GET]', error.message);
      return NextResponse.json({ error: 'Internal error' }, { status: 500 });
    }
    return NextResponse.json(data || []);
  } catch (err) {
    console.error('[Train routes GET]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;

    const { railway, station, direction, train_type, label, sort_order } = await request.json();
    if (!railway || !station || !direction) {
      return NextResponse.json({ error: 'invalid params' }, { status: 400 });
    }

    const sb = getSupabaseAdmin();
    const { data, error } = await sb
      .from('user_train_routes')
      .upsert(
        {
          moodle_user_id: auth.userid,
          railway: String(railway),
          station: String(station),
          direction: String(direction),
          train_type: train_type ? String(train_type) : null,
          label: label ? String(label) : null,
          sort_order: Number.isFinite(sort_order) ? sort_order : 0,
        },
        { onConflict: 'moodle_user_id,railway,station,direction' }
      )
      .select(COLS)
      .single();

    if (error) {
      console.error('[Train routes POST]', error.message);
      return NextResponse.json({ error: 'Internal error' }, { status: 500 });
    }
    return NextResponse.json(data);
  } catch (err) {
    console.error('[Train routes POST]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

export async function DELETE(request) {
  try {
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;

    const { id } = await request.json();
    if (!id) return NextResponse.json({ error: 'invalid params' }, { status: 400 });

    const sb = getSupabaseAdmin();
    const { error } = await sb
      .from('user_train_routes')
      .delete()
      .eq('moodle_user_id', auth.userid)
      .eq('id', id);

    if (error) {
      console.error('[Train routes DELETE]', error.message);
      return NextResponse.json({ error: 'Internal error' }, { status: 500 });
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[Train routes DELETE]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
