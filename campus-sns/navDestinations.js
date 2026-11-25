import { roomToSpot } from "./hooks/useLocationSharing.js";

// 2D ナビとマップ内のスマホで同じ、端末内の目的地履歴を使う。
const RECENT_KEY = "navRecentSpots";
export function getRecentDestinations() {
  try {
    const ids = JSON.parse(localStorage.getItem(RECENT_KEY) || "[]");
    return Array.isArray(ids) ? ids.filter(id => typeof id === "string").slice(0, 6) : [];
  } catch {
    return [];
  }
}

export function rememberDestination(id) {
  if (!id) return;
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify([id, ...getRecentDestinations().filter(old => old !== id)].slice(0, 6)));
  } catch { /* 端末に保存できなくても案内は使える */ }
}

export const normalizeDestination = value => String(value || "").normalize("NFKC").toLowerCase()
  .replace(/\s+/g, "").replace(/[ァ-ヶ]/g, c => String.fromCharCode(c.charCodeAt(0) - 0x60));

const names = {
  eki: ["おおおかやまえき", "おおかやまえき", "駅", "ookayama station"],
  ookayama_kitaguchi: ["きたぐちしょうてんがい", "しょうてんがい", "shopping street"],
  tokyu_store: ["とうきゅうすとあ", "すーぱー", "tokyu store", "supermarket"],
  lib: ["としょかん", "library"],
  main: ["ほんかん", "main building"],
  taki: ["たきぷらざ", "たきプラ", "滝プラザ"],
  cafe: ["しょくどう", "がくしょく", "学食", "cafeteria"],
  coop: ["せいきょう", "生協購買", "co-op"],
  gym: ["たいいくかん", "gymnasium"],
};

export function destinationRoom(query) {
  return query ? roomToSpot(query.normalize("NFKC").trim().toUpperCase()) : null;
}

// 完全一致 → 前方一致 → 部分一致。同点のときは呼ぶ側が現在地からの距離などで並べる。
export function destinationScore(s, query) {
  if (!query) return 0;
  const fields = [s.label, s.short, s.id, ...(names[s.id] || [])].map(normalizeDestination);
  if (fields.includes(query)) return 100;
  if (fields.some(field => field.startsWith(query))) return 80;
  if (fields.some(field => field.includes(query))) return 60;
  if (normalizeDestination(s.meta?.genre).includes(query)) return 40;
  return -1;
}
