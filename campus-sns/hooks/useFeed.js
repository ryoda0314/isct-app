import { useState, useEffect, useCallback, useRef } from 'react';
import { getSupabaseClient } from '../../lib/supabase/client.js';
import { isDemoMode } from '../demoMode.js';
import { DEMO_POSTS } from '../demoData.js';
import { showToast } from './useToast.js';

const PAGE_SIZE = 20;

const mapPost = (p) => ({
  id: p.id,
  uid: p.moodle_user_id,
  text: p.text,
  type: p.type,
  yearGroup: p.year_group || null,
  likes: p.likes || [],
  commentCount: p.comment_count || 0,
  ts: new Date(p.created_at),
  name: p.profiles?.name,
  avatar: p.profiles?.avatar,
  color: p.profiles?.color,
  editedAt: p.edited_at ? new Date(p.edited_at) : null,
  pollOptions: p.poll_options || null,
  pollVotes: p.poll_votes || {},
  reactions: p.reactions || {},
  attachments: p.attachments || null,
  pinned: p.pinned || false,
});

export function useFeed(courseId) {
  const [posts, setPosts] = useState([]);
  const [pinnedPosts, setPinnedPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const idsRef = useRef(new Set());

  // Fetch initial posts
  useEffect(() => {
    if (!courseId) return;
    if (isDemoMode()) {
      const all = DEMO_POSTS[courseId] || [];
      setPosts(all.filter(p => !p.pinned));
      setPinnedPosts(all.filter(p => p.pinned));
      setLoading(false);
      return;
    }
    setLoading(true);
    idsRef.current = new Set();

    (async () => {
      try {
        const r = await fetch(`/api/posts?course_id=${courseId}&limit=${PAGE_SIZE}`);
        if (!r.ok) { console.error('[useFeed GET]', r.status); setLoading(false); return; }
        const res = await r.json();
        // Support both old format (array) and new format ({posts, hasMore})
        const data = Array.isArray(res) ? res : res.posts || [];
        setHasMore(Array.isArray(res) ? false : !!res.hasMore);
        const mapped = data.map(mapPost);
        mapped.forEach(p => idsRef.current.add(p.id));
        setPosts(mapped);

        // Pinned posts
        const pinData = res.pinnedPosts || [];
        const mappedPinned = pinData.map(mapPost);
        mappedPinned.forEach(p => idsRef.current.add(p.id));
        setPinnedPosts(mappedPinned);
      } catch (e) { console.error('[useFeed fetch error]', e); }
      setLoading(false);
    })();
  }, [courseId]);

  // Load more (pagination)
  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore || !posts.length) return;
    setLoadingMore(true);
    const oldest = posts[posts.length - 1];
    try {
      const r = await fetch(`/api/posts?course_id=${courseId}&limit=${PAGE_SIZE}&before=${oldest.ts.toISOString()}`);
      if (r.ok) {
        const res = await r.json();
        const data = Array.isArray(res) ? res : res.posts || [];
        setHasMore(Array.isArray(res) ? false : !!res.hasMore);
        const mapped = data.map(mapPost).filter(p => !idsRef.current.has(p.id));
        mapped.forEach(p => idsRef.current.add(p.id));
        setPosts(prev => [...prev, ...mapped]);
      }
    } catch (e) { console.error('[useFeed loadMore]', e); }
    setLoadingMore(false);
  }, [courseId, posts, loadingMore, hasMore]);

  // Realtime subscription for INSERT, UPDATE, DELETE
  useEffect(() => {
    if (!courseId || isDemoMode()) return;
    const sb = getSupabaseClient();
    const channel = sb
      .channel(`feed:${courseId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'posts',
        filter: `course_id=eq.${courseId}`,
      }, (payload) => {
        const p = payload.new;
        if (idsRef.current.has(p.id)) return;
        idsRef.current.add(p.id);
        setPosts(prev => [{
          id: p.id,
          uid: p.moodle_user_id,
          text: p.text,
          type: p.type,
          yearGroup: p.year_group || null,
          likes: p.likes || [],
          commentCount: 0,
          ts: new Date(p.created_at),
          name: null,
          avatar: null,
          color: null,
          editedAt: null,
          pollOptions: p.poll_options || null,
          pollVotes: p.poll_votes || {},
          reactions: p.reactions || {},
          attachments: p.attachments || null,
          pinned: p.pinned || false,
        }, ...prev]);
      })
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'posts',
        filter: `course_id=eq.${courseId}`,
      }, (payload) => {
        const p = payload.new;
        const updater = post =>
          post.id === p.id ? {
            ...post,
            likes: p.likes || [],
            text: p.text,
            editedAt: p.edited_at ? new Date(p.edited_at) : null,
            pollVotes: p.poll_votes || {},
            reactions: p.reactions || {},
            pinned: p.pinned || false,
          } : post;
        setPosts(prev => prev.map(updater));
        setPinnedPosts(prev => prev.map(updater));
      })
      .on('postgres_changes', {
        event: 'DELETE',
        schema: 'public',
        table: 'posts',
        filter: `course_id=eq.${courseId}`,
      }, (payload) => {
        const id = payload.old?.id;
        if (id) {
          idsRef.current.delete(id);
          setPosts(prev => prev.filter(p => p.id !== id));
          setPinnedPosts(prev => prev.filter(p => p.id !== id));
        }
      })
      .subscribe();

    return () => { sb.removeChannel(channel); };
  }, [courseId]);

  // Send post (optimistic) — supports poll_options for polls + offline queue
  const sendPost = useCallback(async (text, type, currentUser, extra = {}) => {
    if (!text.trim() || !courseId) return;
    const yg = currentUser?.yearGroup || null;
    const tempId = `temp_${Date.now()}`;
    const optimistic = {
      id: tempId,
      uid: currentUser?.moodleId || 0,
      text: text.trim(),
      type: type || 'discussion',
      yearGroup: yg,
      likes: [],
      commentCount: 0,
      ts: new Date(),
      name: type === 'anon' ? '匿名' : currentUser?.name,
      avatar: type === 'anon' ? '?' : currentUser?.av,
      color: type === 'anon' ? '#68687a' : currentUser?.col,
      editedAt: null,
      pollOptions: extra.pollOptions || null,
      pollVotes: {},
      reactions: {},
      attachments: null,
      pinned: false,
      queued: false,
    };

    // If offline, queue for later (file uploads cannot be queued)
    if (!navigator.onLine && !(extra.files?.length > 0)) {
      optimistic.queued = true;
      idsRef.current.add(tempId);
      setPosts(prev => [optimistic, ...prev]);
      if (extra.onOfflineQueue) {
        extra.onOfflineQueue({ courseId, text: text.trim(), type: type || 'discussion', yearGroup: yg, pollOptions: extra.pollOptions || null });
      }
      return;
    }

    idsRef.current.add(tempId);
    setPosts(prev => [optimistic, ...prev]);

    try {
      const body = { course_id: courseId, text: text.trim(), type: type || 'discussion' };
      if (yg) body.year_group = yg;
      if (extra.pollOptions) body.poll_options = extra.pollOptions;

      let r;
      if (extra.files && extra.files.length > 0) {
        const fd = new FormData();
        fd.append('json', JSON.stringify(body));
        extra.files.forEach(f => fd.append('files', f));
        r = await fetch('/api/posts', { method: 'POST', body: fd });
      } else {
        r = await fetch('/api/posts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
      }

      if (r.ok) {
        const p = await r.json();
        idsRef.current.add(p.id);
        idsRef.current.delete(tempId);
        const mapped = mapPost(p);
        setPosts(prev => {
          // If realtime already added this post, remove temp and update realtime version
          const hasReal = prev.some(post => post.id === p.id && post.id !== tempId);
          if (hasReal) {
            return prev
              .filter(post => post.id !== tempId)
              .map(post => post.id === p.id ? mapped : post);
          }
          return prev.map(post => post.id === tempId ? mapped : post);
        });
      } else {
        let errBody;
        try { errBody = await r.json(); } catch { errBody = null; }
        console.error('[useFeed POST]', r.status, errBody);
        setPosts(prev => prev.filter(p => p.id !== tempId));
        idsRef.current.delete(tempId);
        showToast('投稿に失敗しました');
      }
    } catch (e) {
      console.error('[useFeed POST error]', e.message, e.stack);
      // Network error → queue if possible
      if (!(extra.files?.length > 0) && extra.onOfflineQueue) {
        setPosts(prev => prev.map(p => p.id === tempId ? { ...p, queued: true } : p));
        extra.onOfflineQueue({ courseId, text: text.trim(), type: type || 'discussion', yearGroup: yg, pollOptions: extra.pollOptions || null });
      } else {
        setPosts(prev => prev.filter(p => p.id !== tempId));
        idsRef.current.delete(tempId);
        showToast('投稿に失敗しました');
      }
    }
  }, [courseId]);

  // Toggle like (optimistic)
  const toggleLike = useCallback(async (postId, userId) => {
    setPosts(prev => prev.map(p => {
      if (p.id !== postId) return p;
      const already = p.likes.includes(userId);
      return { ...p, likes: already ? p.likes.filter(id => id !== userId) : [...p.likes, userId] };
    }));

    try {
      const r = await fetch('/api/posts', {
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
    setPinnedPosts(prev => prev.filter(p => p.id !== postId));
    idsRef.current.delete(postId);

    try {
      const r = await fetch('/api/posts', {
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

  // Edit post (optimistic)
  const editPost = useCallback(async (postId, newText) => {
    const backup = posts;
    setPosts(prev => prev.map(p =>
      p.id === postId ? { ...p, text: newText, editedAt: new Date() } : p
    ));

    try {
      const r = await fetch('/api/posts', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ post_id: postId, action: 'edit', text: newText }),
      });
      if (!r.ok) {
        setPosts(backup);
        showToast('編集に失敗しました');
      }
    } catch {
      setPosts(backup);
      showToast('編集に失敗しました');
    }
  }, [posts]);

  // Vote on poll (optimistic)
  const votePoll = useCallback(async (postId, option, userId) => {
    setPosts(prev => prev.map(p => {
      if (p.id !== postId) return p;
      const votes = { ...p.pollVotes };
      // Remove user from all options first
      Object.keys(votes).forEach(k => {
        votes[k] = (votes[k] || []).filter(id => id !== userId);
      });
      // Add to chosen option
      votes[option] = [...(votes[option] || []), userId];
      return { ...p, pollVotes: votes };
    }));

    try {
      const r = await fetch('/api/posts', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ post_id: postId, action: 'vote', option }),
      });
      if (!r.ok) showToast('投票に失敗しました');
    } catch { showToast('投票に失敗しました'); }
  }, []);

  // React with emoji (optimistic)
  const reactPost = useCallback(async (postId, emoji, userId) => {
    setPosts(prev => prev.map(p => {
      if (p.id !== postId) return p;
      const reactions = { ...p.reactions };
      const arr = reactions[emoji] || [];
      if (arr.includes(userId)) {
        reactions[emoji] = arr.filter(id => id !== userId);
        if (reactions[emoji].length === 0) delete reactions[emoji];
      } else {
        reactions[emoji] = [...arr, userId];
      }
      return { ...p, reactions };
    }));

    try {
      const r = await fetch('/api/posts', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ post_id: postId, action: 'react', emoji }),
      });
      if (!r.ok) showToast('リアクションに失敗しました');
    } catch { showToast('リアクションに失敗しました'); }
  }, []);

  // Pin/unpin post (optimistic)
  const pinPost = useCallback(async (postId) => {
    // Toggle pinned state
    setPosts(prev => {
      const post = prev.find(p => p.id === postId);
      if (!post) return prev;
      if (post.pinned) {
        // Unpinning: move back to regular
        return prev.map(p => p.id === postId ? { ...p, pinned: false } : p);
      } else {
        // Pinning: mark as pinned
        return prev.map(p => p.id === postId ? { ...p, pinned: true } : p);
      }
    });
    setPinnedPosts(prev => {
      const existing = prev.find(p => p.id === postId);
      if (existing) {
        // Was pinned, remove from pinned list
        return prev.filter(p => p.id !== postId);
      }
      // Not yet in pinned list - find it from posts state... we'll let the realtime sync handle it
      return prev;
    });

    try {
      const r = await fetch('/api/posts', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ post_id: postId, action: 'pin' }),
      });
      if (!r.ok) showToast('ピン留めに失敗しました');
    } catch { showToast('ピン留めに失敗しました'); }
  }, []);

  // Update comment count locally
  const updateCommentCount = useCallback((postId, delta) => {
    setPosts(prev => prev.map(p =>
      p.id === postId ? { ...p, commentCount: (p.commentCount || 0) + delta } : p
    ));
  }, []);

  // Search posts
  const searchPosts = useCallback(async (query) => {
    if (!query?.trim() || !courseId) return;
    setLoading(true);
    try {
      const r = await fetch(`/api/posts?course_id=${courseId}&search=${encodeURIComponent(query)}`);
      if (r.ok) {
        const res = await r.json();
        const data = res.posts || [];
        setHasMore(false);
        setPosts(data.map(mapPost));
      }
    } catch (e) { console.error('[useFeed search]', e); }
    setLoading(false);
  }, [courseId]);

  return { posts, pinnedPosts, loading, loadingMore, hasMore, sendPost, loadMore, toggleLike, deletePost, editPost, votePoll, reactPost, pinPost, updateCommentCount, searchPosts };
}
