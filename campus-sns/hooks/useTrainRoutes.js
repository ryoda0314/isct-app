import { useState, useEffect, useCallback } from 'react';
import { t } from "../i18n.js";
import { isDemoMode } from '../demoMode.js';
import { showToast } from './useToast.js';

// 登録電車ルート hook。routes は [{id, railway, station, direction, train_type, label, sort_order}]
export function useTrainRoutes(enabled = true) {
  const [routes, setRoutes] = useState([]);
  const [loading, setLoading] = useState(false);

  const refetch = useCallback(async () => {
    if (isDemoMode() || !enabled) return;
    setLoading(true);
    try {
      const r = await fetch('/api/train/routes');
      if (r.ok) setRoutes(await r.json());
    } catch (e) {
      console.error('[useTrainRoutes fetch]', e);
    }
    setLoading(false);
  }, [enabled]);

  useEffect(() => { refetch(); }, [refetch]);

  // route: { railway, station, direction, train_type?, label? }
  const addRoute = useCallback(async (route) => {
    if (isDemoMode()) return;
    try {
      const r = await fetch('/api/train/routes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...route, sort_order: routes.length }),
      });
      if (!r.ok) throw new Error('add failed');
      const saved = await r.json();
      setRoutes((cur) => {
        const without = cur.filter((x) => x.id !== saved.id);
        return [...without, saved];
      });
    } catch (e) {
      console.error('[useTrainRoutes add]', e);
      showToast(t("train.addFailed"));
    }
  }, [routes.length]);

  const removeRoute = useCallback(async (id) => {
    const prev = routes;
    setRoutes((cur) => cur.filter((x) => x.id !== id)); // 楽観削除
    if (isDemoMode()) return;
    try {
      const r = await fetch('/api/train/routes', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      if (!r.ok) throw new Error('delete failed');
    } catch (e) {
      console.error('[useTrainRoutes remove]', e);
      setRoutes(prev); // ロールバック
      showToast(t("train.removeFailed"));
    }
  }, [routes]);

  return { routes, loading, addRoute, removeRoute, refetch };
}
