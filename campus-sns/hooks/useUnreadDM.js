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

  // Realtime: server emits a content-free broadcast ping on `dm_unread:<userId>`
  // after any DM involving this user is inserted (see lib/realtime.js). On ping
  // we recompute the count via the server endpoint, which applies block/mute
  // filters and only returns this user's conversations.
  // NOTE: Broadcast, not postgres_changes — anon cannot SELECT dm_messages under
  // RLS, so postgres_changes never fires and the badge would only update on the
  // 60s poll below.
  useEffect(() => {
    if (!userId || isDemoMode()) return;
    const sb = getSupabaseClient();
    const channel = sb
      .channel(`dm_user:${userId}`)
      .on('broadcast', { event: 'new' }, () => { refetch(); })
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
