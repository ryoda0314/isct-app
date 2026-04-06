import { useState, useEffect } from 'react';
import { getSupabaseClient } from '../../lib/supabase/client.js';
import { DEPTS } from '../data.js';

const cache = {};

/**
 * Fetch members who have access to a given room.
 * - dept prefix (e.g. "CSC")       → profiles.dept = "CSC"
 * - school prefix (e.g. "school:engineering") → profiles.dept in all depts of that school
 * - unit prefix (e.g. "unit:25B-7") → profiles.unit = "25B-7"
 * - global prefix (e.g. "global:sandbox") → all profiles
 */
export function useDeptMembers(prefix) {
  const [members, setMembers] = useState(cache[prefix] || []);

  useEffect(() => {
    if (!prefix) return;
    if (cache[prefix]) { setMembers(cache[prefix]); return; }

    let cancelled = false;
    (async () => {
      try {
        const supabase = getSupabaseClient();
        let query = supabase.from('profiles').select('moodle_id, name, color');

        if (prefix.startsWith('global:')) {
          // global room → all users
        } else if (prefix.startsWith('school:')) {
          const schoolKey = prefix.replace('school:', '');
          const deptCodes = Object.entries(DEPTS)
            .filter(([_, d]) => d.school === schoolKey)
            .map(([code]) => code);
          if (deptCodes.length === 0) return;
          query = query.in('dept', deptCodes);
        } else if (prefix.startsWith('unit:')) {
          const unitId = prefix.replace('unit:', '');
          query = query.eq('unit', unitId);
        } else {
          // dept room (e.g. "CSC")
          query = query.eq('dept', prefix);
        }

        const { data, error } = await query;
        console.log(`[useDeptMembers] prefix=${prefix} data=${data?.length??'null'} error=${error?.message||'none'}`);
        if (cancelled || error || !data) return;
        const mapped = data.map(p => ({ id: p.moodle_id, name: p.name, col: p.color }));
        cache[prefix] = mapped;
        setMembers(mapped);
      } catch (e) { console.error('[useDeptMembers] error:', e); }
    })();
    return () => { cancelled = true; };
  }, [prefix]);

  return members;
}
