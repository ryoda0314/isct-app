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

  // route: { origin_station, dest_station, label? }
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

  // ホーム表示フラグの切替（楽観更新）
  const toggleHome = useCallback(async (id, on) => {
    setRoutes((cur) => cur.map((x) => x.id === id ? { ...x, on_home: on } : x));
    if (isDemoMode()) return;
    try {
      const r = await fetch('/api/train/routes', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, on_home: on }),
      });
      if (!r.ok) throw new Error('patch failed');
    } catch (e) {
      console.error('[useTrainRoutes toggleHome]', e);
      setRoutes((cur) => cur.map((x) => x.id === id ? { ...x, on_home: !on } : x));
      showToast(t("train.homeFailed"));
    }
  }, []);

  // 種別フィルタの更新（楽観更新）。type_filter: 表示する種別IDの配列。空=全表示。
  const setFilter = useCallback(async (id, type_filter) => {
    const norm = Array.isArray(type_filter) && type_filter.length ? type_filter : null;
    const prev = routes;
    setRoutes((cur) => cur.map((x) => x.id === id ? { ...x, type_filter: norm } : x));
    if (isDemoMode()) return;
    try {
      const r = await fetch('/api/train/routes', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, type_filter: norm }),
      });
      if (!r.ok) throw new Error('patch failed');
    } catch (e) {
      console.error('[useTrainRoutes setFilter]', e);
      setRoutes(prev);
      showToast(t("train.filterFailed"));
    }
  }, [routes]);

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

  return { routes, loading, addRoute, removeRoute, toggleHome, setFilter, refetch };
}
