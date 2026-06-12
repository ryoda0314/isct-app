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

// NOTE: ensurePlugin must NOT return the plugin proxy. A Capacitor plugin proxy
// is a thenable-looking object; returning it from an async fn makes `await`
// invoke its `.then`, which the bridge interprets as a native method call and
// rejects with `"Volume.then() is not implemented on ios"`. So we keep the
// proxy in a module variable and return nothing.
async function ensurePlugin() {
  if (loaded) return;
  loaded = true;
  if (!isNative()) return;
  try {
    const { registerPlugin } = await import('@capacitor/core');
    Volume = registerPlugin('Volume');
  } catch {
    Volume = null;
  }
}

/** Whether system-volume linking is available (native platform only). */
export function isNativeVolume() {
  return isNative();
}

/** Current system volume 0..1, or null if unavailable. */
export async function getSystemVolume() {
  await ensurePlugin();
  if (!Volume) return null;
  try {
    const r = await Volume.getVolume();
    return typeof r?.value === 'number' ? r.value : null;
  } catch {
    return null;
  }
}

/** Set the system volume (0..1). Returns true if the native call succeeded. */
export async function setSystemVolume(value) {
  await ensurePlugin();
  if (!Volume) return false;
  try {
    await Volume.setVolume({ value: Math.min(1, Math.max(0, Number(value) || 0)) });
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
  await ensurePlugin();
  if (!Volume) return () => {};
  try {
    const handle = await Volume.addListener('volumeChange', (e) => {
      if (e && typeof e.value === 'number') cb(e.value);
    });
    return () => { try { handle.remove(); } catch {} };
  } catch {
    return () => {};
  }
}
