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
        const res = await fetch(`/api/data/members?courseid=${moodleCourseId}`);
        if (!res.ok || cancelled) return;
        const data = await res.json();
        if (cancelled || !data.members) return;
        cache[moodleCourseId] = data.members;
        setMembers(data.members);
      } catch {}
    })();
    return () => { cancelled = true; };
  }, [moodleCourseId]);

  return members;
}
