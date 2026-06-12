import { NextResponse } from 'next/server';
import { requireAuth } from '../../../../lib/auth/require-auth.js';
import { getSupabaseAdmin } from '../../../../lib/supabase/server.js';

// Resolve a batch of moodle_ids to minimal public profile info (name/avatar/color).
// Used e.g. for poll voter lists where only user ids are stored.
export async function GET(request) {
  try {
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;

    const { searchParams } = new URL(request.url);
    const idsParam = searchParams.get('ids');
    if (!idsParam) return NextResponse.json({});

    const ids = [...new Set(
      idsParam.split(',').map(s => Number(s.trim())).filter(Number.isFinite)
    )].slice(0, 300);
    if (ids.length === 0) return NextResponse.json({});

    const sb = getSupabaseAdmin();
    const { data, error } = await sb
      .from('profiles')
      .select('moodle_id, name, avatar, color')
      .in('moodle_id', ids);

    if (error) {
      console.error('[Profiles GET]', error.message);
      return NextResponse.json({ error: 'Internal error' }, { status: 500 });
    }

    const map = {};
    (data || []).forEach(p => { map[p.moodle_id] = { name: p.name, av: p.avatar, col: p.color }; });
    return NextResponse.json(map);
  } catch (err) {
    console.error('[Profiles GET]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
