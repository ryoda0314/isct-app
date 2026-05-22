/**
 * ISBN extraction and validation.
 *
 * Supports:
 *  - ISBN-13: 978/979 prefix, 13 digits (with or without hyphens)
 *  - ISBN-10: 10 digits/X (with or without hyphens)
 *  - "ISBN" / "ISBN-13:" / "ISBN:" / bare numeric prefix variants
 */

/** Remove hyphens, spaces, narrow no-break space, ideographic hyphens. */
function normalize(s) {
  return s.replace(/[\s\-‐–—−ー－]/g, '');
}

/** Validate ISBN-13 check digit. */
function isValidIsbn13(d) {
  if (!/^\d{13}$/.test(d)) return false;
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(d[i]) * (i % 2 === 0 ? 1 : 3);
  const check = (10 - (sum % 10)) % 10;
  return check === Number(d[12]);
}

/** Validate ISBN-10 check digit. */
function isValidIsbn10(d) {
  if (!/^\d{9}[\dXx]$/.test(d)) return false;
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += Number(d[i]) * (10 - i);
  const last = d[9].toUpperCase();
  sum += last === 'X' ? 10 : Number(last);
  return sum % 11 === 0;
}

/** Convert ISBN-10 → ISBN-13 (with check digit). */
function isbn10To13(d10) {
  const core = '978' + d10.slice(0, 9);
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(core[i]) * (i % 2 === 0 ? 1 : 3);
  const check = (10 - (sum % 10)) % 10;
  return core + check;
}

/**
 * Extract all ISBN-13s from a line (after hyphen normalization).
 * Returns array of unique 13-digit strings. Includes ISBN-10s converted to 13.
 */
export function extractIsbns(line) {
  if (!line) return [];
  const found = new Set();

  // Strategy: scan for "ISBN" labels first (most reliable), then bare digits.
  // We normalize hyphens within ~24 chars after "ISBN" so split numbers like
  // "978-4-06-156533-3" reconnect to a 13-digit run.
  const labeled = [...line.matchAll(/ISBN[\s\-:]*([\dXx\s\-‐–—−ー－]{10,24})/gi)];
  for (const m of labeled) {
    const cand = normalize(m[1]);
    // Try 13 first, then 10
    const m13 = cand.match(/\d{13}/);
    if (m13 && isValidIsbn13(m13[0])) { found.add(m13[0]); continue; }
    const m10 = cand.match(/\d{9}[\dXx]/);
    if (m10 && isValidIsbn10(m10[0])) found.add(isbn10To13(m10[0]));
  }

  // Bare ISBN-13 (978/979 prefix) anywhere in line — also hyphen-aware
  const bareGlobal = normalize(line);
  const m13s = bareGlobal.match(/97[89]\d{10}/g) || [];
  for (const cand of m13s) {
    if (isValidIsbn13(cand)) found.add(cand);
  }
  // Bare ISBN-10 — riskier, only accept if checksum valid AND not embedded in larger digit run
  // (to avoid hitting random 10-digit numbers like years/codes)
  // Skip bare ISBN-10 detection to keep noise low; labeled extractor handles them.

  return [...found];
}

/** Format ISBN-13 with hyphens (Japan-specific grouping). Returns input on failure. */
export function formatIsbn13(d) {
  if (!/^\d{13}$/.test(d)) return d;
  // Common JP grouping: 978-4-XXX-XXXXX-X. Without lookup tables, fall back to label split.
  return `${d.slice(0, 3)}-${d.slice(3, 4)}-${d.slice(4, 8)}-${d.slice(8, 12)}-${d.slice(12)}`;
}

export { isValidIsbn13, isValidIsbn10, isbn10To13 };
