import crypto from 'node:crypto';
import { promisify } from 'node:util';
import fs from 'node:fs/promises';
import path from 'node:path';
import { CRED_FILE, DATA_DIR, LOCAL_PASSPHRASE } from './config.js';

const pbkdf2 = promisify(crypto.pbkdf2);

const ALGORITHM = 'aes-256-gcm';
const PBKDF2_ITERATIONS = 600_000;

function deriveKey(passphrase, salt, iterations = PBKDF2_ITERATIONS) {
  return pbkdf2(passphrase, salt, iterations, 32, 'sha512');
}

/** Per-user credential file path */
function credPath(loginId) {
  const safe = loginId.replace(/[^a-zA-Z0-9_-]/g, '_');
  return path.join(DATA_DIR, `cred-${safe}.enc`);
}

// Per-file write lock to prevent concurrent write corruption
const writeLocks = new Map();
async function withFileLock(filePath, fn) {
  while (writeLocks.has(filePath)) await writeLocks.get(filePath);
  let resolve;
  writeLocks.set(filePath, new Promise(r => { resolve = r; }));
  try { return await fn(); } finally { writeLocks.delete(filePath); resolve(); }
}

async function encryptAndSave(filePath, data) {
  const salt = crypto.randomBytes(32);
  const key = await deriveKey(LOCAL_PASSPHRASE, salt);
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  const plaintext = JSON.stringify(data);
  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');

  const payload = JSON.stringify({
    v: 2,
    salt: salt.toString('hex'),
    iv: iv.toString('hex'),
    authTag,
    data: encrypted,
    kdf_iterations: PBKDF2_ITERATIONS,
  });

  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(filePath, payload, 'utf8');
}

async function decryptFromFile(filePath) {
  const raw = await fs.readFile(filePath, 'utf8');
  const parsed = JSON.parse(raw);

  const salt = parsed.salt
    ? Buffer.from(parsed.salt, 'hex')
    : Buffer.from('campus-sns-local-salt-v1');

  const iterations = parsed.kdf_iterations || 100_000;
  const key = await deriveKey(LOCAL_PASSPHRASE, salt, iterations);
  const decipher = crypto.createDecipheriv(ALGORITHM, key, Buffer.from(parsed.iv, 'hex'));
  decipher.setAuthTag(Buffer.from(parsed.authTag, 'hex'));

  let decrypted = decipher.update(parsed.data, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return JSON.parse(decrypted);
}

export async function saveCredentials(loginId, { password, totpSecret }) {
  const fp = credPath(loginId);
  await withFileLock(fp, () => encryptAndSave(fp, { userId: loginId, password, totpSecret }));
}

export async function loadCredentials(loginId) {
  // Per-user file first
  try { return await decryptFromFile(credPath(loginId)); } catch {}
  // Fall back to legacy single-user file, but verify loginId matches
  const legacy = await decryptFromFile(CRED_FILE);
  if (legacy.userId !== loginId) {
    throw new Error('Credentials not found for this user');
  }
  return legacy;
}

export async function hasCredentials(loginId) {
  try { await fs.access(credPath(loginId)); return true; } catch {}
  // Legacy file: only count it if loginId matches the stored userId
  try {
    const legacy = await decryptFromFile(CRED_FILE);
    return legacy.userId === loginId;
  } catch {}
  return false;
}

export async function deleteCredentials(loginId) {
  try { await fs.unlink(credPath(loginId)); } catch {}
}
