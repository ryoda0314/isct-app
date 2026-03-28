import crypto from 'node:crypto';
import { LOCAL_PASSPHRASE } from '../config.js';

// Stable HMAC key derived from LOCAL_PASSPHRASE (persists across restarts)
const HMAC_KEY = crypto.createHash('sha256')
  .update(`session:${LOCAL_PASSPHRASE}`)
  .digest();

export const COOKIE_NAME = 'campus_session';
export const COOKIE_MAX_AGE = 90 * 24 * 60 * 60; // 90 days

/**
 * Create a stateless signed session cookie.
 * Cookie = base64url(payload).hmac_signature
 */
export function createSessionToken(loginId, moodleUserId) {
  const payload = JSON.stringify({ loginId, moodleUserId, c: Date.now() });
  const b64 = Buffer.from(payload).toString('base64url');
  const sig = crypto.createHmac('sha256', HMAC_KEY)
    .update(b64).digest('hex');
  return `${b64}.${sig}`;
}

/**
 * Verify session cookie and return session data, or null if invalid/expired.
 */
export function verifySession(cookieValue) {
  if (!cookieValue) return null;
  const dot = cookieValue.indexOf('.');
  if (dot === -1) return null;
  const b64 = cookieValue.slice(0, dot);
  const sig = cookieValue.slice(dot + 1);
  if (!b64 || !sig) return null;

  const expected = crypto.createHmac('sha256', HMAC_KEY)
    .update(b64).digest('hex');
  try {
    if (sig.length !== expected.length) return null;
    if (!crypto.timingSafeEqual(
      Buffer.from(sig, 'hex'),
      Buffer.from(expected, 'hex')
    )) return null;
  } catch {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(b64, 'base64url').toString());
    if (!payload.loginId) return null;
    if (Date.now() - payload.c > COOKIE_MAX_AGE * 1000) return null;
    return { loginId: payload.loginId, moodleUserId: payload.moodleUserId };
  } catch {
    return null;
  }
}

/** No-op for stateless cookies (client deletes by clearing cookie) */
export function destroySession() {}

/** No-op — credential deletion already prevents re-auth via requireAuth */
export function destroyUserSessions() {}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge: COOKIE_MAX_AGE,
  };
}
