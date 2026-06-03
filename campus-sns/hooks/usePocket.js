import { useState, useEffect, useCallback, useRef } from 'react';
import { getSupabaseClient } from '../../lib/supabase/client.js';
import { isDemoMode } from '../demoMode.js';
import { useCurrentUser } from './useCurrentUser.js';

const DEMO_ITEMS = [
  { id: 'demo1', kind: 'text', text: 'https://www.isct.ac.jp/', pinned: false, created_at: new Date(Date.now() - 36e5).toISOString(), attachment: null },
  { id: 'demo2', kind: 'text', text: '明日の持ち物: 学生証・電卓・レポート印刷', pinned: true, created_at: new Date(Date.now() - 72e5).toISOString(), attachment: null },
];

// 自分専用クリップボード（端末間同期）。
// realtime は INSERT/DELETE/UPDATE を購読し、イベントをトリガに認証付きAPIで再取得する
// （payload は信頼せず、中身は必ずAPI経由で取得することでプライバシーを担保）。
export function usePocket() {
  const user = useCurrentUser();
  const ownerId = user?.moodleId || user?.id || null;
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const refetchTimer = useRef(null);

  const refresh = useCallback(async () => {
    if (isDemoMode()) {
      setItems(DEMO_ITEMS);
      setLoading(false);
      return;
    }
    try {
      const r = await fetch('/api/pocket');
      if (!r.ok) { setLoading(false); return; }
      const data = await r.json();
      setItems(Array.isArray(data) ? data : []);
    } catch {}
    setLoading(false);
  }, []);

  // 初回取得
  useEffect(() => { refresh(); }, [refresh]);

  // ウィンドウ復帰時に再取得（別端末で追加した分を、PCに戻った瞬間に最新化）
  useEffect(() => {
    if (isDemoMode()) return;
    const onFocus = () => { if (document.visibilityState !== "hidden") refresh(); };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [refresh]);

  // realtime: 自分のアイテムの変化を購読 → 軽くデバウンスして再取得
  useEffect(() => {
    if (isDemoMode() || !ownerId) return;
    const sb = getSupabaseClient();
    const scheduleRefetch = () => {
      if (refetchTimer.current) clearTimeout(refetchTimer.current);
      refetchTimer.current = setTimeout(() => { refresh(); }, 300);
    };
    const channel = sb
      .channel(`pocket:${ownerId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'pocket_items',
        filter: `owner_id=eq.${ownerId}`,
      }, scheduleRefetch)
      .subscribe();
    return () => {
      if (refetchTimer.current) clearTimeout(refetchTimer.current);
      sb.removeChannel(channel);
    };
  }, [ownerId, refresh]);

  // テキスト/URL を追加（楽観的に先頭へ）
  const addText = useCallback(async (text) => {
    const t = (text || '').trim();
    if (!t) return;
    if (isDemoMode()) {
      setItems(prev => [{ id: `tmp_${Date.now()}`, kind: 'text', text: t, pinned: false, created_at: new Date().toISOString(), attachment: null }, ...prev]);
      return;
    }
    const r = await fetch('/api/pocket', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: t }),
    });
    if (r.ok) {
      const item = await r.json();
      setItems(prev => prev.some(p => p.id === item.id) ? prev : [item, ...prev]);
    }
  }, []);

  // ファイル/画像を追加（サーバーを経由せずクライアントから直接Supabaseへアップロード）
  const addFile = useCallback(async (file, caption) => {
    if (!file) return;
    if (isDemoMode()) return;

    // 1) 署名付きアップロードURLを取得
    const signRes = await fetch('/api/pocket', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'sign-upload', name: file.name, type: file.type, size: file.size }),
    });
    if (!signRes.ok) {
      const e = await signRes.json().catch(() => ({}));
      throw new Error(e.error || '署名URLの取得に失敗しました');
    }
    const { path, token } = await signRes.json();

    // 2) Supabase ストレージへ直接アップロード（Vercelの本文サイズ制限を回避）
    const sb = getSupabaseClient();
    const { error: upErr } = await sb.storage
      .from('post-attachments')
      .uploadToSignedUrl(path, token, file, { contentType: file.type || undefined });
    if (upErr) throw new Error(upErr.message || 'アップロードに失敗しました');

    // 3) DBに記録
    const recRes = await fetch('/api/pocket', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ attachment: { name: file.name, path, size: file.size, type: file.type }, text: caption }),
    });
    if (!recRes.ok) {
      const e = await recRes.json().catch(() => ({}));
      throw new Error(e.error || '保存に失敗しました');
    }
    const item = await recRes.json();
    setItems(prev => prev.some(p => p.id === item.id) ? prev : [item, ...prev]);
  }, []);

  // 削除（楽観的）
  const removeItem = useCallback(async (id) => {
    setItems(prev => prev.filter(p => p.id !== id));
    if (isDemoMode() || String(id).startsWith('tmp_') || String(id).startsWith('demo')) return;
    try { await fetch(`/api/pocket?id=${encodeURIComponent(id)}`, { method: 'DELETE' }); } catch {}
  }, []);

  // ピン留めトグル（楽観的）
  const togglePin = useCallback(async (id) => {
    let next = false;
    setItems(prev => {
      const updated = prev.map(p => p.id === id ? (next = !p.pinned, { ...p, pinned: !p.pinned }) : p);
      // ピンを上に並べ替え
      return [...updated].sort((a, b) => (b.pinned - a.pinned) || (new Date(b.created_at) - new Date(a.created_at)));
    });
    if (isDemoMode() || String(id).startsWith('tmp_') || String(id).startsWith('demo')) return;
    try {
      await fetch('/api/pocket', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, pinned: next }),
      });
    } catch {}
  }, []);

  return { items, loading, addText, addFile, removeItem, togglePin, refresh };
}
