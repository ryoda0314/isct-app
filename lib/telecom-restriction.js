import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from './supabase/server.js';

let cached = null;
let cachedAt = 0;
const TTL = 30_000; // cache for 30 seconds

export async function isTelecomRestricted() {
  const now = Date.now();
  if (cached !== null && now - cachedAt < TTL) return cached;
  try {
    const sb = getSupabaseAdmin();
    const { data } = await sb.from('site_settings').select('value').eq('key', 'telecom_restriction').maybeSingle();
    cached = !!(data?.value?.enabled);
    cachedAt = now;
    return cached;
  } catch {
    return cached ?? false;
  }
}

export async function requireTelecomAllowed() {
  if (await isTelecomRestricted()) {
    return NextResponse.json(
      { error: 'この機能は電気通信事業の届出手続き中のため一時的に制限されています' },
      { status: 503 }
    );
  }
  return null;
}
