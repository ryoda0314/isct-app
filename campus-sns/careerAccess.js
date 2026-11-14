// キャリア（インターン・就職・イベント）をメニューに出して一般公開しているか。
// site_settings の career = { public: true } で切り替え、/api/settings が career_public として返す（App.jsx の fetchSiteSettings）。
// false の間は「限定公開」: メニュー・しらべる・ホームには出さない（管理者には出す）が、
// リンク（https://sciencetokyo.app/#career）を知っていれば誰でも開ける。
import { useSyncExternalStore } from "react";

let pub = false;
const subs = new Set();

export function setCareerPublic(v) {
  const next = !!v;
  if (next === pub) return;
  pub = next;
  subs.forEach((f) => f());
}

export const isCareerPublic = () => pub;

export function useCareerPublic() {
  return useSyncExternalStore(
    (cb) => { subs.add(cb); return () => subs.delete(cb); },
    () => pub,
    () => false,
  );
}

/** 入口（メニュー・しらべる・ホーム）を出してよいか: 一般公開中、または管理者（限定公開中もリンクからは誰でも開ける） */
export function useCareerVisible(isAdmin) {
  const p = useCareerPublic();
  return p || !!isAdmin;
}
