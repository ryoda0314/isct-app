import { useState, useEffect, useCallback, useRef } from 'react';
import { getSupabaseClient } from '../../lib/supabase/client.js';

export function useGroupMessages(groupId) {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const idsRef = useRef(new Set());

  // Fetch initial messages
  useEffect(() => {
    if (!groupId) { setMessages([]); setLoading(false); return; }
    setLoading(true);
    idsRef.current = new Set();
    (async () => {
      try {
        const r = await fetch(`/api/groups/messages?group_id=${groupId}`);
        if (r.ok) {
          const data = await r.json();
          const msgs = data.map(m => ({ ...m, ts: new Date(m.ts) }));
          idsRef.current = new Set(msgs.map(m => m.id));
          setMessages(msgs);
        }
      } catch {}
      setLoading(false);
    })();
  }, [groupId]);

  // Realtime subscription
  useEffect(() => {
    if (!groupId) return;
    const sb = getSupabaseClient();
    const channel = sb
      .channel(`group_msg:${groupId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'group_messages',
        filter: `group_id=eq.${groupId}`,
      }, async (payload) => {
        const m = payload.new;
        if (idsRef.current.has(m.id)) return;
        idsRef.current.add(m.id);
        // Fetch profile for sender
        let name = '?', avatar = '?', color = '#888';
        try {
          const { data } = await getSupabaseClient().from('profiles').select('*').eq('moodle_id', m.sender_id).single();
          if (data) { name = data.name; avatar = data.avatar; color = data.color; }
        } catch {}
        setMessages(prev => [...prev, {
          id: m.id,
          uid: m.sender_id,
          text: m.text,
          ts: new Date(m.created_at),
          name, avatar, color,
        }]);
      })
      .subscribe();
    return () => { sb.removeChannel(channel); };
  }, [groupId]);

  return { messages, loading };
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
