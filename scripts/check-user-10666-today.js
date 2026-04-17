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
} catch {}

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// Check user_tokens table for all DEN_D + MED_T users
console.log('=== user_tokens for med/dental users ===');
const { data: medUsers } = await sb.from('profiles').select('moodle_id,name,dept,last_active_at').or('dept.eq.DEN_D,dept.eq.MED_T');
for (const u of medUsers) {
  const { data: tok } = await sb.from('user_tokens').select('moodle_user_id,updated_at,fullname').eq('moodle_user_id', u.moodle_id).maybeSingle();
  const tokStatus = tok ? `updated=${tok.updated_at}` : '(no token)';
  console.log(`  user=${u.moodle_id} ${u.dept} last_active=${u.last_active_at?.slice(0,16)} ${tokStatus}`);
}

// Compare with 理工学 users
console.log('\n=== user_tokens for 理工学 users (sample) ===');
const { data: sciUsers } = await sb.from('profiles').select('moodle_id,name,dept,last_active_at').not('dept', 'is', null).neq('dept', 'DEN_D').neq('dept', 'MED_T').order('last_active_at', { ascending: false }).limit(20);
for (const u of sciUsers) {
  const { data: tok } = await sb.from('user_tokens').select('moodle_user_id,updated_at,fullname').eq('moodle_user_id', u.moodle_id).maybeSingle();
  const tokStatus = tok ? `updated=${tok.updated_at}` : '(no token)';
  console.log(`  user=${u.moodle_id} ${u.dept} last_active=${u.last_active_at?.slice(0,16)} ${tokStatus}`);
}

// Schema of user_tokens
console.log('\n=== user_tokens table sample ===');
const { data: oneTok } = await sb.from('user_tokens').select('*').limit(1);
if (oneTok?.[0]) {
  console.log('columns:', Object.keys(oneTok[0]));
  const sample = {...oneTok[0]};
  if (sample.wstoken) sample.wstoken = sample.wstoken.slice(0,8) + '...';
  console.log(JSON.stringify(sample, null, 2));
}
