import { NextResponse } from 'next/server';
import { requireAuth } from '../../../../lib/auth/require-auth.js';
import { getSupabaseAdmin } from '../../../../lib/supabase/server.js';

export async function GET(request) {
  try {
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;
    const { userid } = auth;
    const sb = getSupabaseAdmin();

    const { data: ownerCircles } = await sb.from('circles').select('id').eq('owner_id', userid);
    const { data: memberships } = await sb.from('circle_members').select('circle_id').eq('user_id', userid);
    const joined = new Set([
      ...(ownerCircles || []).map(c => c.id),
      ...(memberships || []).map(m => m.circle_id),
    ]);

    const { data: circles, error } = await sb
      .from('circles')
      .select('id, name, icon, color, banner, description, tags, join_mode')
      .eq('is_public', true)
      .order('created_at', { ascending: false })
      .limit(100);
    if (error) throw error;

    const filtered = (circles || []).filter(c => !joined.has(c.id));
    const ids = filtered.map(c => c.id);

    let memberCounts = {};
    if (ids.length > 0) {
      const { data: mems } = await sb.from('circle_members').select('circle_id').in('circle_id', ids);
      (mems || []).forEach(m => {
        memberCounts[m.circle_id] = (memberCounts[m.circle_id] || 0) + 1;
      });
    }

    const result = filtered.map(c => ({
      id: c.id,
      name: c.name,
      icon: c.icon || c.name?.[0] || '?',
      color: c.color || '#6375f0',
      banner: c.banner || null,
      desc: c.description || '',
      tags: c.tags || [],
      joinMode: c.join_mode || 'open',
      memberCount: (memberCounts[c.id] || 0) + 1,
    }));

    return NextResponse.json(result);
  } catch (err) {
    console.error('[Circles/Discover] GET error:', err.message, err.stack);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
