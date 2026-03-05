-- =============================================================
-- Supabase Migration: ScienceTokyo App リアルタイム機能
-- Supabase Dashboard の SQL Editor で実行
-- =============================================================

-- 1. profiles: ユーザー情報
create table if not exists profiles (
  moodle_id  bigint primary key,
  name       text not null,
  avatar     text,          -- 1文字アバター (e.g. "田")
  color      text,          -- テーマカラー (#hex)
  dept       text,
  status     text default 'offline',
  created_at timestamptz default now()
);

-- 2. messages: コースチャット
create table if not exists messages (
  id              bigint generated always as identity primary key,
  course_id       text not null,
  moodle_user_id  bigint not null references profiles(moodle_id),
  text            text not null,
  created_at      timestamptz default now()
);
create index if not exists idx_messages_course on messages(course_id, created_at desc);

-- 3. dm_conversations: DM会話
create table if not exists dm_conversations (
  id         bigint generated always as identity primary key,
  user1_id   bigint not null references profiles(moodle_id),
  user2_id   bigint not null references profiles(moodle_id),
  created_at timestamptz default now(),
  unique(user1_id, user2_id)
);

-- 4. dm_messages: DMメッセージ
create table if not exists dm_messages (
  id              bigint generated always as identity primary key,
  conversation_id bigint not null references dm_conversations(id) on delete cascade,
  sender_id       bigint not null references profiles(moodle_id),
  text            text not null,
  created_at      timestamptz default now()
);
create index if not exists idx_dm_messages_conv on dm_messages(conversation_id, created_at desc);

-- 5. notifications: 通知
create table if not exists notifications (
  id              bigint generated always as identity primary key,
  moodle_user_id  bigint not null references profiles(moodle_id),
  type            text not null,  -- reply, like, deadline, event, mention, dm
  text            text not null,
  course_id       text,
  read            boolean default false,
  created_at      timestamptz default now()
);
create index if not exists idx_notifications_user on notifications(moodle_user_id, created_at desc);

-- 6. RLS無効（学内ツールのため）
alter table profiles disable row level security;
alter table messages disable row level security;
alter table dm_conversations disable row level security;
alter table dm_messages disable row level security;
alter table notifications disable row level security;

-- 7. Realtime有効化
-- Supabase Dashboard → Database → Replication で以下を有効化:
--   messages, dm_messages, notifications
-- または以下を実行:
alter publication supabase_realtime add table messages;
alter publication supabase_realtime add table dm_messages;
alter publication supabase_realtime add table notifications;

-- 8. shared_materials: ユーザー共有資料
create table if not exists shared_materials (
  id              bigint generated always as identity primary key,
  course_id       text not null,
  moodle_user_id  bigint not null references profiles(moodle_id),
  filename        text not null,
  filesize        bigint default 0,
  mimetype        text,
  category        text not null default 'notes',  -- past_exam, notes, exercise, other
  storage_path    text not null,
  created_at      timestamptz default now()
);
create index if not exists idx_shared_materials_course on shared_materials(course_id, created_at desc);
alter table shared_materials disable row level security;
alter publication supabase_realtime add table shared_materials;

-- Storage bucket for shared materials
insert into storage.buckets (id, name, public) values ('shared-materials', 'shared-materials', true)
on conflict do nothing;

-- 9. friendships: 友達関係
create table if not exists friendships (
  id           bigint generated always as identity primary key,
  requester_id bigint not null references profiles(moodle_id),
  addressee_id bigint not null references profiles(moodle_id),
  status       text not null default 'pending',  -- pending, accepted, rejected, blocked
  created_at   timestamptz default now(),
  updated_at   timestamptz default now(),
  unique(requester_id, addressee_id),
  check(requester_id != addressee_id)
);
create index if not exists idx_friendships_requester on friendships(requester_id, status);
create index if not exists idx_friendships_addressee on friendships(addressee_id, status);
alter table friendships disable row level security;
alter publication supabase_realtime add table friendships;
