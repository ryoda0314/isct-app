import { getSupabaseAdmin } from './supabase/server.js';
import { sendPushToUser } from './push.js';
import { sendApnsToUser } from './apns.js';

/**
 * Create an in-app notification row and (optionally) send a Web Push.
 * Notifications are best-effort: failures are logged, never thrown.
 *
 * @param {object} opts
 * @param {number} opts.userId      recipient moodle id
 * @param {string} opts.type        notification type (dm, comment, deadline, mention, ...)
 * @param {string} opts.text        body text stored on the notification row
 * @param {string|null} [opts.courseId]
 * @param {string|null} [opts.dedupKey] if set, the insert is deduped via the
 *        unique (moodle_user_id, dedup_key) index — re-creating the same key is a no-op
 * @param {string} [opts.pushTitle] title for the Web Push (defaults to app name)
 * @param {string} [opts.url]       deep-link URL for the Web Push
 * @param {string} [opts.tag]       Web Push tag (collapses notifications)
 * @param {boolean} [opts.push=true]
 * @returns {Promise<{created: boolean}>} created=false when deduped or on error
 */
export async function createNotification({
  userId, type, text, courseId = null, dedupKey = null,
  pushTitle, url, tag, push = true,
}) {
  if (!userId || !text) return { created: false };
  const sb = getSupabaseAdmin();
  const row = { moodle_user_id: userId, type, text, course_id: courseId };
  if (dedupKey) row.dedup_key = dedupKey;

  let inserted;
  if (dedupKey) {
    // ON CONFLICT DO NOTHING — .select() returns only the rows actually inserted
    const { data, error } = await sb
      .from('notifications')
      .upsert(row, { onConflict: 'moodle_user_id,dedup_key', ignoreDuplicates: true })
      .select('id');
    if (error) { console.error('[notify]', error.message); return { created: false }; }
    inserted = !!data?.length;
  } else {
    const { error } = await sb.from('notifications').insert(row);
    if (error) { console.error('[notify]', error.message); return { created: false }; }
    inserted = true;
  }

  if (inserted && push) {
    const title = pushTitle || 'ScienceTokyo App';
    sendPushToUser(userId, { title, body: text, url, tag }).catch(() => {}); // Web Push (web/PWA)
    sendApnsToUser(userId, { title, body: text, url }).catch(() => {});       // APNs (native iOS)
  }
  return { created: inserted };
}
