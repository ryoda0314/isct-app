import { useState, useEffect, useCallback } from 'react';
import { ME } from '../data.js';

let cached = null;
let listeners = new Set();

function notify() {
  listeners.forEach(fn => fn(cached));
}

export function setCurrentUserFromAPI(d) {
  if (!d?.userid) return;
  cached = { ...ME, moodleId: d.userid, name: d.fullname || '', id: String(d.userid) };
  notify();
}

export function useCurrentUser() {
  const [user, setUser] = useState(cached || ME);

  useEffect(() => {
    listeners.add(setUser);
    if (cached) { setUser(cached); return () => listeners.delete(setUser); }
    (async () => {
      try {
        const r = await fetch('/api/auth/me');
        if (!r.ok) return;
        const d = await r.json();
        setCurrentUserFromAPI(d);
      } catch {}
    })();
    return () => listeners.delete(setUser);
  }, []);

  return user;
}
