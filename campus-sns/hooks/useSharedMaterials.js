import { useState, useEffect, useCallback, useRef } from 'react';
import { getSupabaseClient } from '../../lib/supabase/client.js';

export function useSharedMaterials(courseId) {
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const idsRef = useRef(new Set());

  // Fetch initial list
  useEffect(() => {
    if (!courseId) return;
    setLoading(true);
    idsRef.current = new Set();

    (async () => {
      try {
        const r = await fetch(`/api/shared-materials?course_id=${courseId}`);
        if (!r.ok) return;
        const data = await r.json();
        const list = data.map(m => ({
          id: m.id,
          filename: m.filename,
          filesize: m.filesize,
          mimetype: m.mimetype,
          category: m.category,
          url: m.url,
          storagePath: m.storage_path,
          createdAt: new Date(m.created_at),
          uid: m.moodle_user_id,
          name: m.profiles?.name,
          avatar: m.profiles?.avatar,
          color: m.profiles?.color,
        }));
        list.forEach(m => idsRef.current.add(m.id));
        setFiles(list);
      } catch {}
      setLoading(false);
    })();
  }, [courseId]);

  // Realtime subscription for new uploads
  useEffect(() => {
    if (!courseId) return;
    const sb = getSupabaseClient();
    const channel = sb
      .channel(`shared:${courseId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'shared_materials',
        filter: `course_id=eq.${courseId}`,
      }, async () => {
        // Re-fetch from API to get proper signed URLs (bucket is private)
        try {
          const r = await fetch(`/api/shared-materials?course_id=${courseId}`);
          if (!r.ok) return;
          const data = await r.json();
          const list = data.map(m => ({
            id: m.id,
            filename: m.filename,
            filesize: m.filesize,
            mimetype: m.mimetype,
            category: m.category,
            url: m.url,
            storagePath: m.storage_path,
            createdAt: new Date(m.created_at),
            uid: m.moodle_user_id,
            name: m.profiles?.name,
            avatar: m.profiles?.avatar,
            color: m.profiles?.color,
          }));
          idsRef.current = new Set(list.map(m => m.id));
          setFiles(list);
        } catch {}
      })
      .on('postgres_changes', {
        event: 'DELETE',
        schema: 'public',
        table: 'shared_materials',
        filter: `course_id=eq.${courseId}`,
      }, (payload) => {
        const id = payload.old?.id;
        if (id) {
          idsRef.current.delete(id);
          setFiles(prev => prev.filter(f => f.id !== id));
        }
      })
      .subscribe();

    return () => { sb.removeChannel(channel); };
  }, [courseId]);

  // Upload function
  const upload = useCallback(async (file, category = 'notes') => {
    if (!file || !courseId) return null;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('course_id', courseId);
      fd.append('category', category);

      const r = await fetch('/api/shared-materials', { method: 'POST', body: fd });
      if (!r.ok) { const e = await r.json(); throw new Error(e.error || 'Upload failed'); }
      const m = await r.json();
      const item = {
        id: m.id,
        filename: m.filename,
        filesize: m.filesize,
        mimetype: m.mimetype,
        category: m.category,
        url: m.url,
        storagePath: m.storage_path,
        createdAt: new Date(m.created_at),
        uid: m.moodle_user_id,
        name: m.profiles?.name,
        avatar: m.profiles?.avatar,
        color: m.profiles?.color,
      };
      if (!idsRef.current.has(item.id)) {
        idsRef.current.add(item.id);
        setFiles(prev => [item, ...prev]);
      }
      return item;
    } catch (err) {
      console.error('[shared-materials upload]', err.message);
      return null;
    } finally {
      setUploading(false);
    }
  }, [courseId]);

  // Delete function (optimistic)
  const remove = useCallback(async (id) => {
    if (!id) return false;
    // Optimistic: remove from UI immediately
    let removed = null;
    setFiles(prev => {
      const idx = prev.findIndex(f => f.id === id);
      if (idx >= 0) removed = { item: prev[idx], idx };
      return prev.filter(f => f.id !== id);
    });
    idsRef.current.delete(id);
    try {
      const r = await fetch('/api/shared-materials', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      if (!r.ok) {
        // Rollback on failure
        if (removed) {
          idsRef.current.add(id);
          setFiles(prev => { const a = [...prev]; a.splice(removed.idx, 0, removed.item); return a; });
        }
        return false;
      }
      return true;
    } catch {
      if (removed) {
        idsRef.current.add(id);
        setFiles(prev => { const a = [...prev]; a.splice(removed.idx, 0, removed.item); return a; });
      }
      return false;
    }
  }, []);

  return { files, loading, uploading, upload, remove };
}
