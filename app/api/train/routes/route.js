import { NextResponse } from 'next/server';
import { requireAuth } from '../../../../lib/auth/require-auth.js';
import { getSupabaseAdmin } from '../../../../lib/supabase/server.js';

// ユーザーの登録電車ルート CRUD（出欠ルートと同型）。

const COLS = 'id, origin_station, dest_station, label, sort_order, on_home';

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

    const { origin_station, dest_station, label, sort_order } = await request.json();
    if (!origin_station || !dest_station) {
      return NextResponse.json({ error: 'invalid params' }, { status: 400 });
    }

    const sb = getSupabaseAdmin();
    const { data, error } = await sb
      .from('user_train_routes')
      .upsert(
        {
          moodle_user_id: auth.userid,
          origin_station: String(origin_station),
          dest_station: String(dest_station),
          label: label ? String(label) : null,
          sort_order: Number.isFinite(sort_order) ? sort_order : 0,
        },
        { onConflict: 'moodle_user_id,origin_station,dest_station' }
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

// ホーム表示フラグの切替（{ id, on_home }）
export async function PATCH(request) {
  try {
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;

    const { id, on_home } = await request.json();
    if (!id || typeof on_home !== 'boolean') {
      return NextResponse.json({ error: 'invalid params' }, { status: 400 });
    }

    const sb = getSupabaseAdmin();
    const { error } = await sb
      .from('user_train_routes')
      .update({ on_home })
      .eq('moodle_user_id', auth.userid)
      .eq('id', id);

    if (error) {
      console.error('[Train routes PATCH]', error.message);
      return NextResponse.json({ error: 'Internal error' }, { status: 500 });
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[Train routes PATCH]', err);
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
