import { useState, useEffect, useCallback, useMemo } from 'react';
import { getSupabaseClient } from '../../lib/supabase/client.js';
import { isDemoMode } from '../demoMode.js';
import { DEMO_FRIENDS, DEMO_FRIEND_PENDING, DEMO_FRIEND_SENT } from '../demoData.js';

export function useFriends(enabled = true) {
  const [friends, setFriends] = useState([]);
  const [pending, setPending] = useState([]);
  const [sent, setSent] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    if (isDemoMode()) {
      setFriends(DEMO_FRIENDS);
      setPending(DEMO_FRIEND_PENDING);
      setSent(DEMO_FRIEND_SENT);
      setLoading(false);
      return;
    }
    try {
      const [fR, pR, sR] = await Promise.all([
        fetch('/api/friends?type=friends'),
        fetch('/api/friends?type=pending'),
        fetch('/api/friends?type=sent'),
      ]);
      if (fR.ok) setFriends(await fR.json());
      if (pR.ok) setPending(await pR.json());
      if (sR.ok) setSent(await sR.json());
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { if (enabled) fetchAll(); }, [fetchAll, enabled]);

  // Realtime subscription
  useEffect(() => {
    if (isDemoMode() || !enabled) return;
    const sb = getSupabaseClient();
    const channel = sb
      .channel('friendships_changes')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'friendships',
      }, () => { fetchAll(); })
      .subscribe();
    return () => { sb.removeChannel(channel); };
  }, [fetchAll, enabled]);

  const friendIds = useMemo(() => new Set(friends.map(f => f.friendId)), [friends]);
  const isFriend = useCallback((userId) => friendIds.has(userId), [friendIds]);

  const sendRequest = useCallback(async (toUserId) => {
    const r = await fetch('/api/friends', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to_user_id: toUserId }),
    });
    return r.ok ? await r.json() : null;
  }, []);

  const acceptRequest = useCallback(async (friendshipId) => {
    const r = await fetch('/api/friends', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ friendship_id: friendshipId, action: 'accept' }),
    });
    return r.ok;
  }, []);

  const rejectRequest = useCallback(async (friendshipId) => {
    const r = await fetch('/api/friends', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ friendship_id: friendshipId, action: 'reject' }),
    });
    return r.ok;
  }, []);

  const unfriend = useCallback(async (friendId) => {
    const r = await fetch('/api/friends', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ friend_id: friendId }),
    });
    return r.ok;
  }, []);

  const searchUsers = useCallback(async (q) => {
    if (!q?.trim()) return [];
    const r = await fetch(`/api/friends?type=search&q=${encodeURIComponent(q.trim())}`);
    return r.ok ? await r.json() : [];
  }, []);

  const lookupById = useCallback(async (id) => {
    if (!id) return null;
    const r = await fetch(`/api/friends?type=lookup&id=${encodeURIComponent(id)}`);
    return r.ok ? await r.json() : null;
  }, []);

  return {
    friends, pending, sent, loading,
    pendingCount: pending.length,
    friendIds, isFriend,
    sendRequest, acceptRequest, rejectRequest, unfriend,
    searchUsers, lookupById, refetch: fetchAll,
  };
}
