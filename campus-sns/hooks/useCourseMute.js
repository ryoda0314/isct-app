import { useState, useEffect, useCallback } from 'react';
import { isDemoMode } from '../demoMode.js';

// A course's "new post" notification mute toggle (server-backed so Web Push is
// also suppressed). courseId is the room id used by posts (real courses: "mc_<id>").
// Only meaningful for real courses; virtual rooms never emit post notifications.
export function useCourseMute(courseId) {
  const [muted, setMuted] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!courseId || isDemoMode()) { setReady(true); return; }
    let alive = true;
    (async () => {
      try {
        const r = await fetch('/api/notifications/course-mute');
        if (r.ok && alive) {
          const { muted: list } = await r.json();
          setMuted(Array.isArray(list) && list.includes(courseId));
        }
      } catch {}
      if (alive) setReady(true);
    })();
    return () => { alive = false; };
  }, [courseId]);

  const toggle = useCallback(async () => {
    if (!courseId || isDemoMode()) return;
    const next = !muted;
    setMuted(next); // optimistic
    try {
      const r = await fetch('/api/notifications/course-mute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ course_id: courseId, muted: next }),
      });
      if (!r.ok) setMuted(!next); // revert on failure
    } catch { setMuted(!next); }
  }, [courseId, muted]);

  return { muted, toggle, ready };
}
