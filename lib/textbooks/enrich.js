/**
 * Stage C enrichment: name-search fallback for course_books with book_id IS NULL.
 *
 * Pipeline:
 *   1. Fetch unmatched course_books (book_id IS NULL) for given filter
 *   2. For each row:
 *        a. Clean raw_line → query + title
 *        b. Try NDL with `title=<searchableTitle>` (broader)
 *        c. If no good match, try NDL with `any=<query>` (full-text)
 *        d. If still no match AND GOOGLE_BOOKS_API_KEY set, try Google Books
 *        e. Score top result with bigram Jaccard similarity to extracted title
 *   3. Upsert book metadata into `books` (source='ndl' or 'google_books')
 *   4. Update course_books with book_id + new confidence + status='pending'
 *
 * Confidence thresholds (vs. extracted title; falls back to query head):
 *   sim >= 0.75 → medium
 *   sim >= 0.45 → low
 *   else        → leave unmatched (confidence='none')
 */

import { getSupabaseAdmin } from '../supabase/server.js';
import { buildQuery, extractTitle, searchableTitle } from './clean-query.js';
import { searchNdl } from './ndl.js';
import { searchGoogleBooks, titleSimilarity } from './googlebooks.js';

const SIM_MEDIUM = 0.75;
const SIM_LOW = 0.45;

// Per-source rate limits (ms between calls)
const RATE_LIMIT_MS = { ndl: 200, google: 800 };

const enrichProgress = new Map();
export function getEnrichProgress(key) { return enrichProgress.get(key) || null; }

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

/**
 * Best-result selection helper.
 * Returns { result, sim, source } for the highest-similarity match,
 * or null if no candidate passes the SIM_LOW threshold.
 */
function pickBest(results, refTitle, source) {
  if (!results || results.length === 0) return null;
  let best = null;
  for (const r of results) {
    const sim = titleSimilarity(refTitle, r.title || '');
    if (!best || sim > best.sim) best = { result: r, sim, source };
  }
  return best && best.sim >= SIM_LOW ? best : null;
}

/**
 * Enrich one row.
 * Returns { matched, book, confidence, source, sim } where matched is bool.
 */
async function enrichOne(row, opts) {
  const q = buildQuery(row.raw_line);
  const fullTitle = q.title || extractTitle(row.raw_line);
  const searchTitle = fullTitle ? searchableTitle(fullTitle) : null;
  // 検索クエリには短い searchTitle、類似度比較には full title を使う。
  // 短い refTitle だと NDL の上位3件に本物が入らない時の sim 計算が緩んでしまうため。
  const refTitle = fullTitle || q.query;

  // Attempt 1: NDL title=
  if (searchTitle && searchTitle.length >= 2) {
    try {
      const results = await searchNdl(searchTitle, { mode: 'title', cnt: 3 });
      await sleep(RATE_LIMIT_MS.ndl);
      const best = pickBest(results, refTitle, 'ndl');
      if (best) return { matched: true, ...best };
    } catch (e) { console.error('[Enrich] NDL title err:', e.message); }
  }

  // Attempt 2: NDL any= with first ~30 chars of cleaned query
  if (q.query.length >= 3) {
    try {
      const head = q.query.slice(0, 40);
      const results = await searchNdl(head, { mode: 'any', cnt: 3 });
      await sleep(RATE_LIMIT_MS.ndl);
      const best = pickBest(results, refTitle, 'ndl');
      if (best) return { matched: true, ...best };
    } catch (e) { console.error('[Enrich] NDL any err:', e.message); }
  }

  // Attempt 3: Google Books (full query) — only if API key set OR user opted in
  if (opts.useGoogleBooks) {
    try {
      const results = await searchGoogleBooks(q.query, { title: searchTitle, maxResults: 3 });
      await sleep(RATE_LIMIT_MS.google);
      const best = pickBest(results, refTitle, 'google_books');
      if (best) return { matched: true, ...best };
    } catch (e) {
      if (e.message === 'rate_limited') {
        opts.useGoogleBooks = false;
      } else {
        console.error('[Enrich] Google Books err:', e.message);
      }
    }
  }

  // Attempt 4: Google Books with title-only (no noisy author/publisher annotations)
  // Helps for cases like "「初めてのトライボロジー」佐々木他(講談社)" where
  // the full query confuses GBooks but `intitle:初めてのトライボロジー` finds it.
  if (opts.useGoogleBooks && searchTitle && searchTitle.length >= 3) {
    try {
      const results = await searchGoogleBooks(searchTitle, { maxResults: 5 });
      await sleep(RATE_LIMIT_MS.google);
      const best = pickBest(results, refTitle, 'google_books');
      if (best) return { matched: true, ...best };
    } catch (e) {
      if (e.message === 'rate_limited') opts.useGoogleBooks = false;
    }
  }

  return { matched: false };
}

/**
 * Run Stage C enrichment for a given filter.
 *
 * @param {object} opts
 * @param {string} opts.year
 * @param {string} [opts.dept]
 * @param {string} [opts.faculty]
 * @param {boolean} [opts.useGoogleBooks=true]  — set false to skip GBooks even if key is set
 * @returns {Promise<{candidates: number, matched: number, ndlHits: number, googleHits: number, medium: number, low: number, booksUpserted: number}>}
 */
export async function enrichTextbooks({ year, dept, faculty, useGoogleBooks } = {}) {
  if (!year) throw new Error('year is required');
  const sb = getSupabaseAdmin();
  const useGB = useGoogleBooks !== false;
  const progressKey = `enrich_${dept || 'all'}_${year}_${faculty || 'isct'}`;
  enrichProgress.set(progressKey, { phase: 'loading', total: 0, done: 0 });

  // Load orphan course_books for this scope — paginate to bypass Supabase 1000-row default
  const PAGE = 1000;
  const orphans = [];
  for (let from = 0; ; from += PAGE) {
    let q = sb.from('course_books').select('*')
      .is('book_id', null).eq('syllabus_year', year)
      .order('id').range(from, from + PAGE - 1);
    if (faculty) q = q.eq('faculty', faculty);
    if (dept) {
      const safe = dept.replace(/[%_,]/g, '');
      if (safe) q = q.ilike('course_code', `${safe}.%`);
    }
    const { data, error } = await q;
    if (error) {
      enrichProgress.delete(progressKey);
      throw new Error(`load orphans: ${error.message}`);
    }
    if (!data || data.length === 0) break;
    orphans.push(...data);
    if (data.length < PAGE) break;
  }

  enrichProgress.set(progressKey, { phase: 'searching', total: orphans.length, done: 0, matched: 0, ndlHits: 0, googleHits: 0, useGoogleBooks: useGB });

  // Process sequentially to respect rate limits
  const decisions = [];   // [{ row, decision }]
  let done = 0, matchedRunning = 0, ndlRunning = 0, gbRunning = 0;
  const optsState = { useGoogleBooks: useGB };
  for (const row of orphans) {
    const decision = await enrichOne(row, optsState);
    decisions.push({ row, decision });
    done++;
    if (decision.matched) {
      matchedRunning++;
      if (decision.source === 'ndl') ndlRunning++;
      else if (decision.source === 'google_books') gbRunning++;
    }
    // Update progress every row so UI sees live updates
    enrichProgress.set(progressKey, {
      phase: 'searching',
      total: orphans.length,
      done,
      matched: matchedRunning,
      ndlHits: ndlRunning,
      googleHits: gbRunning,
      useGoogleBooks: optsState.useGoogleBooks,
      currentText: (row.raw_line || '').slice(0, 50),
    });
  }

  // Group matched results: upsert books then update course_books
  const matchedRows = decisions.filter(d => d.decision.matched);
  enrichProgress.set(progressKey, { phase: 'upsert_books', total: matchedRows.length, done: 0 });

  // Aggregate book metadata by ISBN (or by synthetic key if no ISBN)
  const bookByKey = new Map();
  for (const m of matchedRows) {
    const r = m.decision.result;
    const key = r.isbn13 || `__no_isbn__/${r.title}/${r.publisher || ''}/${r.published_year || ''}`;
    if (!bookByKey.has(key)) {
      bookByKey.set(key, {
        isbn13: r.isbn13 || null,
        isbn10: r.isbn10 || null,
        title: r.title || '(unknown)',
        author: r.author || null,
        publisher: r.publisher || null,
        published_year: r.published_year || null,
        cover_url: r.cover_url || null,
        source: m.decision.source,
        source_data: r.source_data || null,
        updated_at: new Date().toISOString(),
      });
    }
  }

  // Upsert books — handle ISBN13-keyed and orphan books separately
  const withIsbn = [...bookByKey.values()].filter(b => b.isbn13);
  const withoutIsbn = [...bookByKey.values()].filter(b => !b.isbn13);

  const bookIdByKey = new Map();
  if (withIsbn.length > 0) {
    const BATCH = 200;
    for (let i = 0; i < withIsbn.length; i += BATCH) {
      const batch = withIsbn.slice(i, i + BATCH);
      const { data, error } = await sb.from('books')
        .upsert(batch, { onConflict: 'isbn13' })
        .select('id, isbn13');
      if (error) { console.error('[Enrich] books upsert err:', error.message); continue; }
      for (const row of data || []) bookIdByKey.set(row.isbn13, row.id);
    }
  }
  // Books without ISBN: insert as new rows (no dedup) — risky but Stage D can clean up
  for (const b of withoutIsbn) {
    const { data, error } = await sb.from('books').insert(b).select('id').single();
    if (error) { console.error('[Enrich] book insert err:', error.message); continue; }
    const key = `__no_isbn__/${b.title}/${b.publisher || ''}/${b.published_year || ''}`;
    bookIdByKey.set(key, data.id);
  }

  // Update course_books rows
  enrichProgress.set(progressKey, { phase: 'update_links', total: matchedRows.length, done: 0 });
  let updated = 0, medium = 0, low = 0, ndlHits = 0, googleHits = 0;
  for (const m of matchedRows) {
    const r = m.decision.result;
    const key = r.isbn13 || `__no_isbn__/${r.title}/${r.publisher || ''}/${r.published_year || ''}`;
    const bookId = bookIdByKey.get(key);
    if (!bookId) continue;
    const conf = m.decision.sim >= SIM_MEDIUM ? 'medium' : 'low';
    if (conf === 'medium') medium++; else low++;
    if (m.decision.source === 'ndl') ndlHits++;
    if (m.decision.source === 'google_books') googleHits++;
    const { error } = await sb.from('course_books').update({
      book_id: bookId,
      confidence: conf,
      note: `${m.decision.source} match sim=${m.decision.sim.toFixed(2)}`,
      updated_at: new Date().toISOString(),
    }).eq('id', m.row.id);
    if (error) { console.error('[Enrich] update err:', error.message); continue; }
    updated++;
  }

  enrichProgress.delete(progressKey);
  return {
    candidates: orphans.length,
    matched: updated,
    ndlHits,
    googleHits,
    medium,
    low,
    booksUpserted: bookByKey.size,
  };
}
