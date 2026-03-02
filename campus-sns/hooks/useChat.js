import { useState, useEffect, useCallback, useRef } from 'react';
import { getSupabaseClient } from '../../lib/supabase/client.js';

export function useChat(courseId) {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const idsRef = useRef(new Set());

  // Fetch initial messages
  useEffect(() => {
    if (!courseId) return;
    setLoading(true);
    idsRef.current = new Set();

    (async () => {
      try {
        const r = await fetch(`/api/messages?course_id=${courseId}`);
        if (!r.ok) return;
        const data = await r.json();
        const msgs = data.map(m => ({
          id: m.id,
          uid: m.moodle_user_id,
          text: m.text,
          ts: new Date(m.created_at),
          name: m.profiles?.name,
          avatar: m.profiles?.avatar,
          color: m.profiles?.color,
        }));
        msgs.forEach(m => idsRef.current.add(m.id));
        setMessages(msgs);
      } catch {}
      setLoading(false);
    })();
  }, [courseId]);

  // Realtime subscription
  useEffect(() => {
    if (!courseId) return;
    const sb = getSupabaseClient();
    const channel = sb
      .channel(`chat:${courseId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: `course_id=eq.${courseId}`,
      }, (payload) => {
        const m = payload.new;
        if (idsRef.current.has(m.id)) return; // dedupe
        idsRef.current.add(m.id);
        setMessages(prev => [...prev, {
          id: m.id,
          uid: m.moodle_user_id,
          text: m.text,
          ts: new Date(m.created_at),
          // Profile info may not be in payload; fetch separately if needed
          name: null,
          avatar: null,
          color: null,
        }]);
      })
      .subscribe();

    return () => { sb.removeChannel(channel); };
  }, [courseId]);

  // Send message (optimistic)
  const sendMessage = useCallback(async (text, currentUser) => {
    if (!text.trim() || !courseId) return;
    const tempId = `temp_${Date.now()}`;
    const optimistic = {
      id: tempId,
      uid: currentUser?.moodleId || 0,
      text: text.trim(),
      ts: new Date(),
      name: currentUser?.name,
      avatar: currentUser?.av,
      color: currentUser?.col,
    };
    idsRef.current.add(tempId);
    setMessages(prev => [...prev, optimistic]);

    try {
      const r = await fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ course_id: courseId, text: text.trim() }),
      });
      if (r.ok) {
        const m = await r.json();
        idsRef.current.add(m.id);
        // Replace temp with real
        setMessages(prev => prev.map(msg =>
          msg.id === tempId ? {
            id: m.id,
            uid: m.moodle_user_id,
            text: m.text,
            ts: new Date(m.created_at),
            name: m.profiles?.name,
            avatar: m.profiles?.avatar,
            color: m.profiles?.color,
          } : msg
        ));
      }
    } catch {}
  }, [courseId]);

  return { messages, loading, sendMessage };
}
