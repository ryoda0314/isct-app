import { useState, useEffect, useCallback, useMemo } from 'react';
import { getSupabaseClient } from '../../lib/supabase/client.js';
import { isDemoMode } from '../demoMode.js';
import { DEMO_FRIENDS, DEMO_FRIEND_PENDING, DEMO_FRIEND_SENT } from '../demoData.js';

export function useFriends(enabled = true, userId = null) {
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

  // Realtime: server-emitted broadcast ping → re-fetch.
  // (friendships has deny_all RLS for anon, so postgres_changes never fires —
  //  the API broadcasts a content-free ping on `friends:<userId>` instead.
  //  See lib/realtime.js / app/api/friends/route.js.)
  useEffect(() => {
    if (isDemoMode() || !enabled || !userId) return;
    const sb = getSupabaseClient();
    const ch = sb
      .channel(`friends:${userId}`)
      .on('broadcast', { event: 'new' }, () => { fetchAll(); })
      .subscribe();
    return () => { sb.removeChannel(ch); };
  }, [fetchAll, enabled, userId]);

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

  const fetchRecommendations = useCallback(async () => {
    if (isDemoMode()) return [];
    const r = await fetch('/api/friends?type=recommendations');
    return r.ok ? await r.json() : [];
  }, []);

  const fetchGraph = useCallback(async (scope = 'ego') => {
    if (isDemoMode()) {
      // Demo: star of me ↔ each friend, no 2nd-degree
      return {
        me: { id: userId, name: 'You', avatar: '★', color: '#6375f0' },
        nodes: DEMO_FRIENDS.map(f => ({ id: f.friendId, name: f.name, avatar: f.avatar, color: f.color, dept: f.dept, degree: 1 })),
        edges: DEMO_FRIENDS.map(f => [userId, f.friendId]),
      };
    }
    const r = await fetch(`/api/friends?type=graph${scope === 'all' ? '&scope=all' : ''}`);
    return r.ok ? await r.json() : null;
  }, [userId]);

  return {
    friends, pending, sent, loading,
    pendingCount: pending.length,
    friendIds, isFriend,
    sendRequest, acceptRequest, rejectRequest, unfriend,
    searchUsers, lookupById, fetchGraph, fetchRecommendations, refetch: fetchAll,
  };
}
