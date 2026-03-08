import { useState, useEffect, useCallback } from 'react';
import { getSupabaseClient } from '../../lib/supabase/client.js';
import { isDemoMode } from '../demoMode.js';

const KEY = 'dm_last_seen';
const getSeen = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; } };
const saveSeen = (d) => { try { localStorage.setItem(KEY, JSON.stringify(d)); } catch {} };

export function useUnreadDM(userId) {
  const [count, setCount] = useState(0);

  // Initial: fetch DM list and count conversations with unseen messages
  useEffect(() => {
    if (!userId || isDemoMode()) return;
    (async () => {
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
    })();
  }, [userId]);

  // Realtime: increment on new DM from others
  useEffect(() => {
    if (!userId || isDemoMode()) return;
    const sb = getSupabaseClient();
    const channel = sb
      .channel('dm_unread_badge')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'dm_messages',
      }, (payload) => {
        if (payload.new.sender_id !== userId) {
          setCount(prev => prev + 1);
          // Browser push notification for new DM
          if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
            try { new Notification('新しいメッセージ', { body: payload.new.text || 'DMが届きました', icon: '/favicon.ico', tag: 'dm-' + payload.new.conversation_id }); } catch {}
          }
        }
      })
      .subscribe();
    return () => { sb.removeChannel(channel); };
  }, [userId]);

  const markSeen = useCallback((convId) => {
    const seen = getSeen();
    seen[convId] = Date.now();
    saveSeen(seen);
    setCount(prev => Math.max(0, prev - 1));
  }, []);

  return { unreadDM: count, markDMSeen: markSeen };
}
