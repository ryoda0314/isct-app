import { useState, useEffect, useCallback, useRef } from 'react';
import { getSupabaseClient } from '../../lib/supabase/client.js';

export function useDMList(userId) {
  const [conversations, setConversations] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchConvos = useCallback(async () => {
    try {
      const r = await fetch('/api/dm');
      if (!r.ok) return;
      const data = await r.json();
      setConversations(data.map(c => ({
        ...c,
        msgs: c.msgs.map(m => ({ ...m, ts: new Date(m.ts) })),
      })));
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { fetchConvos(); }, [fetchConvos]);

  // Realtime: listen for new DM messages
  useEffect(() => {
    const sb = getSupabaseClient();
    const channel = sb
      .channel('dm_messages_list')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'dm_messages',
      }, () => {
        // Re-fetch to get updated conversation list with new messages
        fetchConvos();
      })
      .subscribe();

    return () => { sb.removeChannel(channel); };
  }, [fetchConvos]);

  return { conversations, loading };
}

export function useDMMessages(conversationId) {
  const [messages, setMessages] = useState([]);
  const idsRef = useRef(new Set());

  useEffect(() => {
    if (!conversationId) { setMessages([]); return; }
    idsRef.current = new Set();
  }, [conversationId]);

  // Realtime subscription for specific conversation
  useEffect(() => {
    if (!conversationId) return;
    const sb = getSupabaseClient();
    const channel = sb
      .channel(`dm:${conversationId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'dm_messages',
        filter: `conversation_id=eq.${conversationId}`,
      }, (payload) => {
        const m = payload.new;
        if (idsRef.current.has(m.id)) return;
        idsRef.current.add(m.id);
        setMessages(prev => [...prev, {
          id: m.id,
          uid: m.sender_id,
          text: m.text,
          ts: new Date(m.created_at),
        }]);
      })
      .subscribe();

    return () => { sb.removeChannel(channel); };
  }, [conversationId]);

  // Initialize messages from conversation data
  const initMessages = useCallback((msgs) => {
    idsRef.current = new Set(msgs.map(m => m.id));
    setMessages(msgs);
  }, []);

  return { messages, setMessages: initMessages };
}

export function useDMSend() {
  const sendDM = useCallback(async (text, conversationId, toUserId) => {
    if (!text?.trim()) return null;
    try {
      const r = await fetch('/api/dm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: text.trim(),
          conversation_id: conversationId || undefined,
          to_user_id: toUserId || undefined,
        }),
      });
      if (r.ok) return await r.json();
    } catch {}
    return null;
  }, []);

  return sendDM;
}
