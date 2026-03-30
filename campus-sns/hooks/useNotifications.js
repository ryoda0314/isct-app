import { useState, useEffect, useCallback, useRef } from 'react';
import { getSupabaseClient } from '../../lib/supabase/client.js';
import { isDemoMode } from '../demoMode.js';
import { DEMO_NOTIFICATIONS } from '../demoData.js';
import { useCurrentUser } from './useCurrentUser.js';

// Subscribe to Web Push and register with server
async function subscribePush() {
  try {
    const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (!vapidKey || !('serviceWorker' in navigator) || !('PushManager' in window)) return;
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return;
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey),
      });
    }
    const { endpoint, keys } = sub.toJSON();
    await fetch('/api/push', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint, keys }),
    });
  } catch {}
}

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)));
}

export function useNotifications(enabled = true) {
  const user = useCurrentUser(false);
  const userId = user?.moodleId || user?.id;
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
      subscribePush();
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { if (enabled) fetchNotifs(); }, [fetchNotifs, enabled]);

  // Realtime subscription（自分宛の通知のみ受信）
  useEffect(() => {
    if (isDemoMode() || !enabled || !userId) return;
    const sb = getSupabaseClient();
    const channel = sb
      .channel(`notifications:${userId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'notifications',
        filter: `moodle_user_id=eq.${userId}`,
      }, (payload) => {
        const n = payload.new;
        if (n.moodle_user_id !== userId) return; // 二重チェック
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
        // Browser push notification
        if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
          try { new Notification('ScienceTokyo App', { body: n.text, icon: '/icons/icon-192x192.png' }); } catch {}
        }
      })
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'notifications',
        filter: `moodle_user_id=eq.${userId}`,
      }, (payload) => {
        const n = payload.new;
        if (n.moodle_user_id !== userId) return;
        setNotifications(prev => prev.map(x => x.id === n.id ? { ...x, read: n.read } : x));
      })
      .subscribe();

    return () => { sb.removeChannel(channel); };
  }, [enabled, userId]);

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
