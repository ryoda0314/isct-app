import { getSupabaseAdmin } from './supabase/server.js';

// Cache NG words for 60 seconds to avoid hitting DB on every message
let _cache = null;
let _cacheTime = 0;
const CACHE_TTL = 60 * 1000;

async function getWords() {
  const now = Date.now();
  if (_cache && now - _cacheTime < CACHE_TTL) return _cache;
  const sb = getSupabaseAdmin();
  const { data } = await sb.from('ng_words').select('word, match_type, action');
  _cache = data || [];
  _cacheTime = now;
  return _cache;
}

/**
 * Check text against NG word list.
 * Returns { blocked: boolean, matched: string[] }
 * Logs matches to ng_word_logs table (non-blocking).
 */
export async function checkNgWords(text, context) {
  if (!text) return { blocked: false, matched: [] };
  let words;
  try { words = await getWords(); } catch { return { blocked: false, matched: [] }; }
  if (!words.length) return { blocked: false, matched: [] };

  const lower = text.toLowerCase();
  const matched = [];
  let blocked = false;

  for (const w of words) {
    let hit = false;
    if (w.match_type === 'exact') hit = lower === w.word.toLowerCase();
    else if (w.match_type === 'regex') {
      try { hit = new RegExp(w.word, 'i').test(text); } catch {}
    } else {
      hit = lower.includes(w.word.toLowerCase());
    }
    if (hit) {
      matched.push(w.word);
      if (w.action === 'block') blocked = true;
    }
  }

  // Log matched words to DB (non-blocking)
  if (matched.length > 0) {
    try {
      const sb = getSupabaseAdmin();
      sb.from('ng_word_logs').insert({
        matched_words: matched,
        action_taken: blocked ? 'block' : 'log',
        text_snippet: text.slice(0, 100),
        user_id: context?.userId || null,
        content_type: context?.type || null,
        course_id: context?.courseId || null,
      }).then(() => {}).catch(() => {});
    } catch {}
  }

  return { blocked, matched };
}

export function clearNgCache() { _cache = null; _cacheTime = 0; }
