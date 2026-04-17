import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';

try {
  const env = readFileSync('.env.local', 'utf8');
  for (const rawLine of env.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const k = line.slice(0, eq).trim();
    const v = line.slice(eq + 1).trim();
    process.env[k] = v;
  }
} catch (e) { console.error('env load failed:', e.message); }

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

console.log('=== med_sessions year=2026 ===');

// Count with and without date
const { count: total } = await sb.from('med_sessions').select('*', { count: 'exact', head: true }).eq('year', '2026');
const { count: withDate } = await sb.from('med_sessions').select('*', { count: 'exact', head: true }).eq('year', '2026').not('date', 'is', null);
const { count: nullDate } = await sb.from('med_sessions').select('*', { count: 'exact', head: true }).eq('year', '2026').is('date', null);
console.log(`total: ${total}, with date: ${withDate}, null date: ${nullDate}`);

// Distinct faculties
for (const fac of ['MED', 'DEN']) {
  const { count } = await sb.from('med_sessions').select('*', { count: 'exact', head: true }).eq('year', '2026').eq('faculty', fac);
  const { count: wd } = await sb.from('med_sessions').select('*', { count: 'exact', head: true }).eq('year', '2026').eq('faculty', fac).not('date', 'is', null);
  console.log(`  faculty=${fac}: total=${count}, with date=${wd}`);
}

// Date distribution
const { data: dates } = await sb.from('med_sessions').select('date').eq('year', '2026').not('date', 'is', null).order('date').limit(2000);
if (dates && dates.length) {
  const sorted = dates.map(d => d.date).sort();
  console.log(`earliest date: ${sorted[0]}, latest date: ${sorted[sorted.length - 1]}`);
  const unique = new Set(sorted);
  console.log(`unique dates: ${unique.size}`);
}

// Check distinct lct_cd count
const { data: lctCds } = await sb.from('med_sessions').select('lct_cd').eq('year', '2026').limit(10000);
if (lctCds) {
  const unique = new Set(lctCds.map(r => r.lct_cd));
  console.log(`distinct lct_cd (first 10000 rows): ${unique.size}`);
  console.log(`sample lct_cds: ${[...unique].slice(0, 10).join(', ')}`);
}

// Check: for a sample lct_cd that has rows — does it have date?
const { data: one } = await sb.from('med_sessions').select('lct_cd').eq('year', '2026').not('date', 'is', null).limit(1);
if (one?.[0]) {
  const lc = one[0].lct_cd;
  const { data: rows } = await sb.from('med_sessions').select('*').eq('year', '2026').eq('lct_cd', lc).limit(3);
  console.log(`sample rows for lct_cd=${lc}:`);
  console.log(JSON.stringify(rows, null, 2));
}
