/**
 * openBD API client.
 *
 *   GET https://api.openbd.jp/v1/get?isbn=ISBN1,ISBN2,...
 *
 * Free, no API key, no rate limit; covers Japanese (and many foreign) books.
 * Up to ~1000 ISBNs per request. Returns array of {summary, onix, hanmoto} or null.
 */

const OPENBD_ENDPOINT = 'https://api.openbd.jp/v1/get';
const BATCH = 100;  // conservative; openBD docs say up to ~1000

/**
 * Look up multiple ISBNs.
 *
 * @param {string[]} isbn13List
 * @returns {Promise<Map<string, object|null>>} isbn13 → { title, author, publisher, published_year, cover_url, isbn13, source_data } | null
 */
export async function lookupIsbns(isbn13List) {
  const result = new Map();
  const unique = [...new Set(isbn13List.filter(Boolean))];

  for (let i = 0; i < unique.length; i += BATCH) {
    const batch = unique.slice(i, i + BATCH);
    const url = `${OPENBD_ENDPOINT}?isbn=${batch.join(',')}`;
    let arr;
    try {
      const resp = await fetch(url, { headers: { 'User-Agent': 'ScienceTokyoApp/1.0' } });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      arr = await resp.json();
    } catch (e) {
      console.error('[openBD] batch lookup failed:', e.message);
      // mark all in this batch as null
      for (const isbn of batch) result.set(isbn, null);
      continue;
    }

    // arr is parallel to batch
    for (let j = 0; j < batch.length; j++) {
      const isbn = batch[j];
      const item = arr[j];
      if (!item || !item.summary) {
        result.set(isbn, null);
        continue;
      }
      const s = item.summary;
      result.set(isbn, {
        isbn13: s.isbn || isbn,
        title: s.title || null,
        author: s.author || null,
        publisher: s.publisher || null,
        published_year: parsePubYear(s.pubdate),
        cover_url: s.cover || null,
        source_data: item,
      });
    }
  }
  return result;
}

function parsePubYear(pubdate) {
  if (!pubdate) return null;
  // openBD pubdate is YYYYMMDD or YYYY-MM-DD or YYYYMM
  const m = String(pubdate).match(/^(\d{4})/);
  return m ? m[1] : null;
}
