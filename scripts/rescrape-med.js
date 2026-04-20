/**
 * Re-scrape MED (医学部) 2026 to populate session_title/session_content/session_goal.
 * Run from project root: node scripts/rescrape-med.js
 */
import { readFileSync } from 'node:fs';
import { fetchMedFacultySyllabus } from '../lib/api/syllabus-med.js';

try {
  const env = readFileSync('.env.local', 'utf8');
  for (const rawLine of env.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    process.env[line.slice(0, eq).trim()] = line.slice(eq + 1).trim();
  }
} catch (e) { console.error('env load failed:', e.message); process.exit(1); }

console.log('Starting MED 2026 re-scrape...');
const start = Date.now();
const result = await fetchMedFacultySyllabus('MED', '2026');
const elapsed = ((Date.now() - start) / 1000).toFixed(1);
console.log(`Done in ${elapsed}s:`, result);
