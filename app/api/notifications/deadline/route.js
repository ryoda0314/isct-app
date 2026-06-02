import { NextResponse } from 'next/server';
import { requireAuth } from '../../../../lib/auth/require-auth.js';
import { createNotification } from '../../../../lib/notify.js';

// Assignment data lives client-side (Moodle is fetched from the client), so the
// client detects which of its assignments are due soon and POSTs candidates here.
// The server re-validates the remaining time (clients can't fabricate reminders
// for arbitrary times) and dedups per (assignment, threshold) so re-posting on
// every app load / from multiple devices is a no-op.

const THRESHOLDS = {
  '24h': { ms: 24 * 60 * 60 * 1000, label: '24時間以内' },
  '3h': { ms: 3 * 60 * 60 * 1000, label: 'まもなく（3時間以内）' },
};
const MAX_ITEMS = 50;
const MAX_TITLE = 80;

export async function POST(request) {
  try {
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;
    const { userid } = auth;

    const { items } = await request.json();
    if (!Array.isArray(items)) {
      return NextResponse.json({ error: 'items array required' }, { status: 400 });
    }

    const now = Date.now();
    let created = 0;

    for (const it of items.slice(0, MAX_ITEMS)) {
      const { assignmentId, title, courseId, due, threshold } = it || {};
      const th = THRESHOLDS[threshold];
      if (!assignmentId || !title || !th) continue;

      const dueMs = new Date(due).getTime();
      if (!Number.isFinite(dueMs)) continue;

      // Server-side gate: only fire when the deadline is genuinely in the future
      // and within the claimed threshold window.
      const remaining = dueMs - now;
      if (remaining <= 0 || remaining > th.ms) continue;

      const safeTitle = String(title).slice(0, MAX_TITLE);
      const r = await createNotification({
        userId: userid,
        type: 'deadline',
        text: `「${safeTitle}」の提出期限が${th.label}です`,
        courseId: courseId || null,
        dedupKey: `deadline:${assignmentId}:${threshold}`,
        pushTitle: '課題の締切',
      });
      if (r.created) created++;
    }

    return NextResponse.json({ created });
  } catch (err) {
    console.error('[Deadline notify] POST error:', err.message, err.stack);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
