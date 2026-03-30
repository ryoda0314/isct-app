import crypto from 'node:crypto';
import { promisify } from 'node:util';
import fs from 'node:fs/promises';
import path from 'node:path';
import { DATA_DIR, LOCAL_PASSPHRASE } from './config.js';
import { getSupabaseAdmin } from './supabase/server.js';

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

/** Encrypt data and return the payload JSON string */
async function encrypt(data) {
  const salt = crypto.randomBytes(32);
  const key = await deriveKey(LOCAL_PASSPHRASE, salt);
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  const plaintext = JSON.stringify(data);
  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');

  return JSON.stringify({
    v: 2,
    salt: salt.toString('hex'),
    iv: iv.toString('hex'),
    authTag,
    data: encrypted,
    kdf_iterations: PBKDF2_ITERATIONS,
  });
}

/** Decrypt a payload JSON string back to the original data */
async function decrypt(payloadStr) {
  const parsed = JSON.parse(payloadStr);

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

/* ── Supabase persistence (survives Vercel cold starts) ── */

async function saveToDb(loginId, payload) {
  try {
    const sb = getSupabaseAdmin();
    await sb.from('user_credentials').upsert({
      login_id: loginId,
      encrypted_payload: payload,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'login_id' });
  } catch (e) {
    console.error('[Credentials] DB save failed:', e.message);
  }
}

async function loadFromDb(loginId) {
  try {
    const sb = getSupabaseAdmin();
    const { data, error } = await sb
      .from('user_credentials')
      .select('encrypted_payload')
      .eq('login_id', loginId)
      .single();
    if (error || !data?.encrypted_payload) return null;
    return data.encrypted_payload;
  } catch {
    return null;
  }
}

async function deleteFromDb(loginId) {
  try {
    const sb = getSupabaseAdmin();
    await sb.from('user_credentials').delete().eq('login_id', loginId);
  } catch {}
}

/* ── Filesystem helpers ── */

async function saveToFile(filePath, payload) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(filePath, payload, 'utf8');
}

async function loadFromFile(filePath) {
  return await fs.readFile(filePath, 'utf8');
}

/* ── Public API ── */

export async function saveCredentials(loginId, { password, totpSecret, portalUserId, portalPassword, matrix }) {
  const fp = credPath(loginId);

  // Merge with existing credentials (preserve fields not being updated)
  let existing = {};
  try { existing = await loadCredentials(loginId); } catch {}

  const data = { ...existing, userId: loginId };
  if (password !== undefined) data.password = password;
  if (totpSecret !== undefined) data.totpSecret = totpSecret;
  if (portalUserId !== undefined) data.portalUserId = portalUserId;
  if (portalPassword !== undefined) data.portalPassword = portalPassword;
  if (matrix !== undefined) data.matrix = matrix;

  const payload = await encrypt(data);

  // Write to both filesystem and Supabase
  await withFileLock(fp, () => saveToFile(fp, payload));
  await saveToDb(loginId, payload);
}

export async function loadCredentials(loginId) {
  // 1. Try filesystem (fast, works when warm)
  try {
    const raw = await loadFromFile(credPath(loginId));
    return await decrypt(raw);
  } catch {}

  // 2. Try Supabase (survives cold starts)
  const dbPayload = await loadFromDb(loginId);
  if (dbPayload) {
    const data = await decrypt(dbPayload);
    // Re-cache to filesystem for next request
    try { await saveToFile(credPath(loginId), dbPayload); } catch {}
    return data;
  }

  throw new Error('Credentials not found for this user');
}

export async function hasCredentials(loginId) {
  // Filesystem check
  try { await fs.access(credPath(loginId)); return true; } catch {}
  // Supabase check
  const dbPayload = await loadFromDb(loginId);
  if (dbPayload) return true;
  return false;
}

export async function deleteCredentials(loginId) {
  try { await fs.unlink(credPath(loginId)); } catch {}
  await deleteFromDb(loginId);
}
