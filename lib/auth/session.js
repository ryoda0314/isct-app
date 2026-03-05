import crypto from 'node:crypto';

// Session token held in server memory (single-user model)
let activeSessionToken = null;

// HMAC key - regenerated on each server start for forward secrecy
const HMAC_KEY = process.env.SESSION_SECRET
  || crypto.randomBytes(32).toString('hex');

export const COOKIE_NAME = 'campus_session';
export const COOKIE_MAX_AGE = 4 * 60 * 60; // 4h, matches token TTL

export function createSessionToken() {
  activeSessionToken = crypto.randomBytes(32).toString('hex');
  const sig = crypto.createHmac('sha256', HMAC_KEY)
    .update(activeSessionToken).digest('hex');
  return `${activeSessionToken}.${sig}`;
}

export function verifySession(cookieValue) {
  if (!cookieValue || !activeSessionToken) return false;
  const dot = cookieValue.indexOf('.');
  if (dot === -1) return false;
  const token = cookieValue.slice(0, dot);
  const sig = cookieValue.slice(dot + 1);
  if (!sig || !token) return false;
  const expected = crypto.createHmac('sha256', HMAC_KEY)
    .update(token).digest('hex');
  try {
    if (sig.length !== expected.length) return false;
    return crypto.timingSafeEqual(
      Buffer.from(sig, 'hex'),
      Buffer.from(expected, 'hex')
    ) && token === activeSessionToken;
  } catch {
    return false;
  }
}

export function destroySession() {
  activeSessionToken = null;
}

/** Helper to build Set-Cookie options for a response */
export function sessionCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge: COOKIE_MAX_AGE,
  };
}
