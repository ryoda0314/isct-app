import { useState, useEffect } from 'react';
import { getSupabaseClient } from '../../lib/supabase/client.js';

const cache = {};

export function resetCourseMembersCache() {
  for (const k of Object.keys(cache)) delete cache[k];
}

export function useCourseMembers(moodleCourseId) {
  const [members, setMembers] = useState(cache[moodleCourseId] || []);

  useEffect(() => {
    if (!moodleCourseId) return;
    if (cache[moodleCourseId]) { setMembers(cache[moodleCourseId]); return; }

    let cancelled = false;
    (async () => {
      try {
        const supabase = getSupabaseClient();
        const { data: enrollments, error: enrollErr } = await supabase
          .from('course_enrollments')
          .select('moodle_user_id')
          .eq('course_moodle_id', moodleCourseId);

        if (cancelled || enrollErr || !enrollments || enrollments.length === 0) return;

        const userIds = enrollments.map(e => e.moodle_user_id);
        const { data: profiles, error: profileErr } = await supabase
          .from('profiles')
          .select('moodle_id, name, color')
          .in('moodle_id', userIds);

        if (cancelled || profileErr || !profiles) return;

        const mapped = profiles.map(p => ({ id: p.moodle_id, name: p.name, col: p.color }));
        cache[moodleCourseId] = mapped;
        setMembers(mapped);
      } catch {}
    })();
    return () => { cancelled = true; };
  }, [moodleCourseId]);

  return members;
}
