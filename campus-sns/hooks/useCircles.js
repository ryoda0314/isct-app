import { useState, useEffect, useCallback, useRef } from 'react';
import { getSupabaseClient } from '../../lib/supabase/client.js';
import { isDemoMode } from '../demoMode.js';
import { DEMO_CIRCLES, DEMO_CIRCLE_MESSAGES, DEMO_DISCOVER_CIRCLES } from '../demoData.js';

export function useCircles(enabled = true, userId = null) {
  const [circles, setCircles] = useState(() => isDemoMode() ? DEMO_CIRCLES : []);
  const [messages, setMessages] = useState(() => isDemoMode() ? DEMO_CIRCLE_MESSAGES : {});
  const [discover, setDiscover] = useState(() => isDemoMode() ? DEMO_DISCOVER_CIRCLES : []);
  const loadedChannelsRef = useRef(new Set());

  const init = useCallback(() => {
    if (isDemoMode()) {
      setCircles(DEMO_CIRCLES);
      setMessages(DEMO_CIRCLE_MESSAGES);
      setDiscover(DEMO_DISCOVER_CIRCLES);
    }
  }, []);

  const fetchCircles = useCallback(async () => {
    if (isDemoMode()) return;
    try {
      const r = await fetch('/api/circles');
      if (r.ok) setCircles(await r.json());
    } catch {}
  }, []);

  const fetchDiscover = useCallback(async () => {
    if (isDemoMode()) return;
    try {
      const r = await fetch('/api/circles/discover');
      if (r.ok) setDiscover(await r.json());
    } catch {}
  }, []);

  useEffect(() => {
    if (!enabled || isDemoMode()) return;
    fetchCircles();
    fetchDiscover();
  }, [enabled, fetchCircles, fetchDiscover]);

  // Realtime: subscribe to membership changes for this user and message changes for active channels
  useEffect(() => {
    if (isDemoMode() || !enabled || !userId) return;
    const sb = getSupabaseClient();
    const ch = sb
      .channel(`circle_members_${userId}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'circle_members', filter: `user_id=eq.${userId}`,
      }, () => { fetchCircles(); fetchDiscover(); })
      .subscribe();
    return () => { sb.removeChannel(ch); };
  }, [enabled, userId, fetchCircles, fetchDiscover]);

  const fetchMessages = useCallback(async (channelId) => {
    if (!channelId || isDemoMode()) return;
    try {
      const r = await fetch(`/api/circles/messages?channel_id=${encodeURIComponent(channelId)}`);
      if (r.ok) {
        const data = await r.json();
        setMessages(prev => ({ ...prev, [channelId]: data }));
        loadedChannelsRef.current.add(channelId);
      }
    } catch {}
  }, []);

  // Subscribe to realtime for any channel we've loaded
  useEffect(() => {
    if (isDemoMode() || !enabled) return;
    const sb = getSupabaseClient();
    const sub = sb
      .channel('circle_messages_all')
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'circle_messages',
      }, (payload) => {
        const m = payload.new;
        if (!m || !loadedChannelsRef.current.has(m.channel_id)) return;
        fetchMessages(m.channel_id);
      })
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'circle_messages',
      }, (payload) => {
        const m = payload.new;
        if (!m || !loadedChannelsRef.current.has(m.channel_id)) return;
        fetchMessages(m.channel_id);
      })
      .subscribe();
    return () => { sb.removeChannel(sub); };
  }, [enabled, fetchMessages]);

  const sendMessage = useCallback(async (channelId, text, user) => {
    if (!text?.trim() || !channelId) return;
    if (isDemoMode()) {
      const msg = {
        id: `cm_${Date.now()}`,
        uid: user?.moodleId || user?.id || 99999,
        name: user?.name || 'You',
        avatar: user?.av || user?.name?.[0] || '?',
        color: user?.col || '#888',
        text: text.trim(),
        ts: new Date(),
      };
      setMessages(prev => ({ ...prev, [channelId]: [...(prev[channelId] || []), msg] }));
      return;
    }
    // Optimistic
    const tempId = `tmp_${Date.now()}`;
    const optimistic = {
      id: tempId,
      uid: user?.moodleId || user?.id,
      name: user?.name || 'You',
      avatar: user?.av || user?.name?.[0] || '?',
      color: user?.col || '#888',
      text: text.trim(),
      ts: new Date().toISOString(),
      pending: true,
    };
    setMessages(prev => ({ ...prev, [channelId]: [...(prev[channelId] || []), optimistic] }));
    try {
      const r = await fetch('/api/circles/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel_id: channelId, text: text.trim() }),
      });
      if (!r.ok) throw new Error('send failed');
      await fetchMessages(channelId);
    } catch {
      setMessages(prev => ({
        ...prev,
        [channelId]: (prev[channelId] || []).filter(m => m.id !== tempId),
      }));
    }
  }, [fetchMessages]);

  const createCircle = useCallback(async (name, desc, color) => {
    if (isDemoMode()) {
      const c = {
        id: `cir_${Date.now()}`, name, icon: name[0], color: color || '#6375f0',
        desc: desc || '', memberCount: 1, role: 'admin',
        channels: [
          { id: `ch_${Date.now()}_1`, name: 'general', type: 'text' },
          { id: `ch_${Date.now()}_2`, name: 'announcements', type: 'text' },
          { id: `ch_${Date.now()}_3`, name: 'random', type: 'text' },
        ],
        members: [],
      };
      setCircles(prev => [...prev, c]);
      return c;
    }
    try {
      const r = await fetch('/api/circles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, desc, color }),
      });
      if (!r.ok) return null;
      const c = await r.json();
      setCircles(prev => [...prev, c]);
      return c;
    } catch { return null; }
  }, []);

  const joinCircle = useCallback(async (circleId) => {
    if (isDemoMode()) {
      const found = discover.find(c => c.id === circleId);
      if (!found) return;
      const joined = {
        ...found, role: 'member',
        channels: [
          { id: `ch_${Date.now()}_1`, name: 'general', type: 'text' },
          { id: `ch_${Date.now()}_2`, name: 'announcements', type: 'text' },
        ],
        members: [],
      };
      setCircles(prev => [...prev, joined]);
      setDiscover(prev => prev.filter(c => c.id !== circleId));
      return;
    }
    try {
      const r = await fetch('/api/circles/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ circle_id: circleId }),
      });
      if (r.ok) {
        await fetchCircles();
        await fetchDiscover();
      }
    } catch {}
  }, [discover, fetchCircles, fetchDiscover]);

  const leaveCircle = useCallback(async (circleId) => {
    if (isDemoMode()) {
      setCircles(prev => prev.filter(c => c.id !== circleId));
      return;
    }
    try {
      await fetch(`/api/circles?id=${encodeURIComponent(circleId)}`, { method: 'DELETE' });
      await fetchCircles();
      await fetchDiscover();
    } catch {}
  }, [fetchCircles, fetchDiscover]);

  const addChannel = useCallback(async (circleId, channelName) => {
    if (!channelName?.trim()) return;
    if (isDemoMode()) {
      setCircles(prev => prev.map(c => {
        if (c.id !== circleId) return c;
        return { ...c, channels: [...c.channels, { id: `ch_${Date.now()}`, name: channelName.trim().toLowerCase().replace(/\s+/g, '-'), type: 'text' }] };
      }));
      return;
    }
    try {
      const r = await fetch('/api/circles/channels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ circle_id: circleId, name: channelName }),
      });
      if (r.ok) await fetchCircles();
    } catch {}
  }, [fetchCircles]);

  const deleteChannel = useCallback(async (circleId, channelId) => {
    if (isDemoMode()) {
      setCircles(prev => prev.map(c => c.id !== circleId ? c : { ...c, channels: c.channels.filter(ch => ch.id !== channelId) }));
      return;
    }
    try {
      await fetch(`/api/circles/channels?id=${encodeURIComponent(channelId)}&circle_id=${encodeURIComponent(circleId)}`, { method: 'DELETE' });
      await fetchCircles();
    } catch {}
  }, [fetchCircles]);

  const updateCircle = useCallback(async (circleId, updates) => {
    if (isDemoMode()) {
      setCircles(prev => prev.map(c => c.id === circleId ? { ...c, ...updates } : c));
      return;
    }
    // Optimistic local merge
    setCircles(prev => prev.map(c => c.id === circleId ? { ...c, ...updates } : c));
    try {
      const r = await fetch('/api/circles', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: circleId, patch: updates }),
      });
      if (r.ok) {
        const fresh = await r.json();
        setCircles(prev => prev.map(c => c.id === circleId ? fresh : c));
      } else {
        await fetchCircles();
      }
    } catch {
      await fetchCircles();
    }
  }, [fetchCircles]);

  const pinMessage = useCallback(async (channelId, messageId) => {
    if (isDemoMode()) {
      setMessages(prev => {
        const ch = prev[channelId] || [];
        return { ...prev, [channelId]: ch.map(m => m.id === messageId ? { ...m, pinned: !m.pinned } : m) };
      });
      return;
    }
    try {
      await fetch('/api/circles/messages', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel_id: channelId, message_id: messageId }),
      });
      await fetchMessages(channelId);
    } catch {}
  }, [fetchMessages]);

  return {
    circles, messages, discover,
    sendMessage, createCircle, joinCircle, leaveCircle,
    addChannel, deleteChannel, pinMessage, updateCircle,
    init, fetchMessages, refetch: fetchCircles,
  };
}
