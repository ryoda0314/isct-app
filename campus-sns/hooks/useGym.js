import { useState, useEffect, useCallback } from "react";
import { useAuth } from "../authState.js";
import { LOCAL, readLocal, writeLocal, newLocalId } from "../localStore.js";

// トレセン機能のデータ取得・更新。
//   state       : { count, myState, myCheckedInAt }（現在人数=参考値・自分の在館状態）
//   announcements: スタッフお知らせ
//   history     : { sessions, monthCount, monthMin }（利用履歴）
//   workouts    : 筋トレ記録
// 書き込みは全て /api/gym/* 経由（サーバーで moodle_user_id を確定）。
// ログイン任意化: ゲストは営業時間・お知らせ（公開）と、トレーニング記録（端末に保存）だけ。
// チェックイン・現在人数・利用履歴は全員で共有するカウンタなのでアカウントのときだけ取りに行く。
export function useGym() {
  const local = useAuth().status !== "account";
  const [state, setState] = useState({ count: 0, myState: "out", myCheckedInAt: null });
  const [announcements, setAnnouncements] = useState([]);
  const [history, setHistory] = useState({ sessions: [], monthCount: 0, monthMin: 0 });
  const [workouts, setWorkouts] = useState([]);
  const [loading, setLoading] = useState(true);

  const refreshState = useCallback(async () => {
    if (local) return;
    try { const r = await fetch("/api/gym/state"); if (r.ok) setState(await r.json()); } catch {}
  }, [local]);
  const refreshHistory = useCallback(async () => {
    if (local) return;
    try { const r = await fetch("/api/gym/history"); if (r.ok) setHistory(await r.json()); } catch {}
  }, [local]);
  const refreshAnnouncements = useCallback(async () => {
    try { const r = await fetch("/api/gym/announcements"); if (r.ok) { const d = await r.json(); setAnnouncements(Array.isArray(d) ? d : []); } } catch {}
  }, []);
  const refreshWorkouts = useCallback(async () => {
    if (local) { setWorkouts(readLocal(LOCAL.gymWorkouts, [])); return; }
    try { const r = await fetch("/api/gym/workouts"); if (r.ok) { const d = await r.json(); setWorkouts(Array.isArray(d) ? d : []); } } catch {}
  }, [local]);

  useEffect(() => {
    Promise.all([refreshState(), refreshHistory(), refreshAnnouncements(), refreshWorkouts()])
      .finally(() => setLoading(false));
  }, [refreshState, refreshHistory, refreshAnnouncements, refreshWorkouts]);

  // 復帰時に現在人数を最新化
  useEffect(() => {
    const onFocus = () => { if (document.visibilityState !== "hidden") refreshState(); };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [refreshState]);

  // QRチェックイン/アウト。{ state, at, durationMin, count } を返す（失敗時は throw）。
  const checkin = useCallback(async (qr) => {
    const r = await fetch("/api/gym/checkin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ qr }),
    });
    if (!r.ok) {
      const e = await r.json().catch(() => ({}));
      throw new Error(e.error || "checkin_failed");
    }
    const res = await r.json();
    setState((p) => ({ ...p, count: res.count, myState: res.state, myCheckedInAt: res.state === "in" ? res.at : null }));
    refreshHistory();
    return res;
  }, [refreshHistory]);

  // 筋トレ記録 追加
  const addWorkout = useCallback(async (fields) => {
    if (local) {
      const num = (v) => (v === "" || v == null || Number.isNaN(Number(v)) ? null : Number(v));
      const name = String(fields.exercise_name || "").trim().slice(0, 100);
      if (!name) throw new Error("invalid params");
      const rec = { id: newLocalId("lw"), exercise_name: name, weight_kg: num(fields.weight_kg), reps: num(fields.reps), sets: num(fields.sets), notes: String(fields.notes || "").slice(0, 1000) || null, logged_at: fields.logged_at || new Date().toISOString() };
      const next = [rec, ...readLocal(LOCAL.gymWorkouts, [])];
      writeLocal(LOCAL.gymWorkouts, next); setWorkouts(next);
      return rec;
    }
    const r = await fetch("/api/gym/workouts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(fields),
    });
    if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error || "save_failed"); }
    const rec = await r.json();
    setWorkouts((prev) => [rec, ...prev]);
    return rec;
  }, [local]);

  // 筋トレ記録 削除（楽観的）
  const removeWorkout = useCallback(async (id) => {
    setWorkouts((prev) => prev.filter((w) => w.id !== id));
    if (local) { writeLocal(LOCAL.gymWorkouts, readLocal(LOCAL.gymWorkouts, []).filter((w) => w.id !== id)); return; }
    try { await fetch(`/api/gym/workouts?id=${encodeURIComponent(id)}`, { method: "DELETE" }); } catch {}
  }, [local]);

  return {
    state, announcements, history, workouts, loading,
    checkin, addWorkout, removeWorkout,
    refreshState, refreshAnnouncements,
  };
}
