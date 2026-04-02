import { useState, useEffect, useCallback } from 'react';
import { isDemoMode } from '../demoMode.js';

export function useMutes(enabled = true) {
  const [mutes, setMutes] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchMutes = useCallback(async () => {
    if (isDemoMode()) { setLoading(false); return; }
    try {
      const r = await fetch('/api/mutes');
      if (r.ok) setMutes(await r.json());
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { if (enabled) fetchMutes(); }, [fetchMutes, enabled]);

  const muteUser = useCallback(async (muted_id) => {
    try {
      const r = await fetch('/api/mutes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ muted_id }),
      });
      if (r.ok) fetchMutes();
    } catch {}
  }, [fetchMutes]);

  const unmuteUser = useCallback(async (muted_id) => {
    try {
      const r = await fetch('/api/mutes', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ muted_id }),
      });
      if (r.ok) setMutes(prev => prev.filter(m => m.muted_id !== muted_id));
    } catch {}
  }, []);

  const isMuted = useCallback((userId) => {
    return mutes.some(m => m.muted_id === userId);
  }, [mutes]);

  return { mutes, loading, muteUser, unmuteUser, isMuted, refetch: fetchMutes };
}
