/**
 * On-device TOTP generation (RFC 6238) using Web Crypto.
 *
 * Lets the device generate the 2FA code from a locally-stored `totpSecret`
 * without asking the server (which is the whole point of moving credentials
 * off the server). Matches the server's otplib defaults:
 *   algorithm SHA-1, 6 digits, 30s step, base32 (RFC 4648, no padding) secret.
 *
 * Dependency-free: uses crypto.subtle, available in the Capacitor WebView and
 * all modern browsers.
 */

/** Decode an RFC 4648 base32 string (case-insensitive, padding optional). */
function base32Decode(input) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const clean = String(input).toUpperCase().replace(/=+$/, '').replace(/\s/g, '');
  let bits = 0;
  let value = 0;
  const out = [];
  for (const ch of clean) {
    const idx = alphabet.indexOf(ch);
    if (idx === -1) continue; // skip stray chars
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      out.push((value >>> bits) & 0xff);
    }
  }
  return new Uint8Array(out);
}

/**
 * Generate the current TOTP code for a base32 secret.
 * @param {string} secret base32-encoded shared secret
 * @param {object} [opts] { digits=6, step=30, t0=0, timeMs=Date.now() }
 * @returns {Promise<string>} zero-padded numeric code
 */
export async function generateTOTP(secret, opts = {}) {
  const { digits = 6, step = 30, t0 = 0, timeMs = Date.now() } = opts;

  const key = base32Decode(secret);
  if (!key.length) throw new Error('Invalid TOTP secret');

  const counter = Math.floor((Math.floor(timeMs / 1000) - t0) / step);

  // 8-byte big-endian counter.
  const msg = new Uint8Array(8);
  let c = counter;
  for (let i = 7; i >= 0; i--) {
    msg[i] = c & 0xff;
    c = Math.floor(c / 256);
  }

  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    key,
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign']
  );
  const hmac = new Uint8Array(await crypto.subtle.sign('HMAC', cryptoKey, msg));

  // Dynamic truncation (RFC 4226).
  const offset = hmac[hmac.length - 1] & 0x0f;
  const bin =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);

  const code = (bin % 10 ** digits).toString().padStart(digits, '0');
  return code;
}
