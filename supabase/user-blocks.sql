-- =============================================================
-- User Blocks Migration: ユーザーブロック機能
-- Supabase Dashboard の SQL Editor で実行
-- =============================================================

-- 1. user_blocks: ユーザー間ブロック
create table if not exists user_blocks (
  id              bigint generated always as identity primary key,
  blocker_id      bigint not null references profiles(moodle_id),
  blocked_id      bigint not null references profiles(moodle_id),
  created_at      timestamptz default now(),
  unique(blocker_id, blocked_id),
  check(blocker_id != blocked_id)
);
create index if not exists idx_user_blocks_blocker on user_blocks(blocker_id);
create index if not exists idx_user_blocks_blocked on user_blocks(blocked_id);
alter table user_blocks enable row level security;
-- anon アクセス不可 (service_role のみ)
