// ============================================================
// ログイン状態（ログイン任意化）
//
// demoMode.js と同じ「モジュール単位の singleton」。App.jsx が書き、各画面は useAuth() で読む。
//
//   status : "loading" | "guest" | "account"
//            guest   … ログインしていない。正常な状態（エラーではない）
//            account … 有効なセッションがある（デモモードも account として扱う）
//   portal : "ok" | "reauth" | "down"
//            account のときだけ意味がある。reauth = LMS に入れない（パスワード変更など）。
//            down = LMS の障害（キャッシュ表示中）。DM・投稿などアカウントの機能は止めない。
//   demo   : デモモード中か
// ============================================================
import { useState, useEffect } from "react";

let state = { status: "loading", portal: "ok", demo: false };
const listeners = new Set();

export const getAuth = () => state;
export const isAccount = () => state.status === "account";

export function setAuth(patch) {
  const next = { ...state, ...patch };
  if (next.status === state.status && next.portal === state.portal && next.demo === state.demo) return;
  state = next;
  listeners.forEach((fn) => fn(state));
}

export function useAuth() {
  const [s, set] = useState(state);
  useEffect(() => {
    listeners.add(set);
    set(state);
    return () => { listeners.delete(set); };
  }, []);
  return s;
}

// ── ログイン画面を開く（App.jsx が登録）。intent = 使おうとした機能の view ID、returnTo = 終わったら開く画面 ──
let opener = null;
export const setLoginOpener = (fn) => { opener = fn; };
export const openLogin = (opts = {}) => { opener?.(opts); };
