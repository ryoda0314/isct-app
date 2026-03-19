-- admin_users: 管理者ユーザーテーブル
-- Supabase Dashboard の SQL Editor で実行
create table if not exists admin_users (
  moodle_user_id  bigint primary key references profiles(moodle_id),
  added_by        bigint,
  created_at      timestamptz default now()
);
