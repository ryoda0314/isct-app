import { useState, useCallback } from 'react';
import { isDemoMode } from '../demoMode.js';
import { DEMO_CIRCLES, DEMO_CIRCLE_MESSAGES, DEMO_DISCOVER_CIRCLES } from '../demoData.js';

export function useCircles() {
  const [circles, setCircles] = useState(() => isDemoMode() ? DEMO_CIRCLES : []);
  const [messages, setMessages] = useState(() => isDemoMode() ? DEMO_CIRCLE_MESSAGES : {});
  const [discover, setDiscover] = useState(() => isDemoMode() ? DEMO_DISCOVER_CIRCLES : []);

  const init = useCallback(() => {
    if (isDemoMode()) {
      setCircles(DEMO_CIRCLES);
      setMessages(DEMO_CIRCLE_MESSAGES);
      setDiscover(DEMO_DISCOVER_CIRCLES);
    }
  }, []);

  const sendMessage = useCallback((channelId, text, user) => {
    if (!text?.trim() || !channelId) return;
    const msg = {
      id: `cm_${Date.now()}`,
      uid: user?.moodleId || user?.id || 99999,
      name: user?.name || 'You',
      avatar: user?.av || user?.name?.[0] || '?',
      color: user?.col || '#888',
      text: text.trim(),
      ts: new Date(),
    };
    setMessages(prev => ({
      ...prev,
      [channelId]: [...(prev[channelId] || []), msg],
    }));
  }, []);

  const createCircle = useCallback((name, desc, color) => {
    const c = {
      id: `cir_${Date.now()}`,
      name,
      icon: name[0],
      color: color || '#6375f0',
      desc: desc || '',
      memberCount: 1,
      role: 'admin',
      channels: [
        { id: `ch_${Date.now()}_1`, name: 'general', type: 'text' },
        { id: `ch_${Date.now()}_2`, name: 'announcements', type: 'text' },
        { id: `ch_${Date.now()}_3`, name: 'random', type: 'text' },
      ],
      members: [],
    };
    setCircles(prev => [...prev, c]);
    return c;
  }, []);

  const joinCircle = useCallback((circleId) => {
    const found = discover.find(c => c.id === circleId);
    if (!found) return;
    const joined = {
      ...found,
      role: 'member',
      channels: [
        { id: `ch_${Date.now()}_1`, name: 'general', type: 'text' },
        { id: `ch_${Date.now()}_2`, name: 'announcements', type: 'text' },
      ],
      members: [],
    };
    setCircles(prev => [...prev, joined]);
    setDiscover(prev => prev.filter(c => c.id !== circleId));
  }, [discover]);

  const leaveCircle = useCallback((circleId) => {
    setCircles(prev => prev.filter(c => c.id !== circleId));
  }, []);

  const addChannel = useCallback((circleId, channelName) => {
    if (!channelName?.trim()) return;
    setCircles(prev => prev.map(c => {
      if (c.id !== circleId) return c;
      return {
        ...c,
        channels: [...c.channels, { id: `ch_${Date.now()}`, name: channelName.trim().toLowerCase().replace(/\s+/g, '-'), type: 'text' }],
      };
    }));
  }, []);

  const deleteChannel = useCallback((circleId, channelId) => {
    setCircles(prev => prev.map(c => {
      if (c.id !== circleId) return c;
      return { ...c, channels: c.channels.filter(ch => ch.id !== channelId) };
    }));
  }, []);

  const updateCircle = useCallback((circleId, updates) => {
    setCircles(prev => prev.map(c => c.id === circleId ? { ...c, ...updates } : c));
  }, []);

  const pinMessage = useCallback((channelId, messageId) => {
    setMessages(prev => {
      const ch = prev[channelId] || [];
      return {
        ...prev,
        [channelId]: ch.map(m => m.id === messageId ? { ...m, pinned: !m.pinned } : m),
      };
    });
  }, []);

  return { circles, messages, discover, sendMessage, createCircle, joinCircle, leaveCircle, addChannel, deleteChannel, pinMessage, updateCircle, init };
}