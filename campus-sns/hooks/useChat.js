import { useState, useEffect, useCallback, useRef } from 'react';
import { getSupabaseClient } from '../../lib/supabase/client.js';
import { isDemoMode } from '../demoMode.js';
import { DEMO_CHAT_MESSAGES } from '../demoData.js';

export function useChat(courseId) {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const idsRef = useRef(new Set());

  // Fetch initial messages
  useEffect(() => {
    if (!courseId) return;
    if (isDemoMode()) {
      const demoMsgs = (DEMO_CHAT_MESSAGES[courseId] || []).map(m => ({
        ...m,
        ts: m.ts instanceof Date ? m.ts : new Date(m.ts),
      }));
      setMessages(demoMsgs);
      setLoading(false);
      return;
    }
    setLoading(true);
    idsRef.current = new Set();

    (async () => {
      try {
        const r = await fetch(`/api/messages?course_id=${courseId}`);
        if (!r.ok) { console.error('[useChat GET]', r.status); setLoading(false); return; }
        const data = await r.json();
        const msgs = data.map(m => ({
          id: m.id,
          uid: m.moodle_user_id,
          text: m.text,
          ts: new Date(m.created_at),
          name: m.profiles?.name,
          avatar: m.profiles?.avatar,
          color: m.profiles?.color,
          pollOptions: m.poll_options || null,
          pollVotes: m.poll_votes || {},
          pollSettings: m.poll_settings || {},
        }));
        msgs.forEach(m => idsRef.current.add(m.id));
        setMessages(msgs);
      } catch {}
      setLoading(false);
    })();
  }, [courseId]);

  // Realtime subscription
  useEffect(() => {
    if (!courseId || isDemoMode()) return;
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
          name: null,
          avatar: null,
          color: null,
          pollOptions: m.poll_options || null,
          pollVotes: m.poll_votes || {},
          pollSettings: m.poll_settings || {},
        }]);
      })
      .subscribe();

    return () => { sb.removeChannel(channel); };
  }, [courseId]);

  // Send message (optimistic)
  const sendMessage = useCallback(async (text, currentUser, extra) => {
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
      pollOptions: extra?.pollOptions || null,
      pollVotes: {},
      pollSettings: extra?.pollSettings || {},
    };
    idsRef.current.add(tempId);
    setMessages(prev => [...prev, optimistic]);

    try {
      const body = { course_id: courseId, text: text.trim() };
      if (extra?.pollOptions) {
        body.poll_options = extra.pollOptions;
        if (extra.pollSettings) body.poll_settings = extra.pollSettings;
      }
      const r = await fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (r.ok) {
        const m = await r.json();
        idsRef.current.add(m.id);
        idsRef.current.delete(tempId);
        const mapped = {
          id: m.id,
          uid: m.moodle_user_id,
          text: m.text,
          ts: new Date(m.created_at),
          name: m.profiles?.name,
          avatar: m.profiles?.avatar,
          color: m.profiles?.color,
          pollOptions: m.poll_options || null,
          pollVotes: m.poll_votes || {},
          pollSettings: m.poll_settings || {},
        };
        setMessages(prev => {
          // If realtime already added this message, remove temp and update realtime version
          const hasReal = prev.some(msg => msg.id === m.id && msg.id !== tempId);
          if (hasReal) {
            return prev
              .filter(msg => msg.id !== tempId)
              .map(msg => msg.id === m.id ? mapped : msg);
          }
          return prev.map(msg => msg.id === tempId ? mapped : msg);
        });
      } else {
        console.error('[useChat POST]', r.status);
      }
    } catch (e) { console.error('[useChat POST error]', e); }
  }, [courseId]);

  // Vote on a poll message
  const votePoll = useCallback(async (messageId, option, userId) => {
    // Optimistic update
    setMessages(prev => prev.map(m => {
      if (m.id !== messageId || !m.pollOptions) return m;
      const votes = { ...m.pollVotes };
      const multi = m.pollSettings?.multi || false;
      const alreadyVoted = (votes[option] || []).includes(userId);
      if (multi) {
        if (alreadyVoted) { votes[option] = (votes[option] || []).filter(id => id !== userId); }
        else { votes[option] = [...(votes[option] || []), userId]; }
      } else {
        Object.keys(votes).forEach(k => { votes[k] = (votes[k] || []).filter(id => id !== userId); });
        if (!alreadyVoted) { votes[option] = [...(votes[option] || []), userId]; }
      }
      return { ...m, pollVotes: votes };
    }));

    if (isDemoMode()) return; // demo mode: optimistic update only

    try {
      const r = await fetch('/api/messages', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message_id: messageId, action: 'vote', option }),
      });
      if (r.ok) {
        const m = await r.json();
        setMessages(prev => prev.map(msg =>
          msg.id === messageId ? { ...msg, pollVotes: m.poll_votes || {} } : msg
        ));
      }
    } catch (e) { console.error('[useChat vote error]', e); }
  }, []);

  return { messages, loading, sendMessage, votePoll };
}
