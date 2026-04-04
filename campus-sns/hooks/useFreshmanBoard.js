import { useState, useEffect, useCallback, useRef } from 'react';
import { getSupabaseClient } from '../../lib/supabase/client.js';
import { showToast } from './useToast.js';

const PAGE_SIZE = 30;

// Convert yearGroup like "25B" to academic year number (1, 2, 3...) based on current fiscal year
const ygToYr = (yg) => {
  if (!yg) return null;
  const m = yg.match(/^(\d{2})/);
  if (!m) return null;
  const entryYear = 2000 + parseInt(m[1]);
  const now = new Date();
  const fiscalYear = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  return Math.max(1, fiscalYear - entryYear + 1);
};

const mapPost = (p) => ({
  id: p.id,
  cat: p.category,
  uid: p.moodle_user_id,
  text: p.text,
  type: p.type || 'discussion',
  yr: ygToYr(p.year_group),
  likes: p.likes || [],
  commentCount: p.comment_count || 0,
  ts: new Date(p.created_at),
  name: p.profiles?.name,
  avatar: p.profiles?.avatar,
  color: p.profiles?.color,
  pinned: p.pinned || false,
  editedAt: p.edited_at ? new Date(p.edited_at) : null,
});

export function useFreshmanBoard(category) {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const idsRef = useRef(new Set());

  // Fetch posts
  useEffect(() => {
    setLoading(true);
    idsRef.current = new Set();

    (async () => {
      try {
        let url = `/api/freshman-board?limit=${PAGE_SIZE}`;
        if (category) url += `&category=${category}`;
        const r = await fetch(url);
        if (!r.ok) { console.error('[useFreshmanBoard GET]', r.status); setLoading(false); return; }
        const res = await r.json();
        const data = res.posts || [];
        const pinData = res.pinnedPosts || [];
        setHasMore(!!res.hasMore);
        const allMapped = [...pinData.map(mapPost), ...data.map(mapPost)];
        allMapped.forEach(p => idsRef.current.add(p.id));
        setPosts(allMapped);
      } catch (e) { console.error('[useFreshmanBoard fetch]', e); }
      setLoading(false);
    })();
  }, [category]);

  // Load more
  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore) return;
    const nonPinned = posts.filter(p => !p.pinned);
    if (!nonPinned.length) return;
    setLoadingMore(true);
    const oldest = nonPinned[nonPinned.length - 1];
    try {
      let url = `/api/freshman-board?limit=${PAGE_SIZE}&before=${oldest.ts.toISOString()}`;
      if (category) url += `&category=${category}`;
      const r = await fetch(url);
      if (r.ok) {
        const res = await r.json();
        const data = res.posts || [];
        setHasMore(!!res.hasMore);
        const mapped = data.map(mapPost).filter(p => !idsRef.current.has(p.id));
        mapped.forEach(p => idsRef.current.add(p.id));
        setPosts(prev => [...prev, ...mapped]);
      }
    } catch (e) { console.error('[useFreshmanBoard loadMore]', e); }
    setLoadingMore(false);
  }, [category, posts, loadingMore, hasMore]);

  // Realtime
  useEffect(() => {
    const sb = getSupabaseClient();
    const channel = sb
      .channel('freshman_board')
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'freshman_posts',
      }, (payload) => {
        const p = payload.new;
        if (idsRef.current.has(p.id)) return;
        if (category && p.category !== category) return;
        idsRef.current.add(p.id);
        setPosts(prev => [mapPost(p), ...prev]);
      })
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'freshman_posts',
      }, (payload) => {
        const p = payload.new;
        setPosts(prev => prev.map(post =>
          post.id === p.id ? { ...post, likes: p.likes || [], text: p.text, pinned: p.pinned || false, editedAt: p.edited_at ? new Date(p.edited_at) : null } : post
        ));
      })
      .on('postgres_changes', {
        event: 'DELETE', schema: 'public', table: 'freshman_posts',
      }, (payload) => {
        const id = payload.old?.id;
        if (id) {
          idsRef.current.delete(id);
          setPosts(prev => prev.filter(p => p.id !== id));
        }
      })
      .subscribe();

    return () => { sb.removeChannel(channel); };
  }, [category]);

  // Send post (optimistic)
  const sendPost = useCallback(async (text, cat, type, currentUser) => {
    if (!text.trim()) return;
    const tempId = `temp_${Date.now()}`;
    const optimistic = {
      id: tempId, cat, uid: currentUser?.moodleId || 0,
      text: text.trim(), type: type || 'discussion',
      likes: [], commentCount: 0, ts: new Date(),
      name: currentUser?.name, avatar: currentUser?.av, color: currentUser?.col,
      pinned: false, editedAt: null,
    };
    idsRef.current.add(tempId);
    setPosts(prev => [optimistic, ...prev]);

    try {
      const r = await fetch('/api/freshman-board', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category: cat, text: text.trim(), type: type || 'discussion' }),
      });
      if (r.ok) {
        const p = await r.json();
        idsRef.current.add(p.id);
        setPosts(prev => prev.map(post => post.id === tempId ? mapPost(p) : post));
      } else {
        setPosts(prev => prev.filter(p => p.id !== tempId));
        idsRef.current.delete(tempId);
        showToast('投稿に失敗しました');
      }
    } catch {
      setPosts(prev => prev.filter(p => p.id !== tempId));
      idsRef.current.delete(tempId);
      showToast('投稿に失敗しました');
    }
  }, []);

  // Toggle like (optimistic)
  const toggleLike = useCallback(async (postId, userId) => {
    setPosts(prev => prev.map(p => {
      if (p.id !== postId) return p;
      const already = p.likes.includes(userId);
      return { ...p, likes: already ? p.likes.filter(id => id !== userId) : [...p.likes, userId] };
    }));

    try {
      const r = await fetch('/api/freshman-board', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ post_id: postId, action: 'like' }),
      });
      if (!r.ok) showToast('いいねに失敗しました');
    } catch { showToast('いいねに失敗しました'); }
  }, []);

  // Delete post (optimistic)
  const deletePost = useCallback(async (postId) => {
    const backup = posts;
    setPosts(prev => prev.filter(p => p.id !== postId));
    idsRef.current.delete(postId);

    try {
      const r = await fetch('/api/freshman-board', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ post_id: postId }),
      });
      if (!r.ok) {
        setPosts(backup);
        idsRef.current.add(postId);
        showToast('削除に失敗しました');
      }
    } catch {
      setPosts(backup);
      idsRef.current.add(postId);
      showToast('削除に失敗しました');
    }
  }, [posts]);

  // Update comment count locally
  const updateCommentCount = useCallback((postId, delta) => {
    setPosts(prev => prev.map(p =>
      p.id === postId ? { ...p, commentCount: (p.commentCount || 0) + delta } : p
    ));
  }, []);

  // Search
  const searchPosts = useCallback(async (query) => {
    if (!query?.trim()) return;
    setLoading(true);
    try {
      let url = `/api/freshman-board?search=${encodeURIComponent(query)}`;
      if (category) url += `&category=${category}`;
      const r = await fetch(url);
      if (r.ok) {
        const res = await r.json();
        setHasMore(false);
        setPosts((res.posts || []).map(mapPost));
      }
    } catch (e) { console.error('[useFreshmanBoard search]', e); }
    setLoading(false);
  }, [category]);

  return { posts, loading, loadingMore, hasMore, sendPost, loadMore, toggleLike, deletePost, updateCommentCount, searchPosts };
}
