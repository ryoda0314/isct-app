import { useState, useEffect } from 'react';

const cache = {};

/**
 * Fetch members who have access to a given room (via /api/data/dept-members).
 * - dept prefix (e.g. "CSC")       → profiles.dept = "CSC"
 * - school prefix (e.g. "school:engineering") → profiles.dept in all depts of that school
 * - unit prefix (e.g. "unit:25B-7") → profiles.unit = "25B-7"
 * - global prefix (e.g. "global:sandbox") → all profiles
 *
 * profiles is not readable with the anon key (security report F-1), so this
 * goes through the authenticated API instead of the Supabase client.
 */
export function useDeptMembers(prefix) {
  const [members, setMembers] = useState(cache[prefix] || []);

  useEffect(() => {
    if (!prefix) return;
    if (cache[prefix]) { setMembers(cache[prefix]); return; }

    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/data/dept-members?prefix=${encodeURIComponent(prefix)}`);
        if (cancelled || !res.ok) return;
        const { members: list } = await res.json();
        if (cancelled || !Array.isArray(list)) return;
        cache[prefix] = list;
        setMembers(list);
      } catch (e) { console.error('[useDeptMembers] error:', e); }
    })();
    return () => { cancelled = true; };
  }, [prefix]);

  return members;
}
