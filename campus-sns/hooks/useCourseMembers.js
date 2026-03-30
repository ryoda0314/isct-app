import { useState, useEffect } from 'react';

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
        const r = await fetch(`/api/data/members?courseid=${moodleCourseId}`);
        if (!r.ok) return;
        const d = await r.json();
        if (!cancelled && d.members) {
          cache[moodleCourseId] = d.members;
          setMembers(d.members);
        }
      } catch {}
    })();
    return () => { cancelled = true; };
  }, [moodleCourseId]);

  return members;
}
