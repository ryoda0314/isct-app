import { useState, useEffect, useCallback, useRef } from "react";

// ツバメポイントのデータ取得・デイリー受け取り。
//   state   : { balance, totalEarned, currentStreak, longestStreak, claimedToday, ledger }
//   ranking : { ranking:[...], myRank }
//   claim() : デイリー受け取り（冪等）。{ claimed, awarded, ... } を返す。
// 書き込みは /api/tsubame/* 経由（サーバーで moodle_user_id を確定）。
export function useTsubamePoints({ enabled = true } = {}) {
  const [state, setState] = useState({
    balance: 0, totalEarned: 0, currentStreak: 0, longestStreak: 0,
    claimedToday: false, ledger: [],
  });
  const [ranking, setRanking] = useState({ ranking: [], myRank: null });
  const [loading, setLoading] = useState(true);

  const refreshState = useCallback(async () => {
    try { const r = await fetch("/api/tsubame/state"); if (r.ok) setState(await r.json()); } catch {}
  }, []);
  const refreshRanking = useCallback(async () => {
    try { const r = await fetch("/api/tsubame/ranking"); if (r.ok) setRanking(await r.json()); } catch {}
  }, []);

  const claim = useCallback(async () => {
    const r = await fetch("/api/tsubame/claim", { method: "POST" });
    if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error || "claim_failed"); }
    const res = await r.json();
    // 受け取れた場合は表示を即更新（履歴は再取得）
    if (res.claimed) {
      setState((p) => ({
        ...p,
        balance: res.balance,
        totalEarned: res.total_earned,
        currentStreak: res.streak,
        longestStreak: res.longest_streak,
        claimedToday: true,
      }));
      refreshState();
    } else {
      setState((p) => ({ ...p, claimedToday: true }));
    }
    return res;
  }, [refreshState]);

  useEffect(() => {
    if (!enabled) { setLoading(false); return; }
    Promise.all([refreshState(), refreshRanking()]).finally(() => setLoading(false));
  }, [enabled, refreshState, refreshRanking]);

  return { state, ranking, loading, claim, refreshState, refreshRanking };
}

// アプリ起動時に 1 回だけデイリーを受け取る軽量フック（View を開かなくても貯まる）。
//   受け取れたら onClaimed(res) を呼ぶ（トースト表示用）。
//   セッション内の二重実行は claimedRef で防止（StrictMode 対策）。
export function useDailyTsubameClaim({ active, onClaimed }) {
  const claimedRef = useRef(false);
  const cbRef = useRef(onClaimed);
  cbRef.current = onClaimed;

  useEffect(() => {
    if (!active || claimedRef.current) return;
    claimedRef.current = true;
    (async () => {
      try {
        const r = await fetch("/api/tsubame/claim", { method: "POST" });
        if (!r.ok) return;
        const res = await r.json();
        if (res.claimed) cbRef.current?.(res);
      } catch {}
    })();
  }, [active]);
}
