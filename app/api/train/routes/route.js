import { NextResponse } from 'next/server';
import { requireAuth } from '../../../../lib/auth/require-auth.js';
import { getSupabaseAdmin } from '../../../../lib/supabase/server.js';

// ユーザーの登録電車ルート CRUD（出欠ルートと同型）。

const COLS = 'id, origin_station, dest_station, label, sort_order, on_home, type_filter';

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

// ルート設定の更新（{ id, on_home?, type_filter? }）。
// type_filter: 表示する種別IDの配列。null/空 = 全種別表示（絞り込み無し）。
export async function PATCH(request) {
  try {
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;

    const body = await request.json();
    const { id } = body;
    if (!id) return NextResponse.json({ error: 'invalid params' }, { status: 400 });

    const patch = {};
    if (typeof body.on_home === 'boolean') patch.on_home = body.on_home;
    if ('type_filter' in body) {
      const tf = body.type_filter;
      patch.type_filter = Array.isArray(tf) && tf.length ? tf.map(String) : null;
    }
    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: 'invalid params' }, { status: 400 });
    }

    const sb = getSupabaseAdmin();
    const { error } = await sb
      .from('user_train_routes')
      .update(patch)
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
