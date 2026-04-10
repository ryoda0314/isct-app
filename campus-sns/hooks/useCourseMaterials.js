import { useState, useEffect } from 'react';
import { getClientToken, fetchCourseContents } from '../moodleClient.js';
import { transformCourseMaterials } from '../../lib/transform/material-transform.js';

const cache = {};
const EMPTY = { sections: [], totalFiles: 0, error: null };

export function resetCourseMaterialsCache() {
  for (const k of Object.keys(cache)) delete cache[k];
}

export function useCourseMaterials(moodleCourseId) {
  const [data, setData] = useState(cache[moodleCourseId] || EMPTY);
  const [loading, setLoading] = useState(!cache[moodleCourseId]);

  useEffect(() => {
    if (!moodleCourseId) {
      setLoading(false);
      return;
    }
    if (cache[moodleCourseId]) { setData(cache[moodleCourseId]); setLoading(false); return; }

    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const { wstoken } = await getClientToken();
        const raw = await fetchCourseContents(wstoken, moodleCourseId);
        const { sections, totalFiles } = transformCourseMaterials(raw, wstoken);
        if (!cancelled) {
          const result = { sections, totalFiles, error: null };
          cache[moodleCourseId] = result;
          setData(result);
        }
      } catch (err) {
        console.error('[useCourseMaterials]', err.message, 'courseId=', moodleCourseId);
        if (!cancelled) {
          const error = err.code === 'MOODLE_HTML_RESPONSE' ? 'LMS_UNAVAILABLE'
            : err.code === 'AUTH_REQUIRED' ? 'AUTH_REQUIRED' : 'NETWORK';
          setData({ sections: [], totalFiles: 0, error });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [moodleCourseId]);

  return { ...data, loading };
}
