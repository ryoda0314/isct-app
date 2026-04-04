import { useState, useEffect, useCallback, useRef } from 'react';
import { getSupabaseClient } from '../../lib/supabase/client.js';
import { showToast } from './useToast.js';

export function useFreshmanComments(postId) {
  const [comments, setComments] = useState([]);
  const [loading, setLoading] = useState(false);
  const idsRef = useRef(new Set());

  useEffect(() => {
    if (!postId) { setComments([]); return; }
    setLoading(true);
    idsRef.current = new Set();

    (async () => {
      try {
        const r = await fetch(`/api/freshman-board/comments?post_id=${postId}`);
        if (!r.ok) { console.error('[useFreshmanComments GET]', r.status); setLoading(false); return; }
        const data = await r.json();
        const mapped = data.map(c => ({
          id: c.id, postId: c.post_id, uid: c.moodle_user_id,
          text: c.text, ts: new Date(c.created_at),
          name: c.profiles?.name, avatar: c.profiles?.avatar, color: c.profiles?.color,
        }));
        mapped.forEach(c => idsRef.current.add(c.id));
        setComments(mapped);
      } catch (e) { console.error('[useFreshmanComments fetch]', e); }
      setLoading(false);
    })();
  }, [postId]);

  // Realtime
  useEffect(() => {
    if (!postId) return;
    const sb = getSupabaseClient();
    const channel = sb
      .channel(`freshman_comments:${postId}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'freshman_comments',
        filter: `post_id=eq.${postId}`,
      }, (payload) => {
        const c = payload.new;
        if (idsRef.current.has(c.id)) return;
        idsRef.current.add(c.id);
        setComments(prev => [...prev, {
          id: c.id, postId: c.post_id, uid: c.moodle_user_id,
          text: c.text, ts: new Date(c.created_at),
          name: null, avatar: null, color: null,
        }]);
      })
      .on('postgres_changes', {
        event: 'DELETE', schema: 'public', table: 'freshman_comments',
        filter: `post_id=eq.${postId}`,
      }, (payload) => {
        const id = payload.old?.id;
        if (id) {
          idsRef.current.delete(id);
          setComments(prev => prev.filter(c => c.id !== id));
        }
      })
      .subscribe();

    return () => { sb.removeChannel(channel); };
  }, [postId]);

  // Send comment (optimistic)
  const sendComment = useCallback(async (text, currentUser) => {
    if (!text.trim() || !postId) return false;
    const tempId = `temp_${Date.now()}`;
    const optimistic = {
      id: tempId, postId, uid: currentUser?.moodleId || 0,
      text: text.trim(), ts: new Date(),
      name: currentUser?.name, avatar: currentUser?.av, color: currentUser?.col,
    };
    idsRef.current.add(tempId);
    setComments(prev => [...prev, optimistic]);

    try {
      const r = await fetch('/api/freshman-board/comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ post_id: postId, text: text.trim() }),
      });
      if (r.ok) {
        const c = await r.json();
        idsRef.current.add(c.id);
        setComments(prev => prev.map(cm =>
          cm.id === tempId ? {
            id: c.id, postId: c.post_id, uid: c.moodle_user_id,
            text: c.text, ts: new Date(c.created_at),
            name: c.profiles?.name, avatar: c.profiles?.avatar, color: c.profiles?.color,
          } : cm
        ));
        return true;
      } else {
        setComments(prev => prev.filter(c => c.id !== tempId));
        idsRef.current.delete(tempId);
        showToast('コメントの送信に失敗しました');
        return false;
      }
    } catch {
      setComments(prev => prev.filter(c => c.id !== tempId));
      idsRef.current.delete(tempId);
      showToast('コメントの送信に失敗しました');
      return false;
    }
  }, [postId]);

  // Delete comment (optimistic)
  const deleteComment = useCallback(async (commentId) => {
    const backup = comments;
    setComments(prev => prev.filter(c => c.id !== commentId));
    idsRef.current.delete(commentId);

    try {
      const r = await fetch('/api/freshman-board/comments', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ comment_id: commentId }),
      });
      if (!r.ok) {
        setComments(backup);
        idsRef.current.add(commentId);
        showToast('コメントの削除に失敗しました');
      }
    } catch {
      setComments(backup);
      idsRef.current.add(commentId);
      showToast('コメントの削除に失敗しました');
    }
  }, [comments]);

  return { comments, loading, sendComment, deleteComment };
}
