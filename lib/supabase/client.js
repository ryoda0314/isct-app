import { createClient } from '@supabase/supabase-js';

let client = null;

export function getSupabaseClient() {
  if (client) return client;
  client = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { realtime: { params: { eventsPerSecond: 10 } } }
  );
  return client;
}
