import { getSupabaseAdmin } from './supabase/server.js';
import { sendPushToUser } from './push.js';

// Parse @mentions from text, return unique name list
export function parseMentions(text) {
  const matches = text.match(/@(\S+)/g);
  if (!matches) return [];
  return [...new Set(matches.map(m => m.slice(1)))];
}

// Create notifications for mentioned users
export async function notifyMentions(text, authorId, authorName, courseId, context) {
  const names = parseMentions(text);
  if (!names.length) return;
  const sb = getSupabaseAdmin();
  const { data: profiles } = await sb
    .from('profiles')
    .select('moodle_id, name')
    .in('name', names);
  if (!profiles?.length) return;
  const notifs = profiles
    .filter(p => p.moodle_id !== authorId)
    .map(p => ({
      moodle_user_id: p.moodle_id,
      type: 'mention',
      text: `${authorName}さんが${context}であなたをメンションしました`,
      course_id: courseId || null,
    }));
  if (notifs.length) {
    const { error } = await sb.from('notifications').insert(notifs);
    if (error) console.error('[notifyMentions]', error.message);
    // Web Push
    for (const n of notifs) {
      sendPushToUser(n.moodle_user_id, { title: 'メンション', body: n.text }).catch(() => {});
    }
  }
}
