import { useState, useEffect } from 'react';

const cache = {};
const EMPTY = { sections: [], totalFiles: 0 };

export function resetCourseMaterialsCache() {
  for (const k of Object.keys(cache)) delete cache[k];
}

export function useCourseMaterials(moodleCourseId) {
  const [data, setData] = useState(cache[moodleCourseId] || EMPTY);
  const [loading, setLoading] = useState(!cache[moodleCourseId]);

  useEffect(() => {
    if (!moodleCourseId) {
      console.warn('[useCourseMaterials] moodleCourseId is falsy, skip fetch', moodleCourseId);
      setLoading(false);
      return;
    }
    if (cache[moodleCourseId]) { setData(cache[moodleCourseId]); setLoading(false); return; }

    let cancelled = false;
    setLoading(true);
    console.log('[useCourseMaterials] fetching materials for', moodleCourseId);
    (async () => {
      try {
        const r = await fetch(`/api/data/materials?courseid=${moodleCourseId}`);
        if (!r.ok) {
          console.error('[useCourseMaterials] API error', r.status, r.statusText, 'courseId=', moodleCourseId);
          return;
        }
        const d = await r.json();
        console.log('[useCourseMaterials] got response', { courseId: moodleCourseId, sections: d.sections?.length, totalFiles: d.totalFiles });
        if (!cancelled && d.sections) {
          const result = { sections: d.sections, totalFiles: d.totalFiles };
          cache[moodleCourseId] = result;
          setData(result);
        }
      } catch (err) {
        console.error('[useCourseMaterials] fetch error', err, 'courseId=', moodleCourseId);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [moodleCourseId]);

  return { ...data, loading };
}
