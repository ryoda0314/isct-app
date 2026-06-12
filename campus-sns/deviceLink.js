/**
 * Cross-device credential linking (QR + ephemeral sealed box).
 *
 * A fully set-up "trusted" device (A) transfers its locally-stored credentials
 * to a fresh device (B) WITHOUT the server ever seeing plaintext. The server is
 * a dumb relay (see /api/device-link + supabase/device-link.sql).
 *
 *   B (new):     begin() → show QR{linkId,pub} → poll → complete(ciphertext)
 *   A (trusted): scan QR → seal(pub) → POST ciphertext
 *
 * The Curve25519 keypair and the credential Keychain/Keystore I/O live entirely
 * in the native `DeviceLink` plugin — private keys and plaintext never enter JS.
 * See docs/ios-native/DEVICE_LINK.md for the native contract.
 */

import { isNative } from './capacitor.js';

let DeviceLink = null;

async function ensurePlugin() {
  if (DeviceLink) return DeviceLink;
  if (!isNative()) return null;
  try {
    const { registerPlugin } = await import('@capacitor/core');
    DeviceLink = registerPlugin('DeviceLink');
  } catch {
    return null;
  }
  return DeviceLink;
}

export function isDeviceLinkAvailable() {
  return isNative();
}

// ─────────────────────────── New device (B) ───────────────────────────

/**
 * Begin linking on a fresh device. Generates the ephemeral keypair + link id
 * (native; private key stays on-device) and returns the QR payload to display.
 * @returns {Promise<{ linkId: string, pub: string, qrPayload: string }>}
 */
export async function startLinkAsNewDevice() {
  const plugin = await ensurePlugin();
  if (!plugin) throw new Error('Device linking requires the native app');
  const { linkId, pub } = await plugin.begin();
  const qrPayload = JSON.stringify({ v: 1, t: 'sciencetokyo-link', linkId, pub });
  return { linkId, pub, qrPayload };
}

/**
 * Poll the relay until the trusted device uploads the sealed bundle, then have
 * the native side decrypt it and store the credentials in the Keychain/Keystore.
 * @returns {Promise<boolean>} true once imported
 */
export async function awaitLinkedCredentials(linkId, { timeoutMs = 180000, intervalMs = 2000, signal } = {}) {
  const plugin = await ensurePlugin();
  if (!plugin) throw new Error('Device linking requires the native app');

  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (signal?.aborted) throw new Error('aborted');
    const r = await fetch(`/api/device-link?linkId=${encodeURIComponent(linkId)}`, { signal });
    if (r.status === 410) throw new Error('link expired');
    if (r.ok) {
      const d = await r.json();
      if (d.status === 'sealed' && d.ciphertext) {
        await plugin.complete({ ciphertext: d.ciphertext }); // decrypt + persist to Keychain
        return true;
      }
    }
    await new Promise(res => setTimeout(res, intervalMs));
  }
  throw new Error('link timed out');
}

// ───────────────────────── Trusted device (A) ─────────────────────────

/** Parse a scanned QR payload; returns { linkId, pub } or null if not ours. */
export function parseLinkPayload(raw) {
  try {
    const d = JSON.parse(raw);
    if (d && d.t === 'sciencetokyo-link' && d.linkId && d.pub) {
      return { linkId: d.linkId, pub: d.pub };
    }
  } catch {}
  return null;
}

/**
 * Approve a scanned link: seal this device's stored credentials to the new
 * device's public key (native) and upload the ciphertext to the relay.
 * Requires an authenticated session on this device.
 */
export async function approveLink({ linkId, pub }) {
  const plugin = await ensurePlugin();
  if (!plugin) throw new Error('Device linking requires the native app');

  const { ciphertext } = await plugin.seal({ recipientPub: pub }); // reads Keychain + seals
  const r = await fetch('/api/device-link', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-app-platform': 'capacitor' },
    body: JSON.stringify({ linkId, recipientPub: pub, ciphertext }),
  });
  if (!r.ok) throw new Error(`device-link upload failed: ${r.status}`);
  return true;
}
