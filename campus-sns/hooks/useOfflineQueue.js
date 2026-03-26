import { useState, useEffect, useCallback, useRef } from 'react';
import { showToast } from './useToast.js';

const STORAGE_KEY = 'offline_post_queue';

function loadQueue() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  } catch { return []; }
}

function saveQueue(queue) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(queue)); } catch {}
}

export function useOfflineQueue() {
  const [queue, setQueue] = useState(() => loadQueue());
  const processingRef = useRef(false);

  // Enqueue a failed post
  const enqueue = useCallback((item) => {
    const entry = { ...item, queuedAt: Date.now(), id: `q_${Date.now()}_${Math.random().toString(36).slice(2, 6)}` };
    setQueue(prev => {
      const next = [...prev, entry];
      saveQueue(next);
      return next;
    });
    showToast('オフラインのため投稿をキューに保存しました');
    return entry;
  }, []);

  // Process the queue: attempt to send all queued posts
  const flush = useCallback(async () => {
    if (processingRef.current) return;
    const current = loadQueue();
    if (current.length === 0) return;
    processingRef.current = true;

    const remaining = [];
    for (const item of current) {
      try {
        const body = { course_id: item.courseId, text: item.text, type: item.type || 'discussion' };
        if (item.yearGroup) body.year_group = item.yearGroup;
        if (item.pollOptions) body.poll_options = item.pollOptions;

        const r = await fetch('/api/posts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (!r.ok) remaining.push(item);
      } catch {
        remaining.push(item);
      }
    }

    saveQueue(remaining);
    setQueue(remaining);
    processingRef.current = false;

    const sent = current.length - remaining.length;
    if (sent > 0) showToast(`キューから${sent}件の投稿を送信しました`);
    if (remaining.length > 0) showToast(`${remaining.length}件の投稿がまだ送信待ちです`);
  }, []);

  // Remove a queued item
  const remove = useCallback((queueId) => {
    setQueue(prev => {
      const next = prev.filter(item => item.id !== queueId);
      saveQueue(next);
      return next;
    });
  }, []);

  // Listen for online event to auto-flush
  useEffect(() => {
    const handler = () => { flush(); };
    window.addEventListener('online', handler);
    // Also try to flush on mount if online
    if (navigator.onLine && loadQueue().length > 0) flush();
    return () => window.removeEventListener('online', handler);
  }, [flush]);

  return { queue, enqueue, flush, remove, pending: queue.length };
}
