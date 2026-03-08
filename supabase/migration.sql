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

-- 6. RLS: anon は SELECT のみ（リアルタイム購読用）、書き込みは service_role 経由のみ
alter table profiles enable row level security;
alter table messages enable row level security;
alter table dm_conversations enable row level security;
alter table dm_messages enable row level security;
alter table notifications enable row level security;

create policy "anon_select_profiles" on profiles for select to anon using (true);
create policy "anon_select_messages" on messages for select to anon using (true);
create policy "anon_select_dm_conversations" on dm_conversations for select to anon using (true);
create policy "anon_select_dm_messages" on dm_messages for select to anon using (true);
create policy "anon_select_notifications" on notifications for select to anon using (true);

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
alter table shared_materials enable row level security;
create policy "anon_select_shared_materials" on shared_materials for select to anon using (true);
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
alter table friendships enable row level security;
create policy "anon_select_friendships" on friendships for select to anon using (true);
alter publication supabase_realtime add table friendships;

-- 10. groups: グループ
create table if not exists groups (
  id         bigint generated always as identity primary key,
  name       text not null,
  avatar     text,          -- 1文字アバター
  color      text,          -- テーマカラー (#hex)
  creator_id bigint not null references profiles(moodle_id),
  created_at timestamptz default now()
);

-- 11. group_members: グループメンバー
create table if not exists group_members (
  id        bigint generated always as identity primary key,
  group_id  bigint not null references groups(id) on delete cascade,
  user_id   bigint not null references profiles(moodle_id),
  joined_at timestamptz default now(),
  unique(group_id, user_id)
);
create index if not exists idx_group_members_user on group_members(user_id);

-- 12. group_messages: グループメッセージ
create table if not exists group_messages (
  id         bigint generated always as identity primary key,
  group_id   bigint not null references groups(id) on delete cascade,
  sender_id  bigint not null references profiles(moodle_id),
  text       text not null,
  created_at timestamptz default now()
);
create index if not exists idx_group_messages_group on group_messages(group_id, created_at desc);

alter table groups enable row level security;
alter table group_members enable row level security;
alter table group_messages enable row level security;

create policy "anon_select_groups" on groups for select to anon using (true);
create policy "anon_select_group_members" on group_members for select to anon using (true);
create policy "anon_select_group_messages" on group_messages for select to anon using (true);

alter publication supabase_realtime add table group_members;
alter publication supabase_realtime add table group_messages;

-- 13. posts: コースタイムライン投稿
create table if not exists posts (
  id              bigint generated always as identity primary key,
  course_id       text not null,
  moodle_user_id  bigint not null references profiles(moodle_id),
  text            text not null,
  type            text not null default 'discussion',  -- question, material, info, discussion, poll, anon
  year_group      text,                                -- 学年グループ (e.g. '23B','24B','25B') null=全体
  likes           bigint[] default '{}',               -- いいねしたユーザーの moodle_id 配列
  created_at      timestamptz default now()
);
create index if not exists idx_posts_course on posts(course_id, created_at desc);
alter table posts enable row level security;
create policy "anon_select_posts" on posts for select to anon using (true);
alter publication supabase_realtime add table posts;

-- 14. user_tokens: サーバーレス環境でのトークン永続化
create table if not exists user_tokens (
  login_id        text primary key,
  wstoken         text not null,
  moodle_user_id  bigint not null,
  fullname        text,
  updated_at      timestamptz default now()
);
alter table user_tokens enable row level security;
-- anon アクセス不可 (service_role のみ)
