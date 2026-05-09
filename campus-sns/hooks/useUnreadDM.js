import { useState, useEffect, useCallback } from 'react';
import { getSupabaseClient } from '../../lib/supabase/client.js';
import { isDemoMode } from '../demoMode.js';

const KEY = 'dm_last_seen';
const getSeen = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; } };
const saveSeen = (d) => { try { localStorage.setItem(KEY, JSON.stringify(d)); } catch {} };

export function useUnreadDM(userId) {
  const [count, setCount] = useState(0);

  const refetch = useCallback(async () => {
    if (!userId || isDemoMode()) return;
    try {
      const r = await fetch('/api/dm');
      if (!r.ok) return;
      const convos = await r.json();
      const seen = getSeen();
      let total = 0;
      for (const c of convos) {
        if (!c.msgs?.length) continue;
        const last = c.msgs[c.msgs.length - 1];
        const msgTs = new Date(last.ts).getTime();
        const seenTs = seen[c.id] || 0;
        if (msgTs > seenTs && last.uid !== userId) total++;
      }
      setCount(total);
    } catch {}
  }, [userId]);

  // Initial fetch
  useEffect(() => { refetch(); }, [refetch]);

  // Realtime: refetch unread count on every dm_messages INSERT.
  // We deliberately do NOT read payload.new here — count is recomputed via the
  // server endpoint which applies block/mute filters and (via RLS) limits rows
  // to the current user's conversations.
  useEffect(() => {
    if (!userId || isDemoMode()) return;
    const sb = getSupabaseClient();
    const channel = sb
      .channel(`dm_unread:${userId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'dm_messages',
      }, () => { refetch(); })
      .subscribe();
    return () => { sb.removeChannel(channel); };
  }, [userId, refetch]);

  // Fallback poll every 60s in case realtime drops (e.g., tab backgrounded then resumed)
  useEffect(() => {
    if (!userId || isDemoMode()) return;
    const interval = setInterval(refetch, 60_000);
    return () => clearInterval(interval);
  }, [userId, refetch]);

  const markSeen = useCallback((convId) => {
    const seen = getSeen();
    seen[convId] = Date.now();
    saveSeen(seen);
    setCount(prev => Math.max(0, prev - 1));
  }, []);

  return { unreadDM: count, markDMSeen: markSeen };
}
