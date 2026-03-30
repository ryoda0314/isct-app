import { useState, useEffect } from 'react';
import { getSupabaseClient } from '../../lib/supabase/client.js';

const cache = {};

export function useDeptMembers(deptPrefix) {
  const [members, setMembers] = useState(cache[deptPrefix] || []);

  useEffect(() => {
    if (!deptPrefix) return;
    if (cache[deptPrefix]) { setMembers(cache[deptPrefix]); return; }

    let cancelled = false;
    (async () => {
      try {
        const supabase = getSupabaseClient();
        const { data, error } = await supabase
          .from('profiles')
          .select('moodle_id, name, color')
          .eq('dept', deptPrefix);
        if (cancelled || error || !data) return;
        const mapped = data.map(p => ({ id: p.moodle_id, name: p.name, col: p.color }));
        cache[deptPrefix] = mapped;
        setMembers(mapped);
      } catch {}
    })();
    return () => { cancelled = true; };
  }, [deptPrefix]);

  return members;
}
