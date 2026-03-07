import { useState, useEffect, useCallback, useRef } from 'react';
import { getSupabaseClient } from '../../lib/supabase/client.js';

export function useFeed(courseId) {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const idsRef = useRef(new Set());

  // Fetch initial posts
  useEffect(() => {
    if (!courseId) return;
    setLoading(true);
    idsRef.current = new Set();

    (async () => {
      try {
        const r = await fetch(`/api/posts?course_id=${courseId}`);
        if (!r.ok) return;
        const data = await r.json();
        const mapped = data.map(p => ({
          id: p.id,
          uid: p.moodle_user_id,
          text: p.text,
          type: p.type,
          yearGroup: p.year_group || null,
          likes: p.likes || [],
          ts: new Date(p.created_at),
          name: p.profiles?.name,
          avatar: p.profiles?.avatar,
          color: p.profiles?.color,
        }));
        mapped.forEach(p => idsRef.current.add(p.id));
        setPosts(mapped);
      } catch {}
      setLoading(false);
    })();
  }, [courseId]);

  // Realtime subscription for INSERT
  useEffect(() => {
    if (!courseId) return;
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
          ts: new Date(p.created_at),
          name: null,
          avatar: null,
          color: null,
        }, ...prev]);
      })
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'posts',
        filter: `course_id=eq.${courseId}`,
      }, (payload) => {
        const p = payload.new;
        setPosts(prev => prev.map(post =>
          post.id === p.id ? { ...post, likes: p.likes || [] } : post
        ));
      })
      .subscribe();

    return () => { sb.removeChannel(channel); };
  }, [courseId]);

  // Send post (optimistic)
  const sendPost = useCallback(async (text, type, currentUser) => {
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
      ts: new Date(),
      name: type === 'anon' ? '匿名' : currentUser?.name,
      avatar: type === 'anon' ? '?' : currentUser?.av,
      color: type === 'anon' ? '#68687a' : currentUser?.col,
    };
    idsRef.current.add(tempId);
    setPosts(prev => [optimistic, ...prev]);

    try {
      const body = { course_id: courseId, text: text.trim(), type: type || 'discussion' };
      if (yg) body.year_group = yg;
      const r = await fetch('/api/posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (r.ok) {
        const p = await r.json();
        idsRef.current.add(p.id);
        setPosts(prev => prev.map(post =>
          post.id === tempId ? {
            id: p.id,
            uid: p.moodle_user_id,
            text: p.text,
            type: p.type,
            yearGroup: p.year_group || null,
            likes: p.likes || [],
            ts: new Date(p.created_at),
            name: p.profiles?.name,
            avatar: p.profiles?.avatar,
            color: p.profiles?.color,
          } : post
        ));
      }
    } catch {}
  }, [courseId]);

  // Toggle like (optimistic)
  const toggleLike = useCallback(async (postId, userId) => {
    setPosts(prev => prev.map(p => {
      if (p.id !== postId) return p;
      const already = p.likes.includes(userId);
      return { ...p, likes: already ? p.likes.filter(id => id !== userId) : [...p.likes, userId] };
    }));

    try {
      await fetch('/api/posts', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ post_id: postId, action: 'like' }),
      });
    } catch {}
  }, []);

  return { posts, loading, sendPost, toggleLike };
}
