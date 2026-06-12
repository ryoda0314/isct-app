import { useEffect, useRef } from 'react';
import { isDemoMode } from '../demoMode.js';

// Thresholds ordered widest → tightest. For a given assignment we fire only the
// *tightest* threshold currently satisfied that hasn't been sent yet, so a user
// gets a "24h" reminder once and a "3h" reminder once — never both at the same
// time (e.g. opening the app when only 2h remain → just the "soon" reminder).
const THRESHOLDS = [
  { key: '24h', ms: 24 * 60 * 60 * 1000 },
  { key: '3h', ms: 3 * 60 * 60 * 1000 },
];

const SEEN_KEY = 'deadlineNotifSeen';

function loadSeen() {
  try { return new Set(JSON.parse(localStorage.getItem(SEEN_KEY) || '[]')); }
  catch { return new Set(); }
}
function saveSeen(set) {
  try { localStorage.setItem(SEEN_KEY, JSON.stringify([...set].slice(-500))); }
  catch {}
}

/**
 * Detects assignments due soon and asks the server to create (deduped) deadline
 * notifications. The server inserts + sends Web Push; the realtime subscription
 * in useNotifications then surfaces it in-app, so nothing is returned here.
 *
 * @param {Array} asgn  assignments (each: { id, title, cid, due:Date, st })
 * @param {boolean} enabled  gated by ready && notifEnabled && notifSettings.deadline
 */
export function useDeadlineNotifications(asgn, enabled = true, kind = 'assignment') {
  const runningRef = useRef(false);

  useEffect(() => {
    if (!enabled || isDemoMode() || !Array.isArray(asgn) || asgn.length === 0) return;
    if (runningRef.current) return;

    const now = Date.now();
    const seen = loadSeen();
    const items = [];

    for (const a of asgn) {
      if (!a || a.st === 'completed' || a.st === 'loading' || !a.due) continue;
      const dueMs = a.due instanceof Date ? a.due.getTime() : new Date(a.due).getTime();
      if (!Number.isFinite(dueMs)) continue;
      const remaining = dueMs - now;
      if (remaining <= 0) continue;

      // Tightest satisfied threshold (THRESHOLDS is widest → tightest, last wins).
      let chosen = null;
      for (const t of THRESHOLDS) { if (remaining <= t.ms) chosen = t; }
      if (!chosen) continue;

      const dk = `deadline:${a.id}:${chosen.key}`;
      if (seen.has(dk)) continue;
      items.push({
        assignmentId: a.id,
        title: a.title,
        courseId: a.cid,
        due: new Date(dueMs).toISOString(),
        threshold: chosen.key,
        kind,
      });
    }

    if (items.length === 0) return;

    runningRef.current = true;
    fetch('/api/notifications/deadline', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items }),
    })
      .then((r) => {
        if (!r.ok) return;
        items.forEach(it => seen.add(`deadline:${it.assignmentId}:${it.threshold}`));
        saveSeen(seen);
      })
      .catch(() => {})
      .finally(() => { runningRef.current = false; });
  }, [asgn, enabled, kind]);
}
