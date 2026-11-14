// キャリア（インターン・就職・イベント）を一般に公開しているか。
// site_settings の career = { public: true } で切り替え、/api/settings が career_public として返す（App.jsx の fetchSiteSettings）。
// 有効な掲載がそろうまでは false にしておき、管理者にだけ入口を出す（計画書 7 章 Phase 1）。
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

/** 入口（メニュー・しらべる・ホーム）を出してよいか: 公開中、または管理者 */
export function useCareerVisible(isAdmin) {
  const p = useCareerPublic();
  return p || !!isAdmin;
}
