// ============================================================
// 端末の保存領域（localStorage）のうち「アカウントのもの」と「端末のもの」を分ける（ログイン任意化）
//
// 以前のログアウトは localStorage.clear() で、テーマ・言語・ノート一覧・同意フラグまで消していた。
// ログインしなくても使えるアプリになったので、ログアウトで消すのはアカウントに属するものだけにする。
//
// 方針: 残すものを許可リストで持つ（知らないキーは消す＝アカウントの情報を取り残さない側に倒す）。
// 新しい「端末のデータ」を localStorage に足したら、ここにも足すこと。
// ============================================================

// そのまま残すキー（完全一致）
const KEEP_EXACT = new Set([
  // 表示
  "themePref", "accentPref", "langPref", "sitelenPona", "fontSize",
  // ホーム・お知らせ
  "quickAccess", "dismissed_announcements", "seen_announcement_popups",
  // 地図・ナビ
  "mapLocConsent", "myLocation", "spotRegs",
  // 時間割の表示（年度・クォーター）
  "quarter", "tty", "tt_merged",
  // カレンダーのよく使う予定・イベントの参加予定（ゲストでも使う）
  "calFavPresets", "eventRsvps",
  // 通知の設定（端末の好み）
  "notifEnabled", "notifSettings",
  // 利用規約への同意
  "privacyAgreed",
]);

// 前方一致で残すもの
const KEEP_PREFIX = [
  "cb3",          // 3D 地図の見え方・詳細モード・デバッグ
  "nav",          // キャンパスナビ（navView3d / navBasemap / navQuickSpots / navRecentSpots）
  "wx",           // 天気（wxCache / wxLoc）
  "notes",        // 手書きノート（notes_index_v1 / notes_data_* / notesLibMode）
  "reg",          // 履修登録補助（reg_prefs / reg_<学年>_<Q>）
  "guest_",       // 端末保存のデータ（タスク・予定・経路・出欠・ジム）
  "guestProfile", // ゲストの所属
  "mytt_",        // 時間割をつくる
];

export function isDeviceKey(key) {
  if (!key) return false;
  if (KEEP_EXACT.has(key)) return true;
  return KEEP_PREFIX.some((p) => key.startsWith(p));
}

// 「この端末でアカウントを使っていた」印。起動時、これが無ければセッション確認を待たずにゲストで開く。
const ACCOUNT_MARK = "acct";
export function markAccount() {
  try { localStorage.setItem(ACCOUNT_MARK, "1"); } catch {}
}
export function hadAccount() {
  try { return !!(localStorage.getItem(ACCOUNT_MARK) || localStorage.getItem("dataAllCache")); } catch { return false; }
}

/**
 * ログアウト・セッション切れのときに呼ぶ。アカウントのキーだけ消す。
 * everything=true（「この端末のデータもすべて消す」）なら localStorage を全部消し、ノートの IndexedDB も消す。
 */
export function clearAccountStorage({ everything = false } = {}) {
  try {
    if (everything) {
      localStorage.clear();
      try { indexedDB.deleteDatabase("sciencetokyo_notes_db"); } catch {}
      return;
    }
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) keys.push(localStorage.key(i));
    for (const k of keys) if (!isDeviceKey(k)) localStorage.removeItem(k);
  } catch {}
}
