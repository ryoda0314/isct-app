import { useState, useEffect, useRef } from 'react';
import { getSupabaseClient } from '../../lib/supabase/client.js';

/**
 * Tracks online users in a given room (e.g. course channel).
 * Uses Supabase Realtime Presence.
 *
 * @param {string} roomId - e.g. "course:c1"
 * @param {object} userInfo - { id, name, col } of current user
 * @returns {{ online: Array<{id,name,col}> }}
 */
export function usePresence(roomId, userInfo) {
  const [online, setOnline] = useState([]);
  const channelRef = useRef(null);

  useEffect(() => {
    if (!roomId || !userInfo?.id) return;

    const supabase = getSupabaseClient();
    const channel = supabase.channel(`presence:${roomId}`, {
      config: { presence: { key: String(userInfo.id) } },
    });

    const syncPresence = () => {
      const state = channel.presenceState();
      console.log(`[usePresence] sync room=${roomId}`, JSON.stringify(state));
      const users = [];
      const seen = new Set();
      for (const [_key, entries] of Object.entries(state)) {
        for (const entry of entries) {
          if (!seen.has(entry.id)) {
            seen.add(entry.id);
            users.push({ id: entry.id, name: entry.name, col: entry.col });
          }
        }
      }
      console.log(`[usePresence] online users (${users.length}):`, users);
      setOnline(users);
    };

    channel
      .on('presence', { event: 'sync' }, syncPresence)
      .subscribe(async (status) => {
        console.log(`[usePresence] subscribe status=${status} room=${roomId}`);
        if (status === 'SUBSCRIBED') {
          console.log(`[usePresence] tracking self:`, userInfo);
          await channel.track({
            id: userInfo.id,
            name: userInfo.name || '',
            col: userInfo.col || '#888',
          });
        }
      });

    channelRef.current = channel;

    // 30秒ごとにpresenceStateを再取得（バックグラウンド復帰時の取りこぼし対策）
    const intervalId = setInterval(syncPresence, 30_000);

    return () => {
      clearInterval(intervalId);
      channel.untrack();
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [roomId, userInfo?.id]);

  return { online };
}
