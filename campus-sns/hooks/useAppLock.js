import { useState, useEffect, useCallback, useRef } from "react";
import { Capacitor, registerPlugin } from "@capacitor/core";

const Biometric = Capacitor.isNativePlatform() ? registerPlugin("Biometric") : null;

const SK = {
  enabled: "appLock_enabled",
  pinHash: "appLock_pinHash",
  timeout: "appLock_timeout",
  biometric: "appLock_biometric",
};

export const TIMEOUT_OPTIONS = [
  { id: 0, label: "即時" },
  { id: 60, label: "1分後" },
  { id: 300, label: "5分後" },
  { id: 900, label: "15分後" },
];

const SALT = "isct_applock_v1_";

async function sha256(str) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
}

export function useAppLock() {
  const [locked, setLocked] = useState(false);
  const [enabled, setEnabledRaw] = useState(() => {
    try { return localStorage.getItem(SK.enabled) === "1"; } catch { return false; }
  });
  const [pinHash, setPinHashRaw] = useState(() => {
    try { return localStorage.getItem(SK.pinHash) || ""; } catch { return ""; }
  });
  const [timeout, setTimeoutRaw] = useState(() => {
    try { return Number(localStorage.getItem(SK.timeout)) || 0; } catch { return 0; }
  });
  const [biometricEnabled, setBiometricEnabledRaw] = useState(() => {
    try { return localStorage.getItem(SK.biometric) === "1"; } catch { return false; }
  });
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const bgRef = useRef(null);
  const pinSet = !!pinHash;

  // Check biometric availability on mount (native only)
  useEffect(() => {
    if (!Biometric) return;
    (async () => {
      try {
        const result = await Biometric.isAvailable();
        setBiometricAvailable(!!result.isAvailable);
      } catch (e) {
        console.error("Biometric.isAvailable error:", e);
        setBiometricAvailable(false);
      }
    })();
  }, []);

  const setEnabled = useCallback((v) => {
    setEnabledRaw(v);
    try { localStorage.setItem(SK.enabled, v ? "1" : "0"); } catch {}
    if (!v) setLocked(false);
  }, []);

  const setLockTimeout = useCallback((v) => {
    setTimeoutRaw(v);
    try { localStorage.setItem(SK.timeout, String(v)); } catch {}
  }, []);

  const setPin = useCallback(async (pin) => {
    const h = await sha256(SALT + pin);
    setPinHashRaw(h);
    try { localStorage.setItem(SK.pinHash, h); } catch {}
  }, []);

  const setBiometricEnabled = useCallback((v) => {
    setBiometricEnabledRaw(v);
    try { localStorage.setItem(SK.biometric, v ? "1" : "0"); } catch {}
  }, []);

  const verifyBiometric = useCallback(async () => {
    if (!Biometric) return false;
    try {
      await Biometric.verifyIdentity({ reason: "アプリのロックを解除" });
      setLocked(false);
      return true;
    } catch {
      return false;
    }
  }, []);

  const removePin = useCallback(() => {
    setPinHashRaw("");
    setEnabledRaw(false);
    setBiometricEnabledRaw(false);
    setLocked(false);
    try {
      localStorage.removeItem(SK.pinHash);
      localStorage.setItem(SK.enabled, "0");
      localStorage.removeItem(SK.biometric);
    } catch {}
  }, []);

  const verify = useCallback(async (pin) => {
    const h = await sha256(SALT + pin);
    if (h === pinHash) { setLocked(false); return true; }
    return false;
  }, [pinHash]);

  const lockNow = useCallback(() => {
    if (enabled && pinSet) setLocked(true);
  }, [enabled, pinSet]);

  // Capacitor pause/resume or visibilitychange fallback
  useEffect(() => {
    if (!enabled || !pinHash) return;
    const cleanup = { fn: null };
    let cancelled = false;

    (async () => {
      try {
        const { App } = await import("@capacitor/app");
        if (cancelled) return;
        const p = await App.addListener("pause", () => { bgRef.current = Date.now(); });
        const r = await App.addListener("resume", () => {
          if (!bgRef.current) return;
          const sec = (Date.now() - bgRef.current) / 1000;
          bgRef.current = null;
          if (sec >= timeout) setLocked(true);
        });
        cleanup.fn = () => { p.remove(); r.remove(); };
        if (cancelled) { cleanup.fn(); cleanup.fn = null; }
      } catch {
        if (cancelled) return;
        const h = () => {
          if (document.hidden) { bgRef.current = Date.now(); }
          else if (bgRef.current) {
            const sec = (Date.now() - bgRef.current) / 1000;
            bgRef.current = null;
            if (sec >= timeout) setLocked(true);
          }
        };
        document.addEventListener("visibilitychange", h);
        cleanup.fn = () => document.removeEventListener("visibilitychange", h);
        if (cancelled) { cleanup.fn(); cleanup.fn = null; }
      }
    })();

    return () => { cancelled = true; cleanup.fn?.(); };
  }, [enabled, pinHash, timeout]);

  return { locked, enabled, pinSet, timeout, biometricEnabled, biometricAvailable, setEnabled, setPin, removePin, verify, verifyBiometric, setBiometricEnabled, setLockTimeout, lockNow };
}
