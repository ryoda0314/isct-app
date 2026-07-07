import { useState, useEffect, useCallback } from 'react';

// 語学コミュニティの参加状況・メンバー数を扱うフック。
// 認証は他フック(useChat 等)と同様に Cookie セッションで通る。
export function useLanguages() {
  const [counts, setCounts] = useState({}); // { <code>: { learner, native } }
  const [mine, setMine] = useState({});     // { <code>: 'learner'|'native' }
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const r = await fetch('/api/languages');
      if (!r.ok) { console.error('[useLanguages GET]', r.status); setLoading(false); return; }
      const data = await r.json();
      setCounts(data.counts || {});
      setMine(data.mine || {});
    } catch (e) { console.error('[useLanguages GET]', e); }
    setLoading(false);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  // 参加 or ロール変更（upsert）
  const join = useCallback(async (code, role) => {
    const prevRole = mine[code] || null;
    // 楽観更新
    setMine((m) => ({ ...m, [code]: role }));
    setCounts((c) => {
      const cur = { learner: 0, native: 0, ...(c[code] || {}) };
      const next = { ...cur };
      if (prevRole === 'native') next.native = Math.max(0, next.native - 1);
      else if (prevRole === 'learner') next.learner = Math.max(0, next.learner - 1);
      if (role === 'native') next.native++; else next.learner++;
      return { ...c, [code]: next };
    });
    try {
      const r = await fetch('/api/languages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lang_code: code, role }),
      });
      if (!r.ok) throw new Error(`POST ${r.status}`);
      return true;
    } catch (e) {
      console.error('[useLanguages join]', e);
      refresh(); // ロールバック
      return false;
    }
  }, [mine, refresh]);

  // 退会
  const leave = useCallback(async (code) => {
    const prevRole = mine[code] || null;
    setMine((m) => { const n = { ...m }; delete n[code]; return n; });
    setCounts((c) => {
      if (!c[code]) return c;
      const next = { ...c[code] };
      if (prevRole === 'native') next.native = Math.max(0, next.native - 1);
      else if (prevRole === 'learner') next.learner = Math.max(0, next.learner - 1);
      return { ...c, [code]: next };
    });
    try {
      const r = await fetch('/api/languages', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lang_code: code }),
      });
      if (!r.ok) throw new Error(`DELETE ${r.status}`);
      return true;
    } catch (e) {
      console.error('[useLanguages leave]', e);
      refresh();
      return false;
    }
  }, [mine, refresh]);

  return { counts, mine, loading, refresh, join, leave };
}

// 特定言語のメンバー一覧＋ロールマップ。code が null / 未参加のときは空。
export function useLanguageMembers(code, enabled) {
  const [members, setMembers] = useState([]);
  const [roleMap, setRoleMap] = useState({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!code || !enabled) { setMembers([]); setRoleMap({}); return; }
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const r = await fetch(`/api/languages/members?lang=${code}`);
        if (!r.ok) { if (!cancelled) { setMembers([]); setRoleMap({}); } setLoading(false); return; }
        const data = await r.json();
        if (!cancelled) { setMembers(data.members || []); setRoleMap(data.roleMap || {}); }
      } catch (e) { console.error('[useLanguageMembers]', e); }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [code, enabled]);

  return { members, roleMap, loading };
}
