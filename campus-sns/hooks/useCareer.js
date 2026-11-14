// キャリアの掲載一覧（/api/career）。誰が見ても同じ内容なので、アプリ全体で 1 つを共有し 5 分は使い回す。
// 絞り込みはサーバーに送らない（campus-sns/careerPrefs.js が端末で行う）。
import { useEffect, useState, useCallback } from "react";

const TTL = 5 * 60 * 1000;
let cache = { items: null, at: 0, error: false };
let inflight = null;
const subs = new Set();
const notify = () => subs.forEach((f) => f());

async function load(force = false) {
  if (!force && cache.items && Date.now() - cache.at < TTL) return;
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const r = await fetch("/api/career");
      if (!r.ok) throw new Error(String(r.status));
      const d = await r.json();
      cache = { items: Array.isArray(d.items) ? d.items : [], at: Date.now(), error: false };
    } catch {
      cache = { ...cache, error: true };
    } finally {
      inflight = null;
      notify();
    }
  })();
  return inflight;
}

export function useCareer(enabled = true) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const f = () => setTick((n) => n + 1);
    subs.add(f);
    if (enabled) load();
    return () => { subs.delete(f); };
  }, [enabled]);
  const reload = useCallback(() => load(true), []);
  return { items: cache.items || [], loading: enabled && !cache.items && !cache.error, error: cache.error && !cache.items, reload };
}
