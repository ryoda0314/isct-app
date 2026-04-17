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

// Get user 10666's lct_cds from latest capture
const { data: caps } = await sb.from('moodle_capture')
  .select('raw_courses')
  .eq('moodle_user_id', 10666)
  .order('captured_at', { ascending: false })
  .limit(1);

const raw = caps?.[0]?.raw_courses || [];
const lctCds = raw.map(c => c.fullname?.match(/【(\d{6})】/)?.[1]).filter(Boolean);
console.log(`user 10666 enrolled lct_cds (${lctCds.length}): ${lctCds.join(', ')}`);

// Check which are in med_sessions (year=2026)
const { data: sessions } = await sb.from('med_sessions')
  .select('lct_cd,name,faculty')
  .in('lct_cd', lctCds)
  .eq('year', '2026');

const foundLctCds = new Set((sessions || []).map(s => s.lct_cd));
const missing = lctCds.filter(l => !foundLctCds.has(l));

console.log(`\nmatched in med_sessions year=2026: ${foundLctCds.size} / ${lctCds.length}`);
console.log(`missing lct_cds: ${missing.join(', ')}`);

// Show what's found
const byLct = {};
for (const s of sessions || []) {
  if (!byLct[s.lct_cd]) byLct[s.lct_cd] = { name: s.name, faculty: s.faculty, count: 0 };
  byLct[s.lct_cd].count++;
}
console.log('\nmatched courses:');
for (const [lct, info] of Object.entries(byLct)) {
  console.log(`  ${lct} (${info.faculty}): "${info.name}" sessions=${info.count}`);
}

// For missing ones, check if they exist in ANY year
console.log('\nmissing lct_cds checked across all years:');
for (const lct of missing.slice(0, 10)) {
  const { data: anyYear } = await sb.from('med_sessions').select('year,faculty,name').eq('lct_cd', lct).limit(5);
  console.log(`  ${lct}: ${anyYear?.length || 0} rows -- ${JSON.stringify(anyYear?.slice(0,2) || [])}`);
}
