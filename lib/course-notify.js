import { getSupabaseAdmin } from './supabase/server.js';
import { sendPushToUsers } from './push.js';

const toMoodleId = (id) => (id?.startsWith?.('mc_') ? id.slice(3) : id);

// 一度の投稿で通知するのは実科目の在籍者だけ。global:/dept: 等の仮想ルームは
// 学院/系/クラス単位で数千人規模になり得るため対象外（毎投稿での大量 Push/行を回避）。
function isRealCourse(courseId) {
  const mid = toMoodleId(String(courseId || ''));
  return /^\d+$/.test(mid);
}

/**
 * 新規タイムライン投稿を、その科目の在籍者へ通知する。
 * - 対象: course_enrollments に載る実科目の在籍者（投稿者本人は除外）
 * - 除外: course_notif_mutes でそのコースをミュートしているユーザー
 * - 配信: notifications 行の挿入 ＋ Web/ネイティブ Push（fire-and-forget 前提）
 *
 * 通知テキストは i18n の formatNotif() が再ローカライズできる固定表現にする。
 *
 * @param {object} p
 * @param {string} p.courseId   posts.course_id（実科目なら "mc_<id>"）
 * @param {number} p.authorId   投稿者の moodle id
 * @param {string} p.authorName 投稿者名
 * @param {boolean} [p.anon]    匿名投稿なら true（投稿者名を出さない）
 */
export async function notifyCoursePost({ courseId, authorId, authorName, anon = false }) {
  if (!courseId || !isRealCourse(courseId)) return;
  const sb = getSupabaseAdmin();

  // 1. 在籍者を取得（この科目に enroll 済みの全員）
  const { data: enrollments, error: enrollErr } = await sb
    .from('course_enrollments')
    .select('moodle_user_id')
    .eq('course_moodle_id', Number(toMoodleId(courseId)));
  if (enrollErr) { console.error('[notifyCoursePost] enroll:', enrollErr.message); return; }
  if (!enrollments?.length) return;

  let recipients = [...new Set(enrollments.map(e => e.moodle_user_id))]
    .filter(id => id != null && id !== authorId);
  if (!recipients.length) return;

  // 2. このコースをミュートしている在籍者を除外
  const { data: mutes } = await sb
    .from('course_notif_mutes')
    .select('moodle_user_id')
    .eq('course_id', courseId)
    .in('moodle_user_id', recipients);
  if (mutes?.length) {
    const muted = new Set(mutes.map(m => m.moodle_user_id));
    recipients = recipients.filter(id => !muted.has(id));
  }
  if (!recipients.length) return;

  // 3. 通知テキスト（formatNotif が拾える固定表現）
  const text = anon
    ? 'タイムラインに新しい匿名投稿があります'
    : `${authorName || '誰か'}さんがタイムラインに投稿しました`;

  const rows = recipients.map(uid => ({
    moodle_user_id: uid,
    type: 'course',
    text,
    course_id: courseId,
  }));

  const { error: insErr } = await sb.from('notifications').insert(rows);
  if (insErr) console.error('[notifyCoursePost] insert:', insErr.message);

  // 4. Push（在籍者分をまとめて 1 クエリで購読取得して配信）
  sendPushToUsers(recipients, {
    title: '新しい投稿',
    body: text,
    tag: `course-post:${courseId}`,
  }).catch(() => {});
}
