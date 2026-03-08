import { useState, useEffect, useRef, useCallback } from 'react';
import { getSupabaseClient } from '../../lib/supabase/client.js';

/**
 * Typing indicator using Supabase Presence.
 * @param {string} roomId - e.g. "dm:123" or "chat:c1"
 * @param {object} userInfo - { id, name }
 * @returns {{ typingUsers: string[], setTyping: (isTyping: boolean) => void }}
 */
export function useTyping(roomId, userInfo) {
  const [typingUsers, setTypingUsers] = useState([]);
  const channelRef = useRef(null);
  const timerRef = useRef(null);

  useEffect(() => {
    if (!roomId || !userInfo?.id) return;

    const sb = getSupabaseClient();
    const channel = sb.channel(`typing:${roomId}`, {
      config: { presence: { key: String(userInfo.id) } },
    });

    const syncTyping = () => {
      const state = channel.presenceState();
      const users = [];
      for (const [, entries] of Object.entries(state)) {
        for (const entry of entries) {
          if (entry.id !== userInfo.id && entry.typing) {
            users.push(entry.name || `User ${entry.id}`);
          }
        }
      }
      setTypingUsers(users);
    };

    channel
      .on('presence', { event: 'sync' }, syncTyping)
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await channel.track({ id: userInfo.id, name: userInfo.name || '', typing: false });
        }
      });

    channelRef.current = channel;

    return () => {
      channel.untrack();
      sb.removeChannel(channel);
      channelRef.current = null;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [roomId, userInfo?.id]);

  const setTyping = useCallback((isTyping) => {
    const ch = channelRef.current;
    if (!ch || !userInfo?.id) return;
    ch.track({ id: userInfo.id, name: userInfo.name || '', typing: isTyping });
    // Auto-stop typing after 3s
    if (timerRef.current) clearTimeout(timerRef.current);
    if (isTyping) {
      timerRef.current = setTimeout(() => {
        ch.track({ id: userInfo.id, name: userInfo.name || '', typing: false });
      }, 3000);
    }
  }, [userInfo?.id, userInfo?.name]);

  return { typingUsers, setTyping };
}
