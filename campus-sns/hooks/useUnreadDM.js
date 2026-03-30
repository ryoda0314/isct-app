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

  // Realtime: フィルタなしの dm_messages 購読は全ユーザーのDM本文が流れるため削除
  // 代わりに notifications テーブル（useNotifications で user フィルタ済み）経由で
  // DM通知を受け取る。ここでは定期ポーリングで未読数を更新する。
  useEffect(() => {
    if (!userId || isDemoMode()) return;
    const interval = setInterval(async () => {
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
    }, 30_000); // 30秒ごと
    return () => clearInterval(interval);
  }, [userId]);

  const markSeen = useCallback((convId) => {
    const seen = getSeen();
    seen[convId] = Date.now();
    saveSeen(seen);
    setCount(prev => Math.max(0, prev - 1));
  }, []);

  return { unreadDM: count, markDMSeen: markSeen };
}
