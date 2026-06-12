import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '../../../../lib/supabase/server.js';
import { notifyDeadline, THRESHOLDS } from '../../../../lib/deadline-notify.js';

// Server-side deadline reminder cron. Triggered by Supabase pg_cron (see
// supabase/deadline-cron.sql) every ~30 min with `Authorization: Bearer <CRON_SECRET>`.
//
// It reads ONLY the assignment_deadlines cache (populated by the client via
// /api/data/all-meta) — never the LMS, which 403s server-side. This is what lets
// reminders fire while the app is closed. notifyDeadline dedups on the same key
// the client path uses, so running this frequently is safe (repeat = no-op).

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function authorized(request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return request.headers.get('authorization') === `Bearer ${secret}`;
}

export async function GET(request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const sb = getSupabaseAdmin();
    const now = Date.now();
    const nowIso = new Date(now).toISOString();
    const windowIso = new Date(now + THRESHOLDS['24h'].ms).toISOString();

    // Only deadlines inside the widest threshold window are candidates.
    const { data: rows, error } = await sb
      .from('assignment_deadlines')
      .select('moodle_user_id, assignment_id, title, course_id, due_at')
      .gt('due_at', nowIso)
      .lte('due_at', windowIso);
    if (error) {
      console.error('[DeadlineCron] select error:', error.message);
      return NextResponse.json({ error: 'select failed' }, { status: 500 });
    }

    let created = 0;
    for (const r of rows || []) {
      const res = await notifyDeadline({
        userId: r.moodle_user_id,
        assignmentId: r.assignment_id,
        title: r.title,
        courseId: r.course_id,
        dueMs: new Date(r.due_at).getTime(),
      });
      if (res.created) created++;
    }

    // My Tasks live server-side (user_tasks), so the cron can remind on them
    // directly — no client-side deadline cache needed. Same dedup namespace as
    // the client path (task_<id>) so app-open + cron never double-fire.
    const { data: taskRows, error: taskErr } = await sb
      .from('user_tasks')
      .select('id, user_id, title, due_at')
      .eq('done', false)
      .gt('due_at', nowIso)
      .lte('due_at', windowIso);
    if (taskErr) console.error('[DeadlineCron] task select error:', taskErr.message);
    for (const r of taskRows || []) {
      const res = await notifyDeadline({
        userId: r.user_id,
        assignmentId: `task_${r.id}`,
        title: r.title,
        courseId: null,
        dueMs: new Date(r.due_at).getTime(),
        kind: 'task',
      });
      if (res.created) created++;
    }

    // Cleanup past-due cache rows (assignment cache only; user_tasks is user data).
    const { error: delErr } = await sb
      .from('assignment_deadlines')
      .delete()
      .lt('due_at', nowIso);
    if (delErr) console.error('[DeadlineCron] cleanup error:', delErr.message);

    return NextResponse.json({ scanned: (rows?.length || 0) + (taskRows?.length || 0), created });
  } catch (err) {
    console.error('[DeadlineCron] error:', err.message, err.stack);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
