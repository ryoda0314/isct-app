import { NextResponse } from 'next/server';
import { requireAuth } from '../../../../lib/auth/require-auth.js';
import { notifyDeadline } from '../../../../lib/deadline-notify.js';

// Assignment data lives client-side (Moodle is fetched from the client), so the
// client detects which of its assignments are due soon and POSTs candidates here.
// notifyDeadline re-derives the threshold from the real due date (clients can't
// fabricate reminders for arbitrary times) and dedups per (assignment, threshold)
// so re-posting on every app load / from multiple devices is a no-op. The same
// helper backs the server cron (/api/cron/deadline-reminders), so the two paths
// share dedup keys and never double-fire.

const MAX_ITEMS = 50;

export async function POST(request) {
  try {
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;
    const { userid } = auth;

    const { items } = await request.json();
    if (!Array.isArray(items)) {
      return NextResponse.json({ error: 'items array required' }, { status: 400 });
    }

    let created = 0;
    for (const it of items.slice(0, MAX_ITEMS)) {
      const { assignmentId, title, courseId, due } = it || {};
      const dueMs = new Date(due).getTime();
      if (!Number.isFinite(dueMs)) continue;
      const r = await notifyDeadline({ userId: userid, assignmentId, title, courseId, dueMs });
      if (r.created) created++;
    }

    return NextResponse.json({ created });
  } catch (err) {
    console.error('[Deadline notify] POST error:', err.message, err.stack);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
