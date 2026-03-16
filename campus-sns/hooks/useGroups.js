import { useState, useEffect, useCallback } from 'react';
import { getSupabaseClient } from '../../lib/supabase/client.js';
import { isDemoMode } from '../demoMode.js';
import { DEMO_GROUPS } from '../demoData.js';

export function useGroups(enabled = true) {
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchGroups = useCallback(async () => {
    if (isDemoMode()) {
      setGroups(DEMO_GROUPS);
      setLoading(false);
      return;
    }
    try {
      const r = await fetch('/api/groups');
      if (!r.ok) return;
      const data = await r.json();
      setGroups(data);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { if (enabled) fetchGroups(); }, [fetchGroups, enabled]);

  // Realtime: listen for group_members changes (join/leave)
  useEffect(() => {
    if (isDemoMode() || !enabled) return;
    const sb = getSupabaseClient();
    const channel = sb
      .channel('group_members_changes')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'group_members',
      }, () => { fetchGroups(); })
      .subscribe();
    return () => { sb.removeChannel(channel); };
  }, [fetchGroups, enabled]);

  const createGroup = useCallback(async (name, memberIds) => {
    try {
      const r = await fetch('/api/groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, member_ids: memberIds }),
      });
      if (r.ok) {
        const data = await r.json();
        await fetchGroups();
        return data;
      }
    } catch {}
    return null;
  }, [fetchGroups]);

  const leaveGroup = useCallback(async (groupId) => {
    try {
      await fetch('/api/groups', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ group_id: groupId }),
      });
      await fetchGroups();
    } catch {}
  }, [fetchGroups]);

  return { groups, loading, createGroup, leaveGroup, refetch: fetchGroups };
}
