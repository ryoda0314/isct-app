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

  // Realtime: server emits a content-free broadcast ping on `dm_list:<userId>`
  // after any DM involving this user is inserted (see lib/realtime.js). We
  // re-fetch the authorized /api/dm endpoint rather than reading row data off
  // the channel. NOTE: we use Broadcast, not postgres_changes, because the anon
  // key cannot SELECT dm_messages under RLS so postgres_changes never fires.
  // This refetch also drives the open conversation: DMView re-inits its message
  // list from `conversations` whenever it changes.
  useEffect(() => {
    if (isDemoMode() || !userId) return;
    const sb = getSupabaseClient();
    const channel = sb
      .channel(`dm_list:${userId}`)
      .on('broadcast', { event: 'new' }, () => { fetchConvos(); })
      .subscribe();

    return () => { sb.removeChannel(channel); };
  }, [userId, fetchConvos]);

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

  // No per-conversation realtime subscription here: incoming messages arrive via
  // useDMList's broadcast-driven refetch (DMView re-inits this list from the
  // refreshed `conversations`). Doing it in one place avoids a duplicate /api/dm
  // fetch per incoming message. (postgres_changes can't be used anyway — anon
  // RLS denies SELECT on dm_messages; see lib/realtime.js.)

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
  // text+conversationId / text+toUserId / stamp+conversationId / stamp+toUserId
  // stamp_id can be passed via opts: { stampId } as the 4th positional arg slot replacement.
  const sendDM = useCallback(async (text, conversationId, toUserId, opts = {}) => {
    const stampId = opts.stampId || null;
    const trimmed = text?.trim() || '';
    if (!trimmed && !stampId) return null;
    try {
      const r = await fetch('/api/dm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: trimmed || undefined,
          stamp_id: stampId || undefined,
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
