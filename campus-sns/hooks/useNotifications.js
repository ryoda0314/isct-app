import { useState, useEffect, useCallback, useRef } from 'react';
import { getSupabaseClient } from '../../lib/supabase/client.js';
import { isDemoMode } from '../demoMode.js';
import { DEMO_NOTIFICATIONS } from '../demoData.js';

export function useNotifications() {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const idsRef = useRef(new Set());

  const fetchNotifs = useCallback(async () => {
    if (isDemoMode()) {
      setNotifications(DEMO_NOTIFICATIONS);
      setLoading(false);
      return;
    }
    try {
      const r = await fetch('/api/notifications');
      if (!r.ok) return;
      const data = await r.json();
      const notifs = data.map(n => ({
        id: n.id,
        type: n.type,
        text: n.text,
        cid: n.course_id,
        ts: new Date(n.created_at),
        read: n.read,
      }));
      notifs.forEach(n => idsRef.current.add(n.id));
      setNotifications(notifs);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { fetchNotifs(); }, [fetchNotifs]);

  // Realtime subscription
  useEffect(() => {
    if (isDemoMode()) return;
    const sb = getSupabaseClient();
    const channel = sb
      .channel('notifications')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'notifications',
      }, (payload) => {
        const n = payload.new;
        if (idsRef.current.has(n.id)) return;
        idsRef.current.add(n.id);
        setNotifications(prev => [{
          id: n.id,
          type: n.type,
          text: n.text,
          cid: n.course_id,
          ts: new Date(n.created_at),
          read: n.read,
        }, ...prev]);
      })
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'notifications',
      }, (payload) => {
        const n = payload.new;
        setNotifications(prev => prev.map(x => x.id === n.id ? { ...x, read: n.read } : x));
      })
      .subscribe();

    return () => { sb.removeChannel(channel); };
  }, []);

  const markRead = useCallback(async (id) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
    try {
      await fetch('/api/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
    } catch {}
  }, []);

  const markAll = useCallback(async () => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    try {
      await fetch('/api/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ all: true }),
      });
    } catch {}
  }, []);

  const unreadCount = notifications.filter(n => !n.read).length;

  return { notifications, loading, markRead, markAll, unreadCount };
}
