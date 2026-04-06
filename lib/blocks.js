import { getSupabaseAdmin } from './supabase/server.js';

// Simple in-memory cache: userId -> { data: Set, ts: number }
const _cache = new Map();
const CACHE_TTL = 30_000; // 30 seconds

/**
 * Get the set of user IDs that are blocked by or have blocked the given user.
 * Returns both directions: users I blocked + users who blocked me.
 * Results are cached for 30s to avoid redundant reads within the same session.
 */
export async function getBlockedIds(userId) {
  const now = Date.now();
  const cached = _cache.get(userId);
  if (cached && now - cached.ts < CACHE_TTL) return cached.data;

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

  _cache.set(userId, { data: ids, ts: now });

  // Evict old entries to prevent memory leak
  if (_cache.size > 500) {
    for (const [k, v] of _cache) {
      if (now - v.ts > CACHE_TTL) _cache.delete(k);
    }
  }

  return ids;
}

/** Invalidate cache for a user (call after block/unblock) */
export function invalidateBlockCache(userId) {
  _cache.delete(userId);
}
