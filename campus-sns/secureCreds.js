/**
 * On-device credential storage (Keychain on iOS / Keystore on Android) via the
 * native `SecureCreds` plugin.
 *
 * Phase B: the credential bundle is stored locally and becomes the source of
 * truth, so the server no longer needs to hold the user's password/totpSecret.
 * See docs/ios-native/DEVICE_LINK.md for the bundle shape and native contract.
 *
 * Bundle shape (JSON):
 *   { userId, password, totpSecret, portalUserId, portalPassword, matrix, loginId, moodleUserId }
 *
 * On the web (non-native) every call is a no-op returning null/false.
 */

import { isNative } from './capacitor.js';

let SecureCreds = null;

async function ensurePlugin() {
  if (SecureCreds) return SecureCreds;
  if (!isNative()) return null;
  try {
    const { registerPlugin } = await import('@capacitor/core');
    SecureCreds = registerPlugin('SecureCreds');
  } catch {
    return null;
  }
  return SecureCreds;
}

export function isSecureCredsAvailable() {
  return isNative();
}

/** Persist the credential bundle to the device keychain. Returns true on success. */
export async function saveCredsBundle(bundle) {
  const plugin = await ensurePlugin();
  if (!plugin) return false;
  await plugin.save({ bundle: JSON.stringify(bundle) });
  return true;
}

/** Load the credential bundle, or null if none stored / not native. */
export async function loadCredsBundle() {
  const plugin = await ensurePlugin();
  if (!plugin) return null;
  const { bundle } = await plugin.load();
  if (!bundle) return null;
  try {
    return JSON.parse(bundle);
  } catch {
    return null;
  }
}

/** Remove the stored bundle (call on logout). */
export async function clearCreds() {
  const plugin = await ensurePlugin();
  if (!plugin) return false;
  await plugin.clear();
  return true;
}
