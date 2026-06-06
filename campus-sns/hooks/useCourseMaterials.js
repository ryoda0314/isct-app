import { useState, useEffect, useCallback } from 'react';
import { getClientToken, fetchCourseContents } from '../moodleClient.js';
import { transformCourseMaterials } from '../../lib/transform/material-transform.js';

// Cached entries are { data, ts }. The embedded fileurl strings (contextid /
// itemid / filename) go stale when an instructor replaces a resource on Moodle —
// opening an old URL then yields `filenotfound`. A TTL bounds how long we serve a
// stale list; invalidateCourseMaterials() forces an immediate refetch when the
// client actually hits a filenotfound.
const cache = {};
const EMPTY = { sections: [], totalFiles: 0, error: null };
const TTL = 10 * 60 * 1000; // 10 minutes

function getCached(id) {
  const e = cache[id];
  if (e && Date.now() - e.ts < TTL) return e.data;
  return null;
}

export function resetCourseMaterialsCache() {
  for (const k of Object.keys(cache)) delete cache[k];
}

/** Drop one course's cached materials so the next render refetches fresh URLs. */
export function invalidateCourseMaterials(moodleCourseId) {
  if (moodleCourseId != null) delete cache[moodleCourseId];
}

export function useCourseMaterials(moodleCourseId) {
  const [data, setData] = useState(() => getCached(moodleCourseId) || EMPTY);
  const [loading, setLoading] = useState(() => !getCached(moodleCourseId));
  const [nonce, setNonce] = useState(0);

  /** Force a fresh fetch (e.g. after a stale-URL filenotfound). */
  const refresh = useCallback(() => {
    invalidateCourseMaterials(moodleCourseId);
    setNonce(n => n + 1);
  }, [moodleCourseId]);

  useEffect(() => {
    if (!moodleCourseId) {
      setLoading(false);
      return;
    }
    const cached = getCached(moodleCourseId);
    if (cached) { setData(cached); setLoading(false); return; }

    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const { wstoken } = await getClientToken();
        const raw = await fetchCourseContents(wstoken, moodleCourseId);
        const { sections, totalFiles } = transformCourseMaterials(raw, wstoken);
        if (!cancelled) {
          const result = { sections, totalFiles, error: null };
          cache[moodleCourseId] = { data: result, ts: Date.now() };
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
  }, [moodleCourseId, nonce]);

  return { ...data, loading, refresh };
}
