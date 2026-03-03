import { useState, useEffect } from 'react';

const cache = {};
const EMPTY = { sections: [], totalFiles: 0 };

export function useCourseMaterials(moodleCourseId) {
  const [data, setData] = useState(cache[moodleCourseId] || EMPTY);
  const [loading, setLoading] = useState(!cache[moodleCourseId]);

  useEffect(() => {
    if (!moodleCourseId) return;
    if (cache[moodleCourseId]) { setData(cache[moodleCourseId]); setLoading(false); return; }

    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const r = await fetch(`/api/data/materials?courseid=${moodleCourseId}`);
        if (!r.ok) return;
        const d = await r.json();
        if (!cancelled && d.sections) {
          const result = { sections: d.sections, totalFiles: d.totalFiles };
          cache[moodleCourseId] = result;
          setData(result);
        }
      } catch {}
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [moodleCourseId]);

  return { ...data, loading };
}
