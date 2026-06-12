/**
 * System Volume — Native Capacitor Plugin Bridge
 *
 * Two-way link between the in-app music volume and the device system volume.
 * iOS WKWebView ignores HTMLAudioElement.volume, so on device the in-app
 * slider must go through this native plugin instead.
 *
 *   getSystemVolume()        -> current system volume (0..1) or null
 *   setSystemVolume(value)   -> set system volume (drives MPVolumeView)
 *   onSystemVolumeChange(cb) -> subscribe to hardware/Control-Center changes
 *
 * On web (or if the native plugin is missing) every call is a safe no-op.
 *
 * Native side: docs/ios-native/VolumePlugin.swift  (jsName "Volume")
 */

import { isNative } from '../capacitor.js';

let Volume = null;
let loaded = false;

async function ensurePlugin() {
  if (loaded) return Volume;
  loaded = true;
  if (!isNative()) return null;
  try {
    const { registerPlugin } = await import('@capacitor/core');
    // NOTE: do not return the proxy from an async fn (its .then is intercepted)
    Volume = registerPlugin('Volume');
  } catch {
    Volume = null;
  }
  return Volume;
}

/** Whether system-volume linking is available (native platform only). */
export function isNativeVolume() {
  return isNative();
}

/** Current system volume 0..1, or null if unavailable. */
export async function getSystemVolume() {
  const p = await ensurePlugin();
  if (!p) return null;
  try {
    const r = await p.getVolume();
    return typeof r?.value === 'number' ? r.value : null;
  } catch {
    return null;
  }
}

/** Set the system volume (0..1). Returns true if the native call succeeded. */
export async function setSystemVolume(value) {
  const p = await ensurePlugin();
  if (!p) return false;
  try {
    await p.setVolume({ value: Math.min(1, Math.max(0, Number(value) || 0)) });
    return true;
  } catch {
    return false;
  }
}

/**
 * Subscribe to system volume changes (volume buttons / Control Center / our
 * own writes). cb receives a number 0..1. Returns an async-safe unsubscribe.
 */
export async function onSystemVolumeChange(cb) {
  const p = await ensurePlugin();
  if (!p) return () => {};
  try {
    const handle = await p.addListener('volumeChange', (e) => {
      if (e && typeof e.value === 'number') cb(e.value);
    });
    return () => { try { handle.remove(); } catch {} };
  } catch {
    return () => {};
  }
}
