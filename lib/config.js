import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

// File paths — use /tmp on serverless (Vercel) since the filesystem is read-only
const isVercel = !!process.env.VERCEL;
export const DATA_DIR = isVercel ? '/tmp' : path.join(process.cwd(), 'data');

// H6: Passphrase for credential encryption
// Prefer CRED_SECRET env var; fall back to persisted random key for new installs
export const LOCAL_PASSPHRASE = (() => {
  if (process.env.CRED_SECRET) return process.env.CRED_SECRET;

  const secretFile = path.join(DATA_DIR, '.cred-secret');

  // Try persisted random secret
  try {
    const saved = fs.readFileSync(secretFile, 'utf8').trim();
    if (saved) return saved;
  } catch {}

  // Fresh install → generate and persist random secret
  const secret = crypto.randomBytes(32).toString('hex');
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(secretFile, secret, { mode: 0o600 });
  } catch {}
  return secret;
})();

// LMS (Moodle) endpoints — formerly T2SCHOLA, now ISCT LMS
// The LMS uses a year-based path prefix (e.g. /2025)
export const LMS_YEAR = '2025';
export const LMS_BASE = `https://lms.s.isct.ac.jp/${LMS_YEAR}`;

// Syllabus DB uses the current academic year (may differ from LMS)
export const SYLLABUS_YEAR = '2026';
export const LMS_API = `${LMS_BASE}/webservice/rest/server.php`;
export const LMS_TOKEN_URL = `${LMS_BASE}/login/token.php`;
export const LMS_LOGIN_URL = `${LMS_BASE}/login/index.php`;
export const LMS_MOBILE_LAUNCH = `${LMS_BASE}/admin/tool/mobile/launch.php`;

// Backward compat aliases (to be removed)
export const T2SCHOLA_BASE = LMS_BASE;
export const T2SCHOLA_API = LMS_API;
export const T2SCHOLA_TOKEN_URL = LMS_TOKEN_URL;
export const T2SCHOLA_LOGIN_URL = LMS_LOGIN_URL;
export const T2SCHOLA_MOBILE_LAUNCH = LMS_MOBILE_LAUNCH;

// ISCT Portal / Extic
export const PORTAL_URL = 'https://portal.isct.ac.jp';

// Moodle web service name
export const MOODLE_SERVICE = 'moodle_mobile_app';
