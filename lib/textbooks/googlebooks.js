/**
 * Google Books API client.
 *
 *   GET https://www.googleapis.com/books/v1/volumes?q=QUERY&maxResults=N
 *
 * Without an API key: 1000 queries/day per IP.
 * With GOOGLE_BOOKS_API_KEY env var: 100k/day quota.
 *
 * Returns a small `industryIdentifiers` set we can map to ISBN-13.
 */

const ENDPOINT = 'https://www.googleapis.com/books/v1/volumes';

/**
 * Search Google Books.
 *
 * @param {string} query     — cleaned search string
 * @param {object} [opts]
 * @param {number} [opts.maxResults=3]
 * @param {string} [opts.lang]  — restrict to language code (e.g. "ja")
 * @param {string} [opts.title] — if provided, prepend `intitle:` for higher precision
 * @returns {Promise<Array<{isbn13: string|null, isbn10: string|null, title: string, author: string|null, publisher: string|null, published_year: string|null, cover_url: string|null, source_data: object}>>}
 */
export async function searchGoogleBooks(query, opts = {}) {
  if (!query || query.length < 3) return [];
  const maxResults = opts.maxResults || 3;
  const apiKey = process.env.GOOGLE_BOOKS_API_KEY;

  const params = new URLSearchParams();
  // Use intitle: + general query for slightly better precision when title is known
  const q = opts.title ? `intitle:${opts.title} ${query}` : query;
  params.set('q', q);
  params.set('maxResults', String(maxResults));
  if (opts.lang) params.set('langRestrict', opts.lang);
  if (apiKey) params.set('key', apiKey);

  let json;
  try {
    const resp = await fetch(`${ENDPOINT}?${params}`, { headers: { 'User-Agent': 'ScienceTokyoApp/1.0' } });
    if (!resp.ok) {
      if (resp.status === 429) throw new Error('rate_limited');
      throw new Error(`HTTP ${resp.status}`);
    }
    json = await resp.json();
  } catch (e) {
    throw e;
  }

  const items = json.items || [];
  return items.map(it => {
    const v = it.volumeInfo || {};
    const ids = v.industryIdentifiers || [];
    const isbn13Obj = ids.find(i => i.type === 'ISBN_13');
    const isbn10Obj = ids.find(i => i.type === 'ISBN_10');
    const pubdate = v.publishedDate || '';
    const year = (pubdate.match(/^(\d{4})/) || [])[1] || null;
    return {
      isbn13: isbn13Obj ? isbn13Obj.identifier.replace(/[^\d]/g, '') : null,
      isbn10: isbn10Obj ? isbn10Obj.identifier.replace(/[^\dX]/g, '') : null,
      title: v.title || null,
      author: Array.isArray(v.authors) ? v.authors.join(', ') : (v.authors || null),
      publisher: v.publisher || null,
      published_year: year,
      cover_url: v.imageLinks?.thumbnail || v.imageLinks?.smallThumbnail || null,
      source_data: it,
    };
  });
}

/**
 * Title-similarity score in [0,1].
 *
 * Combines:
 *  - Character bigram Jaccard (good for cross-language partial matches)
 *  - Substring containment boost: if a is a substring of b (or vice versa),
 *    boost the score. This handles the common case where NDL adds a subtitle
 *    e.g. "新・工業力学" ⊂ "新・工業力学 : 例解から応用への展開".
 */
export function titleSimilarity(a, b) {
  if (!a || !b) return 0;
  const norm = s => s.toLowerCase().replace(/[\s『』「」"'.,!?\-_:：、，。．（）()【】\[\]]/g, '');
  const an = norm(a);
  const bn = norm(b);
  if (an.length === 0 || bn.length === 0) return 0;

  // Bigram Jaccard
  const bigrams = s => {
    if (s.length < 2) return new Set([s]);
    const arr = [];
    for (let i = 0; i < s.length - 1; i++) arr.push(s.slice(i, i + 2));
    return new Set(arr);
  };
  const A = bigrams(an);
  const B = bigrams(bn);
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  const union = A.size + B.size - inter;
  const jaccard = union === 0 ? 0 : inter / union;

  // Substring containment: short title fully contained in longer title
  // (typical when NDL/openBD includes a subtitle after ":" / "—" / "－")
  let contain = 0;
  if (an.length >= 3 && bn.includes(an)) {
    contain = Math.min(1, an.length / bn.length + 0.5);
  } else if (bn.length >= 3 && an.includes(bn)) {
    contain = Math.min(1, bn.length / an.length + 0.5);
  }

  return Math.max(jaccard, contain);
}
