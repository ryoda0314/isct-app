import { NextResponse } from 'next/server';
import { requireAuth } from '../../../lib/auth/require-auth.js';
import { getSupabaseAdmin } from '../../../lib/supabase/server.js';

// GET /api/announcements — アクティブなお知らせ一覧（ユーザー向け）
export async function GET(request) {
  try {
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;

    const sb = getSupabaseAdmin();
    const { data, error } = await sb
      .from('announcements')
      .select('id, title, body, type, created_at, updated_at')
      .eq('active', true)
      .order('created_at', { ascending: false })
      .limit(20);

    if (error) { console.error('[Announcements GET]', error.message); return NextResponse.json({ error: 'Internal error' }, { status: 500 }); }
    return NextResponse.json(data || []);
  } catch (e) {
    console.error('[Announcements GET]', e);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
