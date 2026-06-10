import { useState, useEffect, useCallback, useRef } from 'react';
import { t } from "../i18n.js";
import { getSupabaseClient } from '../../lib/supabase/client.js';
import { isDemoMode } from '../demoMode.js';
import { useCurrentUser } from './useCurrentUser.js';

const BUCKET = 'post-attachments';

const DEMO_TRACKS = [
  { id: 'demo1', title: 'Generated Lo-Fi #1', artist: 'AI / Suno', audio: { url: '', name: 'demo.mp3' }, cover: null, duration: 184, created_at: new Date().toISOString() },
];

// 自分専用ミュージックライブラリ（端末間同期）。
// 音源はクライアントから署名URLで直接 Supabase Storage へアップロードし（Vercelの本文サイズ制限を回避）、
// メタデータのみ /api/music に記録する。pocket の addFile と同じ流れ。
export function useMusic() {
  const user = useCurrentUser();
  const ownerId = user?.moodleId || user?.id || null;
  const [tracks, setTracks] = useState([]);
  const [loading, setLoading] = useState(true);
  const refetchTimer = useRef(null);

  const refresh = useCallback(async () => {
    if (isDemoMode()) { setTracks(DEMO_TRACKS); setLoading(false); return; }
    try {
      const r = await fetch('/api/music');
      if (!r.ok) { setLoading(false); return; }
      const data = await r.json();
      setTracks(Array.isArray(data) ? data : []);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  // 別端末で追加した分を復帰時に最新化
  useEffect(() => {
    if (isDemoMode()) return;
    const onFocus = () => { if (document.visibilityState !== 'hidden') refresh(); };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onFocus);
    };
  }, [refresh]);

  // realtime: 自分の曲の変化を購読 → デバウンスして再取得
  useEffect(() => {
    if (isDemoMode() || !ownerId) return;
    const sb = getSupabaseClient();
    const scheduleRefetch = () => {
      if (refetchTimer.current) clearTimeout(refetchTimer.current);
      refetchTimer.current = setTimeout(() => { refresh(); }, 300);
    };
    const channel = sb
      .channel(`music:${ownerId}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'music_tracks',
        filter: `owner_id=eq.${ownerId}`,
      }, scheduleRefetch)
      .subscribe();
    return () => {
      if (refetchTimer.current) clearTimeout(refetchTimer.current);
      sb.removeChannel(channel);
    };
  }, [ownerId, refresh]);

  // 署名URLを取得してSupabaseへ直接アップロード → {path,name,size,type} を返す
  // isPublic=true は管理者の全員配信（保存先 music/public/）。サーバー側でも権限を再検証する。
  const uploadOne = useCallback(async (file, kind, isPublic) => {
    const signRes = await fetch('/api/music', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'sign-upload', kind, name: file.name, type: file.type, size: file.size, public: !!isPublic }),
    });
    if (!signRes.ok) {
      const e = await signRes.json().catch(() => ({}));
      throw new Error(e.error || t("toast.signedUrlFailed"));
    }
    const { path, token } = await signRes.json();
    const sb = getSupabaseClient();
    const { error: upErr } = await sb.storage
      .from(BUCKET)
      .uploadToSignedUrl(path, token, file, { contentType: file.type || undefined });
    if (upErr) throw new Error(upErr.message || t("toast.uploadFailed"));
    return { name: file.name, path, size: file.size, type: file.type };
  }, []);

  // 音声ファイルの長さを測る（任意・失敗しても無視）
  const probeDuration = useCallback((file) => new Promise((resolve) => {
    try {
      const el = document.createElement('audio');
      const url = URL.createObjectURL(file);
      el.preload = 'metadata';
      el.onloadedmetadata = () => { URL.revokeObjectURL(url); resolve(Number.isFinite(el.duration) ? el.duration : null); };
      el.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
      el.src = url;
    } catch { resolve(null); }
  }), []);

  // 曲を追加（音源必須・カバー任意）。isPublic=true で管理者が全員へ配信。
  const addTrack = useCallback(async ({ audioFile, coverFile, title, artist, isPublic }) => {
    if (isDemoMode() || !audioFile) return;
    const [audio, duration, cover] = await Promise.all([
      uploadOne(audioFile, 'audio', isPublic),
      probeDuration(audioFile),
      coverFile ? uploadOne(coverFile, 'cover', isPublic) : Promise.resolve(null),
    ]);
    const recRes = await fetch('/api/music', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        audio,
        cover: cover ? { path: cover.path } : null,
        title: title || audioFile.name.replace(/\.[^.]+$/, ''),
        artist: artist || null,
        duration,
        public: !!isPublic,
      }),
    });
    if (!recRes.ok) {
      const e = await recRes.json().catch(() => ({}));
      throw new Error(e.error || t("toast.saveFailed"));
    }
    const track = await recRes.json();
    setTracks((prev) => (prev.some((p) => p.id === track.id) ? prev : [...prev, track]));
    return track;
  }, [uploadOne, probeDuration]);

  // 削除（楽観的）
  const removeTrack = useCallback(async (id) => {
    setTracks((prev) => prev.filter((p) => p.id !== id));
    if (isDemoMode() || String(id).startsWith('demo')) return;
    try { await fetch(`/api/music?id=${encodeURIComponent(id)}`, { method: 'DELETE' }); } catch {}
  }, []);

  // 曲名/アーティスト編集（楽観的）
  const renameTrack = useCallback(async (id, { title, artist }) => {
    setTracks((prev) => prev.map((p) => (p.id === id ? { ...p, ...(title != null ? { title } : {}), ...(artist != null ? { artist } : {}) } : p)));
    if (isDemoMode() || String(id).startsWith('demo')) return;
    try {
      await fetch('/api/music', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, ...(title != null ? { title } : {}), ...(artist != null ? { artist } : {}) }),
      });
    } catch {}
  }, []);

  return { tracks, loading, addTrack, removeTrack, renameTrack, refresh };
}
