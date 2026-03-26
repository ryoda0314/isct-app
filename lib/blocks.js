import { getSupabaseAdmin } from './supabase/server.js';

/**
 * Get the set of user IDs that are blocked by or have blocked the given user.
 * Returns both directions: users I blocked + users who blocked me.
 */
export async function getBlockedIds(userId) {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from('user_blocks')
    .select('blocker_id, blocked_id')
    .or(`blocker_id.eq.${userId},blocked_id.eq.${userId}`);

  if (error) {
    console.error('[getBlockedIds]', error.message);
    return new Set();
  }

  const ids = new Set();
  for (const row of data || []) {
    if (row.blocker_id === userId) ids.add(row.blocked_id);
    else ids.add(row.blocker_id);
  }
  return ids;
}
