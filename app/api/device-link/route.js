import { NextResponse } from 'next/server';
import { requireAuth } from '../../../lib/auth/require-auth.js';
import { getSupabaseAdmin } from '../../../lib/supabase/server.js';

/**
 * Device-linking relay. The server is a dumb relay for a sealed-box ciphertext
 * encrypted to the NEW device's ephemeral public key — it cannot decrypt it.
 * See supabase/device-link.sql for the full flow.
 *
 * POST  — trusted device A (authenticated) uploads the sealed ciphertext.
 *         body: { linkId, recipientPub, ciphertext }
 * GET    — new device B (unauthenticated) polls by link_id; first hit consumes
 *         the row. ?linkId=... → { status: 'sealed', ciphertext } | { status: 'pending' }
 */

const LINK_ID_RE = /^[A-Za-z0-9_-]{32,128}$/;        // base64url, high-entropy
const MAX_CIPHERTEXT = 8192;                          // generous; bundle is small
const MAX_PUB = 256;

export async function POST(request) {
  // Only a fully authenticated device may hand off credentials.
  const auth = await requireAuth(request);
  if (auth.error) return auth.error;

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  const { linkId, recipientPub, ciphertext } = body || {};
  if (typeof linkId !== 'string' || !LINK_ID_RE.test(linkId)) {
    return NextResponse.json({ error: 'Invalid linkId' }, { status: 400 });
  }
  if (typeof recipientPub !== 'string' || recipientPub.length === 0 || recipientPub.length > MAX_PUB) {
    return NextResponse.json({ error: 'Invalid recipientPub' }, { status: 400 });
  }
  if (typeof ciphertext !== 'string' || ciphertext.length === 0 || ciphertext.length > MAX_CIPHERTEXT) {
    return NextResponse.json({ error: 'Invalid ciphertext' }, { status: 400 });
  }

  try {
    const sb = getSupabaseAdmin();
    // Opportunistic cleanup of expired rows (no cron dependency).
    await sb.from('device_link').delete().lt('expires_at', new Date().toISOString());

    const { error } = await sb.from('device_link').upsert({
      link_id: linkId,
      recipient_pub: recipientPub,
      ciphertext,
      created_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 3 * 60 * 1000).toISOString(),
    }, { onConflict: 'link_id' });
    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error('[DeviceLink] POST error:', e.message);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

export async function GET(request) {
  // Unauthenticated: B has no session yet. Safe because the ciphertext is
  // useless without B's ephemeral private key, link_id is high-entropy, and
  // the row is single-use + short-lived.
  const linkId = new URL(request.url).searchParams.get('linkId');
  if (!linkId || !LINK_ID_RE.test(linkId)) {
    return NextResponse.json({ error: 'Invalid linkId' }, { status: 400 });
  }

  try {
    const sb = getSupabaseAdmin();
    const { data, error } = await sb
      .from('device_link')
      .select('ciphertext, recipient_pub, expires_at')
      .eq('link_id', linkId)
      .maybeSingle();
    if (error) throw error;

    if (!data) {
      return NextResponse.json({ status: 'pending' });
    }
    if (new Date(data.expires_at).getTime() < Date.now()) {
      await sb.from('device_link').delete().eq('link_id', linkId);
      return NextResponse.json({ status: 'expired' }, { status: 410 });
    }

    // Single use: consume on first successful read.
    await sb.from('device_link').delete().eq('link_id', linkId);
    return NextResponse.json({
      status: 'sealed',
      ciphertext: data.ciphertext,
      recipientPub: data.recipient_pub,
    });
  } catch (e) {
    console.error('[DeviceLink] GET error:', e.message);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
