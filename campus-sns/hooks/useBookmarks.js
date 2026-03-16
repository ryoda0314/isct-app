import { useState, useEffect, useCallback } from 'react';
import { isDemoMode } from '../demoMode.js';
import { showToast } from './useToast.js';

export function useBookmarks(enabled = true) {
  const [bmarks, setBmarks] = useState([]);
  const [loading, setLoading] = useState(false);

  // Fetch bookmarks on mount
  useEffect(() => {
    if (isDemoMode() || !enabled) return;
    setLoading(true);
    (async () => {
      try {
        const r = await fetch('/api/bookmarks');
        if (r.ok) {
          const ids = await r.json();
          setBmarks(ids);
        }
      } catch (e) {
        console.error('[useBookmarks fetch]', e);
      }
      setLoading(false);
    })();
  }, [enabled]);

  // Toggle bookmark (optimistic)
  const toggle = useCallback(async (postId) => {
    const has = bmarks.includes(postId);
    // Optimistic update
    setBmarks(prev => has ? prev.filter(id => id !== postId) : [...prev, postId]);

    try {
      const r = await fetch('/api/bookmarks', {
        method: has ? 'DELETE' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ post_id: postId }),
      });
      if (!r.ok) {
        // Rollback
        setBmarks(prev => has ? [...prev, postId] : prev.filter(id => id !== postId));
        showToast('ブックマークの更新に失敗しました');
      }
    } catch {
      setBmarks(prev => has ? [...prev, postId] : prev.filter(id => id !== postId));
      showToast('ブックマークの更新に失敗しました');
    }
  }, [bmarks]);

  return { bmarks, loading, toggle };
}
