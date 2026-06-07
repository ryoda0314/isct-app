import { createClient } from '@supabase/supabase-js';

let client = null;

// Hard timeout for every DB request. Without this, a slow/throttled database
// (e.g. Supabase Nano disk-IO budget depletion) makes queries hang for 20–30s+,
// which freezes API routes and the app's startup (infinite splash screen).
// Failing fast lets routes return an error and callers fall back gracefully.
const SUPABASE_FETCH_TIMEOUT = 8000;
function fetchWithTimeout(input, init = {}) {
  const timeout = AbortSignal.timeout(SUPABASE_FETCH_TIMEOUT);
  // Respect any caller-provided signal (e.g. supabase-js .abortSignal()).
  const signal = init.signal && typeof AbortSignal.any === 'function'
    ? AbortSignal.any([init.signal, timeout])
    : (init.signal || timeout);
  return fetch(input, { ...init, signal });
}

export function getSupabaseAdmin() {
  if (client) return client;
  client = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { global: { fetch: fetchWithTimeout } }
  );
  return client;
}
