import { useState, useEffect } from 'react';
import { ME } from '../data.js';

let cached = null;
let listeners = new Set();

// localStorage に保存されたアバター設定を読み込む
function loadPref() {
  try {
    const v = localStorage.getItem("userPref");
    return v ? JSON.parse(v) : {};
  } catch { return {}; }
}

let pref = loadPref();

function notify() {
  listeners.forEach(fn => fn({ ...cached, ...pref }));
}

export function setCurrentUserFromAPI(d) {
  if (!d?.userid) return;
  cached = { ...ME, moodleId: d.userid, name: d.fullname || '', id: String(d.userid) };
  notify();
}

// アバター（av, col）などユーザー設定をローカルに保存・反映
export function updateUserPref(patch) {
  pref = { ...pref, ...patch };
  try { localStorage.setItem("userPref", JSON.stringify(pref)); } catch {}
  notify();
}

export function useCurrentUser(enabled = true) {
  const base = cached || ME;
  const [user, setUser] = useState({ ...base, ...pref });

  useEffect(() => {
    const handler = (u) => setUser(u);
    listeners.add(handler);
    if (cached) { handler({ ...cached, ...pref }); return () => listeners.delete(handler); }
    if (enabled) {
      (async () => {
        try {
          const r = await fetch('/api/auth/me');
          if (!r.ok) return;
          const d = await r.json();
          setCurrentUserFromAPI(d);
        } catch {}
      })();
    }
    return () => listeners.delete(handler);
  }, []);

  return user;
}
