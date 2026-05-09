import { useState, useEffect, useCallback, useRef } from 'react';
import { getSupabaseClient } from '../../lib/supabase/client.js';
import { isDemoMode } from '../demoMode.js';
import { DEMO_DM_CONVERSATIONS } from '../demoData.js';

export function useDMList(userId) {
  const [conversations, setConversations] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchConvos = useCallback(async () => {
    if (isDemoMode()) {
      setConversations(DEMO_DM_CONVERSATIONS);
      setLoading(false);
      return;
    }
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
    if (isDemoMode()) return;
    const sb = getSupabaseClient();
    const channel = sb
      .channel('dm_messages_list')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'dm_messages',
      }, () => {
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
    if (!conversationId) { setMessages([]); idsRef.current = new Set(); }
    // For non-null convId, do NOT reset idsRef here — initMessages (called from
    // DMView once conversation data loads) overwrites it. Resetting here would
    // wipe an optimistically-appended id during the null→convId transition that
    // happens when a brand-new DM is sent, allowing the realtime INSERT event
    // to double-add the same message.
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

  // Optimistic append (used immediately after send so UI reflects the new message
  // without waiting for the realtime INSERT event ~1-3s later). idsRef guards
  // against double-add when the realtime event eventually fires.
  const appendMessage = useCallback((m) => {
    if (m?.id == null) return;
    if (idsRef.current.has(m.id)) return;
    idsRef.current.add(m.id);
    setMessages(prev => [...prev, m]);
  }, []);

  return { messages, setMessages: initMessages, appendMessage };
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
