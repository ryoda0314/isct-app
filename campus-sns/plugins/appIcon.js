/**
 * App Icon — Native Capacitor Plugin Bridge
 *
 * Lets the user switch the home-screen app icon from inside the app.
 * iOS only; on web (or if the native plugin is missing) every call is a
 * safe no-op and isAppIconSupported() resolves false.
 *
 *   isAppIconSupported() -> boolean (alternate icons available on this device)
 *   getAppIcon()         -> current icon name, or "default" for the primary icon
 *   setAppIcon(name)     -> switch icon ("default"/null restores the primary icon)
 *
 * Native side: docs/ios-native/AppIconPlugin.swift  (jsName "AppIcon")
 * Alternate icons are bundled as asset-catalog App Icon sets and listed in the
 * App target build setting ASSETCATALOG_COMPILER_ALTERNATE_APPICON_NAMES.
 */

import { isNative } from '../capacitor.js';

/**
 * Selectable icons. `name` must match the asset-catalog set / build-setting
 * name on the native side; `thumb` is served by the web app (public/app-icons/).
 * `name: "default"` maps to the primary icon (setAlternateIconName(nil)).
 */
export const APP_ICONS = [
  { name: 'default',     label: 'デフォルト', thumb: '/app-icons/default.png' },
  { name: 'IconPurple',  label: '紫',         thumb: '/app-icons/purple.png' },
  { name: 'IconGreen',   label: '緑',         thumb: '/app-icons/green.png' },
  { name: 'IconOrange',  label: 'オレンジ',   thumb: '/app-icons/orange.png' },
  { name: 'IconBlue',    label: '青',         thumb: '/app-icons/blue.png' },
  { name: 'IconPastel',  label: 'パステル',   thumb: '/app-icons/pastel.png' },
  { name: 'IconBlack',   label: 'ブラック',   thumb: '/app-icons/black.png' },
  { name: 'IconMagenta', label: 'マゼンタ',   thumb: '/app-icons/magenta.png' },
  { name: 'IconRed',     label: '赤',         thumb: '/app-icons/red.png' },
  { name: 'IconPink',    label: 'ピンク',     thumb: '/app-icons/pink.png' },
];

let AppIcon = null;
let initPromise = null;

// See systemVolume.js: ensurePlugin must not return the plugin proxy (awaiting a
// proxy triggers a spurious native ".then()" call), and we cache the in-flight
// init Promise so concurrent callers all wait for the same registration.
function ensurePlugin() {
  if (AppIcon) return Promise.resolve();
  if (initPromise) return initPromise;
  initPromise = (async () => {
    if (!isNative()) { initPromise = null; return; }
    try {
      const { registerPlugin } = await import('@capacitor/core');
      AppIcon = registerPlugin('AppIcon');
    } catch {
      AppIcon = null;
      initPromise = null;
    }
  })();
  return initPromise;
}

/** Whether alternate app icons are available (native iOS that supports them). */
export async function isAppIconSupported() {
  await ensurePlugin();
  if (!AppIcon) return false;
  try {
    const r = await AppIcon.isSupported();
    return !!r?.supported;
  } catch {
    return false;
  }
}

/** Current icon name. Returns "default" when the primary icon is active. */
export async function getAppIcon() {
  await ensurePlugin();
  if (!AppIcon) return 'default';
  try {
    const r = await AppIcon.getIcon();
    return r?.name || 'default';
  } catch {
    return 'default';
  }
}

/**
 * Switch the home-screen icon. Pass an APP_ICONS name, or "default"/null to
 * restore the primary icon. Returns true on success.
 *
 * NOTE: iOS shows an unavoidable system alert ("You have changed the icon…")
 * after the switch — there is no public API to suppress it.
 */
export async function setAppIcon(name) {
  await ensurePlugin();
  if (!AppIcon) return false;
  try {
    await AppIcon.setIcon({ name: name == null ? 'default' : String(name) });
    return true;
  } catch {
    return false;
  }
}
