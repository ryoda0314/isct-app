import { useState, useEffect, useCallback } from 'react';
import { t } from "../i18n.js";
import { isDemoMode } from '../demoMode.js';
import { showToast } from './useToast.js';
import { getAuth, useAuth } from '../authState.js';
import { LOCAL, readLocal, writeLocal, attendanceRecordsFromLocal, ACCOUNT_DATA_EVENT } from '../localStore.js';

// 出欠記録 hook。records は { [kind]: { [course_key]: { [session_key]: status } } }
// ログイン任意化: ゲストのときは端末（localStorage）に保存する。ログイン時に移行を聞く（localStore.js）。
export function useAttendance(enabled = true) {
  const [records, setRecords] = useState({});
  const [loading, setLoading] = useState(false);
  const local = useAuth().status !== 'account';
  const [reload, setReload] = useState(0);

  useEffect(() => {
    const h = () => setReload((n) => n + 1);
    window.addEventListener(ACCOUNT_DATA_EVENT, h);
    return () => window.removeEventListener(ACCOUNT_DATA_EVENT, h);
  }, []);

  useEffect(() => {
    if (isDemoMode() || !enabled) return;
    if (local) { setRecords(attendanceRecordsFromLocal()); return; }
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
  }, [enabled, local, reload]);

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
    if (getAuth().status !== 'account') {
      // 端末に保存（日付はアカウントへ移すときに使う）
      const map = readLocal(LOCAL.attendance, {});
      const k = `${kind}|${ck}|${sk}`;
      if (status == null) delete map[k];
      else map[k] = { kind, course_key: ck, session_key: sk, session_date: session.dateStr || null, status };
      writeLocal(LOCAL.attendance, map);
      return;
    }

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
