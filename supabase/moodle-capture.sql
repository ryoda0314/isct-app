-- Moodle raw data capture (医歯学系のMoodleデータ形式確認用)
-- 管理者が指定したユーザーIDのMoodleコース一覧を一時保存し、
-- 管理画面で形式を確認するための仕組み。

create table if not exists moodle_capture (
  id              bigint generated always as identity primary key,
  moodle_user_id  bigint not null,
  user_name       text,
  raw_courses     jsonb not null,       -- Moodle APIの生レスポンス
  course_count    int not null default 0,
  captured_at     timestamptz default now()
);

create index if not exists idx_moodle_capture_user on moodle_capture(moodle_user_id);
create index if not exists idx_moodle_capture_at on moodle_capture(captured_at desc);

alter table moodle_capture enable row level security;
-- サービスロールのみアクセス可
