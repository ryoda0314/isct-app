/**
 * NDL Search OpenSearch API client.
 *
 *   GET https://ndlsearch.ndl.go.jp/api/opensearch?title=...&mediatype=1
 *   (mediatype=1 = 図書)
 *
 * Returns RSS XML. We parse with regex to avoid an XML dep.
 * No API key, no quota — preferred for Japanese books.
 */

const ENDPOINT = 'https://ndlsearch.ndl.go.jp/api/opensearch';

function strip(s) {
  return (s || '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .trim();
}

/**
 * Search NDL.
 *
 * @param {string} query — search string
 * @param {object} [opts]
 * @param {number} [opts.cnt=3]   — max results
 * @param {string} [opts.creator] — author filter
 * @param {'title'|'any'} [opts.mode='title']  — match against `title=` or `any=`
 * @returns {Promise<Array<{isbn13: string|null, title: string, author: string|null, publisher: string|null, published_year: string|null, source_data: object}>>}
 */
export async function searchNdl(query, opts = {}) {
  if (!query || query.length < 2) return [];
  const params = new URLSearchParams();
  const field = opts.mode === 'any' ? 'any' : 'title';
  params.set(field, query);
  if (opts.creator) params.set('creator', opts.creator);
  params.set('mediatype', 'books');
  params.set('cnt', String(opts.cnt || 3));

  let xml;
  try {
    const resp = await fetch(`${ENDPOINT}?${params}`, {
      headers: { 'User-Agent': 'ScienceTokyoApp/1.0', 'Accept': 'application/rss+xml,application/xml,text/xml' },
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    xml = await resp.text();
  } catch (e) {
    throw e;
  }

  // Crude XML parse: split on </item> blocks
  const items = [];
  const itemRe = /<item>([\s\S]*?)<\/item>/g;
  let m;
  while ((m = itemRe.exec(xml)) !== null) {
    const block = m[1];
    // Use static patterns (dynamic new RegExp with backslash escaping was buggy)
    const titleM = block.match(/<dc:title>([\s\S]*?)<\/dc:title>/i) || block.match(/<title>([\s\S]*?)<\/title>/i);
    const title = titleM ? strip(titleM[1]) : null;
    const authorM = block.match(/<author>([\s\S]*?)<\/author>/i) || block.match(/<dc:creator>([\s\S]*?)<\/dc:creator>/i);
    const author = authorM ? strip(authorM[1]) : null;
    const pubM = block.match(/<dc:publisher>([\s\S]*?)<\/dc:publisher>/i);
    const publisher = pubM ? strip(pubM[1]) : null;
    const dateM = block.match(/<dc:date[^>]*>([\s\S]*?)<\/dc:date>/i) || block.match(/<pubDate>([\s\S]*?)<\/pubDate>/i);
    const date = dateM ? strip(dateM[1]) : '';
    const yearM = date.match(/(\d{4})/);
    const year = yearM ? yearM[1] : null;

    // ISBN: NDL exposes ISBN inside <dc:identifier xsi:type="dcndl:ISBN">...</dc:identifier>
    // or sometimes inside <dcndl:ISBN>...
    const isbnMatches = [...block.matchAll(/<dc:identifier[^>]*ISBN[^>]*>([^<]+)<\/dc:identifier>/gi)];
    let isbn13 = null;
    for (const im of isbnMatches) {
      const raw = strip(im[1]).replace(/[^\dXx]/g, '');
      if (/^97[89]\d{10}$/.test(raw)) { isbn13 = raw; break; }
      if (/^\d{9}[\dXx]$/.test(raw)) {
        // Convert ISBN-10 → 13
        const core = '978' + raw.slice(0, 9);
        let sum = 0;
        for (let i = 0; i < 12; i++) sum += Number(core[i]) * (i % 2 === 0 ? 1 : 3);
        isbn13 = core + ((10 - (sum % 10)) % 10);
        break;
      }
    }

    items.push({
      isbn13,
      title,
      author,
      publisher,
      published_year: year,
      source_data: { raw: block.slice(0, 4000) },  // keep first 4kb of XML for debugging
    });
  }
  return items;
}
