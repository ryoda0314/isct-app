import { getSupabaseAdmin } from './supabase/server.js';

// Simple in-memory cache: userId -> { data: Set, ts: number }
const _cache = new Map();
const CACHE_TTL = 30_000; // 30 seconds

/**
 * Get the set of user IDs that the given user has muted.
 * (One-directional: only muter's view is affected)
 * Results are cached for 30s to avoid redundant reads.
 */
export async function getMutedIds(userId) {
  const now = Date.now();
  const cached = _cache.get(userId);
  if (cached && now - cached.ts < CACHE_TTL) return cached.data;

  const sb = getSupabaseAdmin();
  const { data } = await sb
    .from('user_mutes')
    .select('muted_id')
    .eq('muter_id', userId);

  const ids = new Set((data || []).map(r => r.muted_id));
  _cache.set(userId, { data: ids, ts: now });

  if (_cache.size > 500) {
    for (const [k, v] of _cache) {
      if (now - v.ts > CACHE_TTL) _cache.delete(k);
    }
  }

  return ids;
}

/** Invalidate cache for a user (call after mute/unmute) */
export function invalidateMuteCache(userId) {
  _cache.delete(userId);
}
