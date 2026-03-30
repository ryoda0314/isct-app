import { NextResponse } from 'next/server';
import { requireAuth } from '../../../../lib/auth/require-auth.js';
import { getSupabaseAdmin } from '../../../../lib/supabase/server.js';
import { isEnrolledInCourse } from '../../../../lib/auth/course-enrollment.js';

const toMoodleId = (id) => id?.startsWith('mc_') ? id.slice(3) : id;

// Fetch multiple posts by IDs (for bookmark view)
export async function POST(request) {
  try {
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;
    const { wstoken, userid } = auth;

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

    // ユーザーが所属するコースの投稿のみ返す
    const filtered = [];
    for (const post of data) {
      try {
        if (await isEnrolledInCourse(wstoken, userid, toMoodleId(post.course_id))) {
          filtered.push(post);
        }
      } catch {}
    }
    return NextResponse.json(filtered);
  } catch (err) {
    console.error('[Bookmarks/posts]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
