// ツバメポイントのクライアント側ロジック（純粋関数・UI 非依存）。
//   レベルは累計獲得(totalEarned)から算出する。サーバーには保存しない。
//   付与ルールのしきい値は supabase/tsubame-points.sql の RPC と揃えること。

// レベル曲線: レベル n に必要な累計 = 50 * (n-1)^2
//   L1:0  L2:50  L3:200  L4:450  L5:800  L6:1250 ...（緩やかな二次曲線）
const LEVEL_FACTOR = 50;

const thresholdForLevel = (level) => LEVEL_FACTOR * (level - 1) * (level - 1);

// totalEarned から現在レベルと「次レベルまでの進捗」を返す。
export function levelInfo(totalEarned = 0) {
  const total = Math.max(0, Math.floor(totalEarned));
  const level = Math.floor(Math.sqrt(total / LEVEL_FACTOR)) + 1;
  const curThreshold = thresholdForLevel(level);
  const nextThreshold = thresholdForLevel(level + 1);
  const span = nextThreshold - curThreshold;        // このレベルの幅
  const intoLevel = total - curThreshold;            // このレベルで稼いだ分
  const toNext = nextThreshold - total;              // 次レベルまで
  const progress = span > 0 ? intoLevel / span : 1;  // 0..1
  return { level, total, curThreshold, nextThreshold, span, intoLevel, toNext, progress };
}

// 台帳 reason → i18n キー。未知の reason はそのまま reason を表示。
export const REASON_KEY = {
  daily_login: 'tsubame.reasonDaily',
  streak_milestone: 'tsubame.reasonMilestone',
  attendance: 'tsubame.reasonAttendance',
  friend_added: 'tsubame.reasonFriend',
};

// ストリークのマイルストーン（RPC と一致させる）。次の目標表示に使う。
export const STREAK_MILESTONES = [7, 30, 100, 365];

// 現在ストリークから「次のマイルストーン」を返す（無ければ null）。
export function nextMilestone(streak = 0) {
  return STREAK_MILESTONES.find((m) => m > streak) ?? null;
}
