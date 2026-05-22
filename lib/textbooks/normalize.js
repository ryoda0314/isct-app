/**
 * Stage B normalization: course_textbooks_raw → books + course_books.
 *
 * Pipeline (for each raw row passing filter):
 *   1. Split raw_text into classified lines (split.js)
 *   2. For each line with kind='book':
 *        - Extract ISBN(s) (isbn.js)
 *        - If ISBN present:
 *            • Lookup via openBD (batched across all rows for efficiency)
 *            • If hit  → upsert books → course_books with confidence='high'
 *            • If miss → course_books with book_id=null, confidence='low'
 *              (the line has an ISBN but openBD doesn't know it — likely foreign book)
 *        - If no ISBN:
 *            • course_books with book_id=null, confidence='none', raw_line=text
 *              (awaits Stage C: name-based search)
 *   3. Lines with kind='noise' or 'annotation' are skipped.
 *
 * Idempotent: re-running for the same raw row replaces its course_books rows
 * (UNIQUE on raw_id, raw_line).
 */

import { getSupabaseAdmin } from '../supabase/server.js';
import { splitTextbookLines } from './split.js';
import { extractIsbns } from './isbn.js';
import { lookupIsbns } from './openbd.js';

// Progress tracker (parallel to syllabus-bulk's scrapeProgress)
const normalizeProgress = new Map();
export function getNormalizeProgress(key) {
  return normalizeProgress.get(key) || null;
}

/**
 * Normalize textbooks for a given filter.
 *
 * @param {object} opts
 * @param {string} opts.year
 * @param {string} [opts.dept]      — e.g. 'MEC' (matches course_code prefix)
 * @param {string} [opts.faculty]   — 'isct'|'med'|'den'
 * @returns {Promise<{rawRows: number, bookLines: number, isbnLines: number, openbdHits: number, openbdMisses: number, noIsbn: number, booksUpserted: number, linksUpserted: number}>}
 */
export async function normalizeTextbooks({ year, dept, faculty } = {}) {
  if (!year) throw new Error('year is required');
  const sb = getSupabaseAdmin();
  const progressKey = `norm_${dept || 'all'}_${year}_${faculty || 'isct'}`;
  normalizeProgress.set(progressKey, { phase: 'loading', total: 0, done: 0 });

  // 1. Load raw rows matching filter
  let query = sb.from('course_textbooks_raw').select('*').eq('syllabus_year', year);
  if (faculty) query = query.eq('faculty', faculty);
  if (dept) {
    const safe = dept.replace(/[%_,]/g, '');
    if (safe) query = query.ilike('course_code', `${safe}.%`);
  }
  const { data: rawRows, error: rawErr } = await query;
  if (rawErr) {
    normalizeProgress.delete(progressKey);
    throw new Error(`load raw: ${rawErr.message}`);
  }

  // 2. Split and classify every row, collect all book lines + ISBNs
  const bookLines = [];   // [{raw_id, course_code, syllabus_year, faculty, kind, raw_line, isbns: []}]
  const allIsbns = new Set();
  for (const r of rawRows) {
    const lines = splitTextbookLines(r.raw_text || '');
    for (const l of lines) {
      if (l.kind !== 'book') continue;
      const isbns = extractIsbns(l.text);
      for (const i of isbns) allIsbns.add(i);
      bookLines.push({
        raw_id: r.id,
        course_code: r.course_code,
        syllabus_year: r.syllabus_year,
        faculty: r.faculty,
        kind: r.kind,
        raw_line: l.text,
        isbns,
      });
    }
  }

  normalizeProgress.set(progressKey, {
    phase: 'openbd',
    total: allIsbns.size,
    done: 0,
    rawRows: rawRows.length,
    bookLines: bookLines.length,
  });

  // 3. Batch lookup ISBNs via openBD
  const isbnMap = await lookupIsbns([...allIsbns]);
  normalizeProgress.set(progressKey, {
    phase: 'upsert_books',
    total: isbnMap.size,
    done: 0,
    rawRows: rawRows.length,
    bookLines: bookLines.length,
  });

  // 4. Upsert hit books into `books`
  const booksToUpsert = [];
  for (const [isbn, info] of isbnMap.entries()) {
    if (!info) continue;
    booksToUpsert.push({
      isbn13: isbn,
      title: info.title || '(タイトル不明)',
      author: info.author || null,
      publisher: info.publisher || null,
      published_year: info.published_year || null,
      cover_url: info.cover_url || null,
      source: 'openbd',
      source_data: info.source_data || null,
      updated_at: new Date().toISOString(),
    });
  }

  let booksUpserted = 0;
  const bookIdByIsbn = new Map();
  if (booksToUpsert.length > 0) {
    const BATCH = 200;
    for (let i = 0; i < booksToUpsert.length; i += BATCH) {
      const batch = booksToUpsert.slice(i, i + BATCH);
      const { data, error } = await sb.from('books')
        .upsert(batch, { onConflict: 'isbn13' })
        .select('id, isbn13');
      if (error) {
        console.error('[Normalize] books upsert failed:', error.message, error.details);
        continue;
      }
      booksUpserted += data?.length || 0;
      for (const row of data || []) bookIdByIsbn.set(row.isbn13, row.id);
    }
  }

  // For openBD-miss ISBNs and books already in DB but not returned by select,
  // backfill bookIdByIsbn with a separate query
  const allValidIsbns = [...allIsbns].filter(i => isbnMap.get(i));
  const missingFromMap = allValidIsbns.filter(i => !bookIdByIsbn.has(i));
  if (missingFromMap.length > 0) {
    const { data } = await sb.from('books').select('id, isbn13').in('isbn13', missingFromMap);
    for (const row of data || []) bookIdByIsbn.set(row.isbn13, row.id);
  }

  normalizeProgress.set(progressKey, {
    phase: 'upsert_links',
    total: bookLines.length,
    done: 0,
    rawRows: rawRows.length,
    bookLines: bookLines.length,
    booksUpserted,
  });

  // 5. Build course_books rows — one per (raw_id, raw_line, isbn)
  //    If line has multiple ISBNs (rare), produce one row per ISBN.
  //    If line has no ISBN,    produce one row with book_id=null.
  const links = [];
  let openbdHits = 0, openbdMisses = 0, noIsbn = 0;
  for (const bl of bookLines) {
    if (bl.isbns.length === 0) {
      noIsbn++;
      links.push({
        course_code: bl.course_code,
        syllabus_year: bl.syllabus_year,
        faculty: bl.faculty,
        kind: bl.kind,
        book_id: null,
        raw_id: bl.raw_id,
        raw_line: bl.raw_line,
        confidence: 'none',
        status: 'pending',
        updated_at: new Date().toISOString(),
      });
      continue;
    }
    for (const isbn of bl.isbns) {
      const hit = isbnMap.get(isbn);
      if (hit) openbdHits++; else openbdMisses++;
      links.push({
        course_code: bl.course_code,
        syllabus_year: bl.syllabus_year,
        faculty: bl.faculty,
        kind: bl.kind,
        book_id: bookIdByIsbn.get(isbn) || null,
        raw_id: bl.raw_id,
        raw_line: bl.raw_line,
        confidence: hit ? 'high' : 'low',
        status: 'pending',
        note: hit ? null : `ISBN ${isbn} not in openBD`,
        updated_at: new Date().toISOString(),
      });
    }
  }

  // 6. Wipe existing course_books for the same scope before upsert
  //    (so removed lines from rescraping disappear)
  let delQ = sb.from('course_books').delete().eq('syllabus_year', year);
  if (faculty) delQ = delQ.eq('faculty', faculty);
  if (dept) {
    const safe = dept.replace(/[%_,]/g, '');
    if (safe) delQ = delQ.ilike('course_code', `${safe}.%`);
  }
  const { error: delErr } = await delQ;
  if (delErr) console.error('[Normalize] course_books delete failed:', delErr.message);

  // 7. Insert (deduplicated)
  // Dedup by (raw_id, raw_line) to satisfy unique index — collapse multi-ISBN lines:
  // keep the first ISBN row but record other ISBNs in note. (Simple approach for now.)
  const seen = new Map();
  for (const l of links) {
    const key = `${l.raw_id}|${l.raw_line}`;
    if (!seen.has(key)) seen.set(key, l);
    // If we already saw this raw_line, prefer the high-confidence row.
    else if (seen.get(key).confidence !== 'high' && l.confidence === 'high') seen.set(key, l);
  }
  const deduped = [...seen.values()];

  let linksUpserted = 0;
  if (deduped.length > 0) {
    const BATCH = 500;
    for (let i = 0; i < deduped.length; i += BATCH) {
      const batch = deduped.slice(i, i + BATCH);
      const { error } = await sb.from('course_books').insert(batch);
      if (error) {
        console.error('[Normalize] course_books insert failed:', error.message, error.details);
        continue;
      }
      linksUpserted += batch.length;
    }
  }

  normalizeProgress.delete(progressKey);

  return {
    rawRows: rawRows.length,
    bookLines: bookLines.length,
    isbnLines: bookLines.filter(b => b.isbns.length > 0).length,
    openbdHits,
    openbdMisses,
    noIsbn,
    booksUpserted,
    linksUpserted,
  };
}
