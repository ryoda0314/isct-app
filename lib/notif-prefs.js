import { getSupabaseAdmin } from './supabase/server.js';

/**
 * Server-side push notification preferences (supabase/notification-prefs.sql).
 * Categories match the toggles in ProfileView's 通知設定. Pushes without a
 * category (mentions, comments, friend requests, announcements) only obey the
 * master switch. Missing row / DB error → allowed (fail-open: a broken prefs
 * lookup must not silently drop every notification).
 */

export const PREF_CATEGORIES = ['course', 'deadline', 'dm', 'event'];
export const DEFAULT_PREFS = { enabled: true, course: true, deadline: true, dm: true, event: true };

// Short per-instance cache: fan-outs (course posts) and paired Web Push + APNs
// sends would otherwise look up the same rows repeatedly.
const CACHE_TTL = 30_000;
const cache = new Map(); // moodleId -> { prefs, ts }

function normalize(row) {
  const p = { ...DEFAULT_PREFS };
  if (row) for (const k of Object.keys(DEFAULT_PREFS)) if (typeof row[k] === 'boolean') p[k] = row[k];
  return p;
}

async function loadPrefs(ids) {
  const now = Date.now();
  const out = new Map();
  const missing = [];
  for (const id of ids) {
    const c = cache.get(id);
    if (c && now - c.ts < CACHE_TTL) out.set(id, c.prefs);
    else missing.push(id);
  }
  if (missing.length) {
    const { data, error } = await getSupabaseAdmin()
      .from('notification_prefs')
      .select('moodle_id, enabled, course, deadline, dm, event')
      .in('moodle_id', missing);
    if (error) throw error;
    const rows = new Map((data || []).map(r => [Number(r.moodle_id), r]));
    for (const id of missing) {
      const prefs = normalize(rows.get(id));
      cache.set(id, { prefs, ts: now });
      out.set(id, prefs);
    }
    if (cache.size > 5000) for (const [k, v] of cache) if (now - v.ts > CACHE_TTL) cache.delete(k);
  }
  return out;
}

function allows(prefs, category) {
  if (!prefs.enabled) return false;
  return PREF_CATEGORIES.includes(category) ? prefs[category] !== false : true;
}

/** Return the subset of moodleIds that accept a push of this category. */
export async function filterPushRecipients(moodleIds, category) {
  const ids = [...new Set((moodleIds || []).filter(id => id != null).map(Number))];
  if (!ids.length) return [];
  try {
    const prefs = await loadPrefs(ids);
    return ids.filter(id => allows(prefs.get(id) || DEFAULT_PREFS, category));
  } catch (e) {
    console.warn('[notif-prefs] lookup failed, sending anyway:', e.message);
    return ids;
  }
}

export async function getNotifPrefs(moodleId) {
  const { data, error } = await getSupabaseAdmin()
    .from('notification_prefs')
    .select('enabled, course, deadline, dm, event')
    .eq('moodle_id', moodleId)
    .maybeSingle();
  if (error) throw error;
  return { prefs: normalize(data), stored: !!data };
}

export async function saveNotifPrefs(moodleId, input) {
  const row = { moodle_id: moodleId, updated_at: new Date().toISOString() };
  for (const k of Object.keys(DEFAULT_PREFS)) if (typeof input?.[k] === 'boolean') row[k] = input[k];
  const { error } = await getSupabaseAdmin()
    .from('notification_prefs')
    .upsert(row, { onConflict: 'moodle_id' });
  if (error) throw error;
  cache.delete(Number(moodleId));
  return getNotifPrefs(moodleId);
}
