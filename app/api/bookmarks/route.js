import { NextResponse } from 'next/server';
import { requireAuth } from '../../../lib/auth/require-auth.js';
import { getSupabaseAdmin } from '../../../lib/supabase/server.js';

export async function GET(request) {
  try {
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;
    const { userid } = auth;

    const sb = getSupabaseAdmin();
    const { data, error } = await sb
      .from('bookmarks')
      .select('post_id')
      .eq('moodle_user_id', userid)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[Bookmarks GET]', error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json(data.map(b => b.post_id));
  } catch (err) {
    console.error('[Bookmarks GET]', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;
    const { userid } = auth;

    const { post_id } = await request.json();
    if (!post_id) return NextResponse.json({ error: 'post_id required' }, { status: 400 });

    const sb = getSupabaseAdmin();
    const { error } = await sb
      .from('bookmarks')
      .upsert(
        { moodle_user_id: userid, post_id },
        { onConflict: 'moodle_user_id,post_id', ignoreDuplicates: true }
      );

    if (error) {
      console.error('[Bookmarks POST]', error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[Bookmarks POST]', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(request) {
  try {
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;
    const { userid } = auth;

    const { post_id } = await request.json();
    if (!post_id) return NextResponse.json({ error: 'post_id required' }, { status: 400 });

    const sb = getSupabaseAdmin();
    const { error } = await sb
      .from('bookmarks')
      .delete()
      .eq('moodle_user_id', userid)
      .eq('post_id', post_id);

    if (error) {
      console.error('[Bookmarks DELETE]', error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[Bookmarks DELETE]', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
