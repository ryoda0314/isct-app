-- =============================================================
-- Freshman Board: 新入生掲示板
-- Supabase Dashboard の SQL Editor で実行
-- =============================================================

-- ── 投稿テーブル ──
create table if not exists freshman_posts (
  id              bigint generated always as identity primary key,
  category        text not null,                 -- course_reg, circle, campus_life
  moodle_user_id  bigint not null references profiles(moodle_id),
  text            text not null,
  type            text not null default 'discussion',  -- discussion, question
  year_group      text,                                -- 投稿者の学年 (e.g. '25B')
  likes           bigint[] default '{}',
  pinned          boolean default false,
  edited_at       timestamptz,
  created_at      timestamptz default now()
);

create index if not exists idx_fp_category on freshman_posts(category, created_at desc);
create index if not exists idx_fp_pinned   on freshman_posts(pinned) where pinned = true;

alter table freshman_posts enable row level security;
create policy "anon_select_freshman_posts" on freshman_posts for select to anon using (true);
alter publication supabase_realtime add table freshman_posts;

-- ── コメントテーブル ──
create table if not exists freshman_comments (
  id              bigint generated always as identity primary key,
  post_id         bigint not null references freshman_posts(id) on delete cascade,
  moodle_user_id  bigint not null references profiles(moodle_id),
  text            text not null,
  created_at      timestamptz default now()
);

create index if not exists idx_fc_post on freshman_comments(post_id, created_at asc);

alter table freshman_comments enable row level security;
create policy "anon_select_freshman_comments" on freshman_comments for select to anon using (true);
alter publication supabase_realtime add table freshman_comments;
