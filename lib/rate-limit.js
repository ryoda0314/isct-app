import { getSupabaseAdmin } from './supabase/server.js';

/**
 * Rate-limit counters shared across serverless instances (supabase/rate-limits.sql).
 * If the RPC is unavailable (migration not applied / DB error) we fall back to a
 * per-instance in-memory counter so protection degrades instead of disappearing.
 */

const memory = new Map(); // key -> { count, start }

function memoryHit(key, windowSec, increment) {
  const now = Date.now();
  let rec = memory.get(key);
  if (!rec || now - rec.start > windowSec * 1000) {
    if (increment === 0) return 0;
    rec = { count: 0, start: now };
    memory.set(key, rec);
  }
  rec.count += increment;
  if (memory.size > 5000) {
    for (const [k, v] of memory) if (now - v.start > windowSec * 1000) memory.delete(k);
  }
  return rec.count;
}

async function hit(key, windowSec, increment) {
  try {
    const { data, error } = await getSupabaseAdmin().rpc('rate_limit_hit', {
      p_key: key, p_window_seconds: windowSec, p_increment: increment,
    });
    if (error) throw error;
    return typeof data === 'number' ? data : Number(data) || 0;
  } catch (e) {
    console.warn('[rate-limit] DB unavailable, using in-memory fallback:', e.message);
    return memoryHit(key, windowSec, increment);
  }
}

/** Count this request and report whether it is within `max` per `windowSec`. */
export async function consumeRateLimit(key, { max, windowSec }) {
  const count = await hit(key, windowSec, 1);
  return count <= max;
}

/** True when `key` already has `max` or more recorded attempts in the window. */
export async function isRateLimited(key, { max, windowSec }) {
  const count = await hit(key, windowSec, 0);
  return count >= max;
}

/** Record one failed attempt (use with isRateLimited for failure-only counting). */
export async function recordAttempt(key, { windowSec }) {
  await hit(key, windowSec, 1);
}

/** Forget attempts for `key` (e.g. after a successful login). */
export async function clearRateLimit(key) {
  memory.delete(key);
  try {
    await getSupabaseAdmin().from('rate_limits').delete().eq('key', key);
  } catch {}
}

/** Best-effort client IP (Vercel sets x-real-ip). */
export function clientIp(request) {
  return request.headers.get('x-real-ip')
    || request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || 'unknown';
}
