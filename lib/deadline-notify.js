import { createNotification } from './notify.js';

// Deadline reminder thresholds, ordered widest → tightest. For a given assignment
// we fire only the *tightest* threshold currently satisfied (and dedup per
// (assignment, threshold) via notifications.dedup_key), so a user gets a "24h"
// reminder once and a "3h" reminder once — never both at the same time.
export const THRESHOLDS = {
  '24h': { ms: 24 * 60 * 60 * 1000, label: '24時間以内' },
  '3h': { ms: 3 * 60 * 60 * 1000, label: 'まもなく（3時間以内）' },
};
const ORDER = ['24h', '3h']; // widest → tightest; last match wins

// 試験は前日（24時間前）と開始 1 時間前。3 時間前だと 1-2 限（8:50）の試験で早朝 5:50 に鳴ってしまう。
// assignment_deadlines に `exam_` で始まる id で入っている行が試験（all-meta が syncAssignmentDeadlines の extra で入れる）。
export const EXAM_THRESHOLDS = {
  '24h': { ms: 24 * 60 * 60 * 1000, label: '24時間以内' },
  '1h': { ms: 60 * 60 * 1000, label: 'まもなく（1時間以内）' },
};
const EXAM_ORDER = ['24h', '1h'];
export const EXAM_ID_PREFIX = 'exam_';

const MAX_TITLE = 80;

/** Tightest threshold key currently crossed (remaining within it), or null. */
export function pickThreshold(remainingMs, table = THRESHOLDS, order = ORDER) {
  if (!(remainingMs > 0)) return null;
  let chosen = null;
  for (const key of order) {
    if (remainingMs <= table[key].ms) chosen = key;
  }
  return chosen;
}

/**
 * Create a deduped deadline notification (+ Web Push) for the tightest threshold
 * the assignment currently satisfies. No-op (created:false) when no threshold is
 * crossed, the deadline has passed, or the notification was already sent.
 *
 * Shared by /api/notifications/deadline (client, app open) and
 * /api/cron/deadline-reminders (server cron, app closed) so both stay in sync and
 * collide on the same dedup_key → never double-fire.
 *
 * @returns {Promise<{created: boolean, threshold: string|null}>}
 */
export async function notifyDeadline({ userId, assignmentId, title, courseId, dueMs, kind = 'assignment' }) {
  if (!userId || !assignmentId || !title || !Number.isFinite(dueMs)) {
    return { created: false, threshold: null };
  }
  const isExam = kind === 'exam' || String(assignmentId).startsWith(EXAM_ID_PREFIX);
  const threshold = isExam ? pickThreshold(dueMs - Date.now(), EXAM_THRESHOLDS, EXAM_ORDER) : pickThreshold(dueMs - Date.now());
  if (!threshold) return { created: false, threshold: null };

  const { label } = (isExam ? EXAM_THRESHOLDS : THRESHOLDS)[threshold];
  const safeTitle = String(title).slice(0, MAX_TITLE);
  const isTask = kind === 'task';
  const r = await createNotification({
    userId,
    type: 'deadline',
    // 文言は campus-sns/i18n.js の formatNotif が言語ごとに読み替える（形を変えたらそちらも直す）
    text: isExam ? `「${safeTitle}」の試験が${label}です` : isTask ? `タスク「${safeTitle}」の期限が${label}です` : `「${safeTitle}」の提出期限が${label}です`,
    courseId: courseId || null,
    dedupKey: `deadline:${assignmentId}:${threshold}`,
    pushTitle: isExam ? '試験' : isTask ? 'タスクの締切' : '課題の締切',
  });
  return { created: r.created, threshold };
}

/**
 * Cache a user's upcoming assignment deadlines server-side so the cron can fire
 * reminders while the app is closed. Called best-effort from /api/data/all-meta.
 *
 * Minimal-write diff sync (same approach as syncEnrollments): only upserts new /
 * changed rows and deletes dropped ones, so the common case (nothing changed on
 * app load / 15-min refresh) performs ZERO writes — protects the Nano instance's
 * disk-IO budget. Completed / past-due / removed assignments are deleted so they
 * stop being eligible for reminders.
 *
 * @param {number} userid - Moodle user id
 * @param {Array} assignments - transformed assignments ({ id, title, cid, due, st })
 * @param {Array} [extra] - そのほかの通知したい予定（自分の試験など）。{ id, title, cid, due } で、
 *   id は `exam_…` のように課題と重ならない名前にする（この関数は一覧に無い行を消すので、ここで一緒に渡す）
 * @param {{ keepPrefixes?: string[] }} [opts] - この接頭辞の行は一覧に無くても消さない（extra を取れなかったとき用）
 */
export async function syncAssignmentDeadlines(userid, assignments, extra = [], { keepPrefixes = [] } = {}) {
  if (!userid || !Array.isArray(assignments)) return;
  try {
    const { getSupabaseAdmin } = await import('./supabase/server.js');
    const sb = getSupabaseAdmin();
    const now = Date.now();

    // Desired state: future, non-completed assignments with a valid due date.
    const desired = new Map(); // assignment_id -> { title, course_id, due_at(ISO) }
    for (const a of [...assignments, ...(extra || [])]) {
      if (!a || a.st === 'completed' || a.st === 'loading' || !a.due) continue;
      const dueMs = a.due instanceof Date ? a.due.getTime() : new Date(a.due).getTime();
      if (!Number.isFinite(dueMs) || dueMs <= now) continue;
      desired.set(String(a.id), {
        title: String(a.title || '').slice(0, 200),
        course_id: a.cid || null,
        due_at: new Date(dueMs).toISOString(),
      });
    }

    const { data: rows, error: selErr } = await sb
      .from('assignment_deadlines')
      .select('assignment_id, title, course_id, due_at')
      .eq('moodle_user_id', userid);
    if (selErr) { console.error('[DeadlineSync] select error:', selErr.message); return; }

    const existing = new Map((rows || []).map(r => [String(r.assignment_id), r]));

    const toUpsert = [];
    for (const [aid, d] of desired) {
      const ex = existing.get(aid);
      const exDueIso = ex ? new Date(ex.due_at).toISOString() : null;
      if (!ex || exDueIso !== d.due_at || ex.title !== d.title || (ex.course_id || null) !== d.course_id) {
        toUpsert.push({
          moodle_user_id: userid,
          assignment_id: aid,
          title: d.title,
          course_id: d.course_id,
          due_at: d.due_at,
          updated_at: new Date(now).toISOString(),
        });
      }
    }
    const toRemove = [...existing.keys()].filter(aid => !desired.has(aid) && !keepPrefixes.some(p => aid.startsWith(p)));

    if (toUpsert.length) {
      const { error } = await sb
        .from('assignment_deadlines')
        .upsert(toUpsert, { onConflict: 'moodle_user_id,assignment_id' });
      if (error) console.error('[DeadlineSync] upsert error:', error.message);
    }
    if (toRemove.length) {
      const { error } = await sb
        .from('assignment_deadlines')
        .delete()
        .eq('moodle_user_id', userid)
        .in('assignment_id', toRemove);
      if (error) console.error('[DeadlineSync] delete error:', error.message);
    }
  } catch (e) {
    console.error('[DeadlineSync] failed:', e.message);
  }
}
