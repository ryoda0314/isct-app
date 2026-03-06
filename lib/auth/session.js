import crypto from 'node:crypto';

// Multi-session store: token -> { loginId, moodleUserId, createdAt }
const sessions = new Map();

const HMAC_KEY = process.env.SESSION_SECRET
  || crypto.randomBytes(32).toString('hex');

export const COOKIE_NAME = 'campus_session';
export const COOKIE_MAX_AGE = 30 * 24 * 60 * 60; // 30 days

// Periodic cleanup of expired sessions (every 10 minutes)
setInterval(() => {
  const now = Date.now();
  const maxAge = COOKIE_MAX_AGE * 1000;
  for (const [token, session] of sessions) {
    if (now - session.createdAt > maxAge) sessions.delete(token);
  }
}, 10 * 60 * 1000).unref();

/**
 * Create a signed session token and store the session.
 * @returns {string} signed cookie value
 */
export function createSessionToken(loginId, moodleUserId) {
  const token = crypto.randomBytes(32).toString('hex');
  const sig = crypto.createHmac('sha256', HMAC_KEY)
    .update(token).digest('hex');
  sessions.set(token, { loginId, moodleUserId, createdAt: Date.now() });
  return `${token}.${sig}`;
}

/**
 * Verify session cookie and return session data, or null if invalid.
 * @returns {{ loginId: string, moodleUserId: number } | null}
 */
export function verifySession(cookieValue) {
  if (!cookieValue) return null;
  const dot = cookieValue.indexOf('.');
  if (dot === -1) return null;
  const token = cookieValue.slice(0, dot);
  const sig = cookieValue.slice(dot + 1);
  if (!sig || !token) return null;
  const expected = crypto.createHmac('sha256', HMAC_KEY)
    .update(token).digest('hex');
  try {
    if (sig.length !== expected.length) return null;
    if (!crypto.timingSafeEqual(
      Buffer.from(sig, 'hex'),
      Buffer.from(expected, 'hex')
    )) return null;
  } catch {
    return null;
  }

  const session = sessions.get(token);
  if (!session) return null;

  if (Date.now() - session.createdAt > COOKIE_MAX_AGE * 1000) {
    sessions.delete(token);
    return null;
  }
  return session;
}

/** Destroy a specific session by cookie value */
export function destroySession(cookieValue) {
  if (!cookieValue) return;
  const dot = cookieValue.indexOf('.');
  if (dot === -1) return;
  sessions.delete(cookieValue.slice(0, dot));
}

/** Destroy all sessions for a given loginId */
export function destroyUserSessions(loginId) {
  for (const [token, session] of sessions) {
    if (session.loginId === loginId) sessions.delete(token);
  }
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge: COOKIE_MAX_AGE,
  };
}
