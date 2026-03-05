import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import { CRED_FILE, DATA_DIR, LOCAL_PASSPHRASE } from './config.js';

const ALGORITHM = 'aes-256-gcm';
const PBKDF2_ITERATIONS = 100_000;

function deriveKey(passphrase, salt) {
  return crypto.pbkdf2Sync(passphrase, salt, PBKDF2_ITERATIONS, 32, 'sha512');
}

export async function saveCredentials({ userId, password, totpSecret }) {
  const salt = crypto.randomBytes(32);
  const key = deriveKey(LOCAL_PASSPHRASE, salt);
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  const plaintext = JSON.stringify({ userId, password, totpSecret });
  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');

  const payload = JSON.stringify({
    v: 2,
    salt: salt.toString('hex'),
    iv: iv.toString('hex'),
    authTag,
    data: encrypted,
  });

  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(CRED_FILE, payload, 'utf8');
}

export async function loadCredentials() {
  const raw = await fs.readFile(CRED_FILE, 'utf8');
  const parsed = JSON.parse(raw);

  // Support both v1 (hardcoded salt) and v2 (random salt)
  const salt = parsed.salt
    ? Buffer.from(parsed.salt, 'hex')
    : Buffer.from('campus-sns-local-salt-v1');

  const key = deriveKey(LOCAL_PASSPHRASE, salt);
  const decipher = crypto.createDecipheriv(ALGORITHM, key, Buffer.from(parsed.iv, 'hex'));
  decipher.setAuthTag(Buffer.from(parsed.authTag, 'hex'));

  let decrypted = decipher.update(parsed.data, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return JSON.parse(decrypted);
}

export async function hasCredentials() {
  try {
    await fs.access(CRED_FILE);
    return true;
  } catch {
    return false;
  }
}

export async function deleteCredentials() {
  try {
    await fs.unlink(CRED_FILE);
  } catch {}
}