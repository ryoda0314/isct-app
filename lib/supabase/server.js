import { createClient } from '@supabase/supabase-js';

let client = null;

export function getSupabaseAdmin() {
  if (client) return client;
  client = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
  return client;
}
