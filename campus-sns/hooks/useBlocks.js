import { useState, useEffect, useCallback, useMemo } from 'react';
import { isDemoMode } from '../demoMode.js';

export function useBlocks(enabled = true) {
  const [blocks, setBlocks] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchBlocks = useCallback(async () => {
    if (isDemoMode()) { setBlocks([]); setLoading(false); return; }
    try {
      const r = await fetch('/api/blocks');
      if (r.ok) setBlocks(await r.json());
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { if (enabled) fetchBlocks(); }, [fetchBlocks, enabled]);

  const blockedIds = useMemo(() => new Set(blocks.map(b => b.blockedId)), [blocks]);
  const isBlocked = useCallback((userId) => blockedIds.has(userId), [blockedIds]);

  const blockUser = useCallback(async (userId) => {
    const r = await fetch('/api/blocks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: userId }),
    });
    if (r.ok) await fetchBlocks();
    return r.ok;
  }, [fetchBlocks]);

  const unblockUser = useCallback(async (userId) => {
    const r = await fetch('/api/blocks', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: userId }),
    });
    if (r.ok) await fetchBlocks();
    return r.ok;
  }, [fetchBlocks]);

  return {
    blocks, loading, blockedIds, isBlocked,
    blockUser, unblockUser, refetch: fetchBlocks,
  };
}
