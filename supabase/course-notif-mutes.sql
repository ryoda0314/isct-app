-- =============================================================
-- Course notification mutes: ユーザーが特定コースの「新規投稿通知」を
-- 個別にオフにするためのテーブル。
-- Supabase Dashboard の SQL Editor で実行。
-- =============================================================
--
-- なぜサーバー側で持つか:
--   既存の notifSettings は localStorage のみで、サーバー(Web Push を送る側)からは
--   読めない。そのため「このコースの通知だけ切る」を Push まで含めて効かせるには
--   サーバーが参照できる購読テーブルが必要。lib/course-notify.js が投稿通知の
--   配信前にここを引いて、ミュート済みユーザーを除外する。
--
-- course_id は posts.course_id と同一表記（実科目は "mc_<moodleid>"）。
-- 通知対象は実科目のみ（global:/dept: の仮想ルームは対象外）だが、キーは汎用に text。

create table if not exists course_notif_mutes (
  moodle_user_id  bigint not null references profiles(moodle_id),
  course_id       text   not null,
  created_at      timestamptz not null default now(),
  primary key (moodle_user_id, course_id)
);

-- 配信時に「このコースをミュートしている在籍者」を引く用途
create index if not exists idx_course_notif_mutes_course on course_notif_mutes(course_id);

alter table course_notif_mutes enable row level security;
-- anon / authenticated には一切許可しない。読み書きは /api/notifications/course-mute が
-- service_role で行う（service_role はデフォルトで RLS をバイパス）。
