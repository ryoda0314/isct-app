import { useState, useEffect, useCallback } from 'react';
import { t } from "../i18n.js";
import { isDemoMode } from '../demoMode.js';
import { showToast } from './useToast.js';

// 出欠記録 hook。records は { [kind]: { [course_key]: { [session_key]: status } } }
export function useAttendance(enabled = true) {
  const [records, setRecords] = useState({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isDemoMode() || !enabled) return;
    setLoading(true);
    (async () => {
      try {
        const r = await fetch('/api/attendance');
        if (r.ok) setRecords(await r.json());
      } catch (e) {
        console.error('[useAttendance fetch]', e);
      }
      setLoading(false);
    })();
  }, [enabled]);

  // status: 'present'|'absent'|'late' を設定、null で未記録に戻す
  const setStatus = useCallback((kind, courseKey, session, status) => {
    const ck = String(courseKey);
    const sk = session.sessionKey;
    let prev;
    setRecords((cur) => {
      prev = cur[kind]?.[ck]?.[sk] ?? null;
      const next = { ...cur };
      const byKind = { ...(next[kind] || {}) };
      const byCourse = { ...(byKind[ck] || {}) };
      if (status == null) delete byCourse[sk];
      else byCourse[sk] = status;
      byKind[ck] = byCourse;
      next[kind] = byKind;
      return next;
    });

    if (isDemoMode()) return;

    const rollback = () => {
      setRecords((cur) => {
        const next = { ...cur };
        const byKind = { ...(next[kind] || {}) };
        const byCourse = { ...(byKind[ck] || {}) };
        if (prev == null) delete byCourse[sk];
        else byCourse[sk] = prev;
        byKind[ck] = byCourse;
        next[kind] = byKind;
        return next;
      });
      showToast(t("toast.attendanceUpdateFailed"));
    };

    (async () => {
      try {
        const r = status == null
          ? await fetch('/api/attendance', {
              method: 'DELETE',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ kind, course_key: ck, session_key: sk }),
            })
          : await fetch('/api/attendance', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                kind,
                course_key: ck,
                session_key: sk,
                session_date: session.dateStr || null,
                status,
              }),
            });
        if (!r.ok) rollback();
      } catch {
        rollback();
      }
    })();
  }, []);

  return { records, loading, setStatus };
}
