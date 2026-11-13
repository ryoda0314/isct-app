// 未ログイン（ゲスト）の閲覧者に返す投稿・コメントから、投稿者を特定できる項目を外す（ログイン任意化）。
// 新入生掲示板は未ログインでも読めるが、投稿者名・アイコン・ID・いいねした人の ID は返さない。
//
// - moodle_user_id → null（クライアントはこれでプロフィールを開くので、開けなくなる）
// - profiles → 「在学生」（旧クライアントでも空欄にならないよう名前は文字で返す。新クライアントは masked を見て訳す）
// - likes（いいねした人の ID 配列）→ 同じ長さの 0 の配列（件数だけ残す。クライアントは length と includes(自分) しか見ない）
// - year_group（学年バッジ）は個人を特定しないので残す

export const MASKED_AUTHOR_NAME = '在学生';

export function maskAuthor(row) {
  if (!row || typeof row !== 'object') return row;
  const out = { ...row, moodle_user_id: null, masked: true, profiles: { name: MASKED_AUTHOR_NAME, avatar: null, color: null } };
  if (Array.isArray(row.likes)) out.likes = new Array(row.likes.length).fill(0);
  return out;
}
