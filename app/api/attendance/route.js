import { NextResponse } from 'next/server';
import { requireAuth } from '../../../lib/auth/require-auth.js';
import { getSupabaseAdmin } from '../../../lib/supabase/server.js';

const KINDS = new Set(['sci', 'med']);
const STATUSES = new Set(['present', 'absent', 'late', 'cancelled']);

// GET: ユーザーの全出欠記録を { [kind]: { [course_key]: { [session_key]: status } } } で返す
export async function GET(request) {
  try {
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;
    const { userid } = auth;

    const sb = getSupabaseAdmin();
    const { data, error } = await sb
      .from('attendance_records')
      .select('kind, course_key, session_key, status')
      .eq('moodle_user_id', userid);

    if (error) {
      console.error('[Attendance GET]', error.message);
      return NextResponse.json({ error: 'Internal error' }, { status: 500 });
    }

    const out = {};
    for (const r of data) {
      (out[r.kind] ??= {});
      (out[r.kind][r.course_key] ??= {});
      out[r.kind][r.course_key][r.session_key] = r.status;
    }
    return NextResponse.json(out);
  } catch (err) {
    console.error('[Attendance GET]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

// POST: 1セッションの状態を upsert
export async function POST(request) {
  try {
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;
    const { userid } = auth;

    const { kind, course_key, session_key, session_date, status } = await request.json();
    if (!KINDS.has(kind) || !course_key || !session_key || !STATUSES.has(status)) {
      return NextResponse.json({ error: 'invalid params' }, { status: 400 });
    }

    const sb = getSupabaseAdmin();
    const { error } = await sb
      .from('attendance_records')
      .upsert(
        {
          moodle_user_id: userid,
          kind,
          course_key: String(course_key),
          session_key: String(session_key),
          session_date: session_date || null,
          status,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'moodle_user_id,kind,course_key,session_key' }
      );

    if (error) {
      console.error('[Attendance POST]', error.message);
      return NextResponse.json({ error: 'Internal error' }, { status: 500 });
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[Attendance POST]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

// DELETE: 1セッションの記録を削除（=未記録に戻す）
export async function DELETE(request) {
  try {
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;
    const { userid } = auth;

    const { kind, course_key, session_key } = await request.json();
    if (!KINDS.has(kind) || !course_key || !session_key) {
      return NextResponse.json({ error: 'invalid params' }, { status: 400 });
    }

    const sb = getSupabaseAdmin();
    const { error } = await sb
      .from('attendance_records')
      .delete()
      .eq('moodle_user_id', userid)
      .eq('kind', kind)
      .eq('course_key', String(course_key))
      .eq('session_key', String(session_key));

    if (error) {
      console.error('[Attendance DELETE]', error.message);
      return NextResponse.json({ error: 'Internal error' }, { status: 500 });
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[Attendance DELETE]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
