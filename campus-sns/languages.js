// ============================================================
// 語学学習コミュニティ — 対象言語マスタ
//
// 「主要言語＋日本語」の固定リスト。クライアント/サーバー双方から import する。
// 各コミュニティのルームキーは `lang:<code>` で、既存の posts/messages
// テーブル(course_id) をそのまま流用する（dept ルームと同じ方式）。
// ロールは 1言語につき 1つ（learner|native）、複数言語への参加は可。
// ============================================================

export const LANG_COMMUNITIES = [
  { code: "en", name: "English",           flag: "🇺🇸", col: "#4a7cf7" },
  { code: "zh", name: "中文",               flag: "🇨🇳", col: "#e5534b" },
  { code: "ko", name: "한국어",             flag: "🇰🇷", col: "#3dae72" },
  { code: "ja", name: "日本語",             flag: "🇯🇵", col: "#e04e6a" },
  { code: "fr", name: "Français",           flag: "🇫🇷", col: "#6366f1" },
  { code: "de", name: "Deutsch",            flag: "🇩🇪", col: "#d4843e" },
  { code: "es", name: "Español",            flag: "🇪🇸", col: "#c6a236" },
  { code: "it", name: "Italiano",           flag: "🇮🇹", col: "#2d9d8f" },
  { code: "pt", name: "Português",          flag: "🇵🇹", col: "#a855c7" },
  { code: "ru", name: "Русский",            flag: "🇷🇺", col: "#5b6b7a" },
  { code: "vi", name: "Tiếng Việt",         flag: "🇻🇳", col: "#e0982d" },
  { code: "id", name: "Bahasa Indonesia",   flag: "🇮🇩", col: "#4ea8e0" },
];

// 参加ロール
export const LANG_ROLES = ["learner", "native"];

// バリデーション用
export const LANG_CODES = new Set(LANG_COMMUNITIES.map((l) => l.code));
export const isLangCode = (code) => LANG_CODES.has(code);
export const isLangRole = (role) => LANG_ROLES.includes(role);

// ルームキー変換（既存 course_id / dept: と同じ名前空間）
export const roomIdForLang = (code) => `lang:${code}`;
export const langFromRoomId = (roomId) =>
  typeof roomId === "string" && roomId.startsWith("lang:") ? roomId.slice(5) : null;

export const langMeta = (code) => LANG_COMMUNITIES.find((l) => l.code === code) || null;
