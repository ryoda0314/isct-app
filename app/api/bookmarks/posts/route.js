import { NextResponse } from 'next/server';
import { requireAuth } from '../../../../lib/auth/require-auth.js';
import { getSupabaseAdmin } from '../../../../lib/supabase/server.js';

// Fetch multiple posts by IDs (for bookmark view)
export async function POST(request) {
  try {
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;

    const { post_ids } = await request.json();
    if (!Array.isArray(post_ids) || !post_ids.length) {
      return NextResponse.json([]);
    }

    const sb = getSupabaseAdmin();
    const { data, error } = await sb
      .from('posts')
      .select('*, profiles(name, avatar, color)')
      .in('id', post_ids.slice(0, 50))
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[Bookmarks/posts]', error.message);
      return NextResponse.json({ error: 'Internal error' }, { status: 500 });
    }
    return NextResponse.json(data);
  } catch (err) {
    console.error('[Bookmarks/posts]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
