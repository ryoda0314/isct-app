import { useState, useEffect, useCallback, useRef } from 'react';
import { getSupabaseClient } from '../../lib/supabase/client.js';

export function useGroupMessages(groupId) {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const idsRef = useRef(new Set());

  const fetchMessages = useCallback(async () => {
    if (!groupId) return;
    try {
      const r = await fetch(`/api/groups/messages?group_id=${groupId}`);
      if (r.ok) {
        const data = await r.json();
        const msgs = data.map(m => ({ ...m, ts: new Date(m.ts) }));
        idsRef.current = new Set(msgs.map(m => m.id));
        setMessages(msgs);
      }
    } catch {}
  }, [groupId]);

  // Fetch initial messages
  useEffect(() => {
    if (!groupId) { setMessages([]); setLoading(false); idsRef.current = new Set(); return; }
    setLoading(true);
    fetchMessages().finally(() => setLoading(false));
  }, [groupId, fetchMessages]);

  // Realtime: server emits a content-free broadcast ping on `group_msg:<groupId>`
  // after a group message is inserted (see lib/realtime.js). We re-fetch the
  // authorized endpoint. NOTE: Broadcast, not postgres_changes — anon cannot
  // SELECT group_messages under RLS, so postgres_changes never fires.
  useEffect(() => {
    if (!groupId) return;
    const sb = getSupabaseClient();
    const channel = sb
      .channel(`group_msg:${groupId}`)
      .on('broadcast', { event: 'new' }, () => { fetchMessages(); })
      .subscribe();
    return () => { sb.removeChannel(channel); };
  }, [groupId, fetchMessages]);

  const appendMessage = useCallback((m) => {
    if (m?.id == null) return;
    if (idsRef.current.has(m.id)) return;
    idsRef.current.add(m.id);
    setMessages(prev => [...prev, m]);
  }, []);

  return { messages, loading, appendMessage };
}

export function useGroupSend() {
  return useCallback(async (text, groupId) => {
    if (!text?.trim() || !groupId) return null;
    try {
      const r = await fetch('/api/groups/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ group_id: groupId, text: text.trim() }),
      });
      if (r.ok) return await r.json();
    } catch {}
    return null;
  }, []);
}
