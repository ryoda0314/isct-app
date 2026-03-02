import os from 'node:os';
import crypto from 'node:crypto';
import path from 'node:path';

// Machine-local passphrase for credential encryption
export const LOCAL_PASSPHRASE = crypto
  .createHash('sha256')
  .update(`${os.hostname()}:${os.userInfo().username}:campus-sns-v1`)
  .digest('hex');

// File paths (relative to project root)
export const DATA_DIR = path.join(process.cwd(), 'data');
export const CRED_FILE = path.join(DATA_DIR, 'credentials.enc');

// LMS (Moodle) endpoints — formerly T2SCHOLA, now ISCT LMS
// The LMS uses a year-based path prefix (e.g. /2025)
export const LMS_YEAR = '2025';
export const LMS_BASE = `https://lms.s.isct.ac.jp/${LMS_YEAR}`;
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
