import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import { CRED_FILE, DATA_DIR, LOCAL_PASSPHRASE } from './config.js';

const ALGORITHM = 'aes-256-gcm';
const PBKDF2_ITERATIONS = 100_000;
const SALT = Buffer.from('campus-sns-local-salt-v1');

function deriveKey(passphrase) {
  return crypto.pbkdf2Sync(passphrase, SALT, PBKDF2_ITERATIONS, 32, 'sha512');
}

export async function saveCredentials({ userId, password, totpSecret }) {
  const key = deriveKey(LOCAL_PASSPHRASE);
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  const plaintext = JSON.stringify({ userId, password, totpSecret });
  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');

  const payload = JSON.stringify({ iv: iv.toString('hex'), authTag, data: encrypted });

  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(CRED_FILE, payload, 'utf8');
}

export async function loadCredentials() {
  const raw = await fs.readFile(CRED_FILE, 'utf8');
  const { iv, authTag, data } = JSON.parse(raw);

  const key = deriveKey(LOCAL_PASSPHRASE);
  const decipher = crypto.createDecipheriv(ALGORITHM, key, Buffer.from(iv, 'hex'));
  decipher.setAuthTag(Buffer.from(authTag, 'hex'));

  let decrypted = decipher.update(data, 'hex', 'utf8');
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
