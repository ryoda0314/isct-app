import { getSupabaseAdmin } from './supabase/server.js';

/**
 * Get the set of user IDs that the given user has muted.
 * (One-directional: only muter's view is affected)
 */
export async function getMutedIds(userId) {
  const sb = getSupabaseAdmin();
  const { data } = await sb
    .from('user_mutes')
    .select('muted_id')
    .eq('muter_id', userId);
  return new Set((data || []).map(r => r.muted_id));
}
