import { NextResponse } from 'next/server';
import { requireAuth } from '../../../../lib/auth/require-auth.js';
import { getSupabaseAdmin } from '../../../../lib/supabase/server.js';

// GET: 現在のユーザーがミュート中のコース一覧（course_id の配列）
export async function GET(request) {
  try {
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;
    const { userid } = auth;

    const sb = getSupabaseAdmin();
    const { data, error } = await sb
      .from('course_notif_mutes')
      .select('course_id')
      .eq('moodle_user_id', userid);
    if (error) throw error;

    return NextResponse.json({ muted: (data || []).map(r => r.course_id) });
  } catch (err) {
    console.error('[CourseMute] GET error:', err.message);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

// POST: { course_id, muted } でトグル。muted=true でミュート追加、false で解除。
export async function POST(request) {
  try {
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;
    const { userid } = auth;

    const { course_id, muted } = await request.json();
    if (!course_id || typeof course_id !== 'string') {
      return NextResponse.json({ error: 'course_id required' }, { status: 400 });
    }

    const sb = getSupabaseAdmin();
    if (muted) {
      const { error } = await sb
        .from('course_notif_mutes')
        .upsert({ moodle_user_id: userid, course_id },
                { onConflict: 'moodle_user_id,course_id', ignoreDuplicates: true });
      if (error) throw error;
    } else {
      const { error } = await sb
        .from('course_notif_mutes')
        .delete()
        .eq('moodle_user_id', userid)
        .eq('course_id', course_id);
      if (error) throw error;
    }

    return NextResponse.json({ ok: true, muted: !!muted });
  } catch (err) {
    console.error('[CourseMute] POST error:', err.message);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
