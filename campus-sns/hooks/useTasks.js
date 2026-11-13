import { useState, useEffect, useCallback, useRef } from 'react';
import { isDemoMode } from '../demoMode.js';
import { useAuth } from '../authState.js';
import { LOCAL, readLocal, writeLocal, newLocalId, ACCOUNT_DATA_EVENT } from '../localStore.js';

// Normalize a task to the client shape AsgnView expects: { id, t, d, due:Date|null }.
const norm = (t) => ({ id: t.id, t: t.t, d: !!t.d, due: t.due ? new Date(t.due) : null });

const toLocal = (t) => ({ id: t.id, t: t.t, d: !!t.d, due: t.due ? new Date(t.due).toISOString() : null });

// My Tasks store, server-persisted via /api/tasks. In demo mode it stays purely
// local (no network) so demo data still works. Mutations are optimistic.
// ログイン任意化: ログインしていない（ゲスト）ときは端末（localStorage）に保存する。ログイン時に移行を聞く（localStore.js）。
export function useTasks(enabled = true) {
  const [tasks, setTasksRaw] = useState([]);
  const [loading, setLoading] = useState(true);
  const tasksRef = useRef([]);
  useEffect(() => { tasksRef.current = tasks; }, [tasks]);
  const local = useAuth().status !== 'account';
  const localRef = useRef(local);
  localRef.current = local;
  // 端末保存の書き込みは、追加・変更・削除の操作のときだけ（ログアウト時の空の一覧で上書きしないため）
  const saveLocal = (list) => writeLocal(LOCAL.tasks, list.map(toLocal));

  // setter exposed for demo seeding / logout reset (accepts value or updater)
  const setTasks = useCallback((v) => {
    setTasksRaw((prev) => {
      const next = typeof v === 'function' ? v(prev) : v;
      return (next || []).map(norm);
    });
  }, []);

  const fetchTasks = useCallback(async () => {
    if (isDemoMode()) { setLoading(false); return; }
    if (localRef.current) { setTasksRaw(readLocal(LOCAL.tasks, []).map(norm)); setLoading(false); return; }
    try {
      const r = await fetch('/api/tasks');
      if (r.ok) setTasksRaw((await r.json()).map(norm));
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { if (enabled) fetchTasks(); }, [fetchTasks, enabled, local]);
  // 端末のデータをアカウントへ移したあと取り直す
  useEffect(() => {
    const h = () => { if (enabled && !localRef.current) fetchTasks(); };
    window.addEventListener(ACCOUNT_DATA_EVENT, h);
    return () => window.removeEventListener(ACCOUNT_DATA_EVENT, h);
  }, [enabled, fetchTasks]);

  const addTask = useCallback(async (title, due) => {
    const t = String(title || '').trim();
    if (!t) return;
    if (isDemoMode()) {
      setTasksRaw((p) => [...p, norm({ id: `mt_${Date.now()}`, t, d: false, due: due || null })]);
      return;
    }
    if (localRef.current) {
      const next = [...tasksRef.current, norm({ id: newLocalId('lt'), t, d: false, due: due || null })];
      setTasksRaw(next); saveLocal(next);
      return;
    }
    try {
      const r = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: t, due: due || null }),
      });
      if (r.ok) { const row = await r.json(); setTasksRaw((p) => [...p, norm(row)]); }
    } catch {}
  }, []);

  const toggleTask = useCallback((id) => {
    const cur = tasksRef.current.find((t) => t.id === id);
    if (!cur) return;
    const nextDone = !cur.d;
    setTasksRaw((p) => p.map((t) => (t.id === id ? { ...t, d: nextDone } : t)));
    if (isDemoMode()) return;
    if (localRef.current) { saveLocal(tasksRef.current.map((t) => (t.id === id ? { ...t, d: nextDone } : t))); return; }
    fetch('/api/tasks', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, done: nextDone }),
    }).catch(() => {});
  }, []);

  const deleteTask = useCallback((id) => {
    setTasksRaw((p) => p.filter((t) => t.id !== id));
    if (isDemoMode()) return;
    if (localRef.current) { saveLocal(tasksRef.current.filter((t) => t.id !== id)); return; }
    fetch('/api/tasks', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    }).catch(() => {});
  }, []);

  return { tasks, loading, setTasks, addTask, toggleTask, deleteTask, refetch: fetchTasks };
}
