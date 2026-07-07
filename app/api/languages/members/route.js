import { NextResponse } from 'next/server';
import { requireAuth } from '../../../../lib/auth/require-auth.js';
import { getSupabaseAdmin } from '../../../../lib/supabase/server.js';
import { isLangCode } from '../../../../campus-sns/languages.js';

// GET /api/languages/members?lang=<code>
// Members of one language community. Requires the requester to be a member.
// → { members: [{ id, name, avatar, color, role, joined_at }], roleMap: { <uid>: role } }
export async function GET(request) {
  try {
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;
    const { userid } = auth;

    const { searchParams } = new URL(request.url);
    const lang = searchParams.get('lang');
    if (!isLangCode(lang)) {
      return NextResponse.json({ error: 'Invalid lang' }, { status: 400 });
    }

    const sb = getSupabaseAdmin();

    // Gate: only members can see the roster.
    const { data: me } = await sb
      .from('language_members')
      .select('user_id')
      .eq('lang_code', lang)
      .eq('user_id', userid)
      .maybeSingle();
    if (!me) {
      return NextResponse.json({ error: 'Not a member of this community' }, { status: 403 });
    }

    const { data, error } = await sb
      .from('language_members')
      .select('user_id, role, joined_at, profiles(name, avatar, color)')
      .eq('lang_code', lang)
      .order('joined_at', { ascending: true });

    if (error) {
      console.error('[Languages members GET]', error.message);
      return NextResponse.json({ error: 'Internal error' }, { status: 500 });
    }

    const members = (data || []).map((r) => ({
      id: r.user_id,
      name: r.profiles?.name || `User ${r.user_id}`,
      avatar: r.profiles?.avatar,
      color: r.profiles?.color,
      role: r.role,
      joined_at: r.joined_at,
    }));
    const roleMap = {};
    for (const m of members) roleMap[m.id] = m.role;

    return NextResponse.json({ members, roleMap });
  } catch (err) {
    console.error('[Languages members GET]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
