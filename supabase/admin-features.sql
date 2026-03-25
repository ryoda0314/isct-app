-- =============================================================
-- Admin Features Migration: 通報・BAN・お知らせ・監査ログ
-- Supabase Dashboard の SQL Editor で実行
-- =============================================================

-- 1. profiles に banned カラム追加
alter table profiles add column if not exists banned boolean default false;
alter table profiles add column if not exists banned_at timestamptz;
alter table profiles add column if not exists ban_reason text;

-- 2. reports: ユーザー通報
create table if not exists reports (
  id              bigint generated always as identity primary key,
  reporter_id     bigint not null references profiles(moodle_id),
  target_type     text not null,        -- post, comment, message, dm, user, circle
  target_id       text not null,        -- 対象のID
  target_user_id  bigint references profiles(moodle_id),  -- 通報対象のユーザー
  reason          text not null,        -- spam, harassment, inappropriate, copyright, other
  detail          text,                 -- 詳細説明
  status          text not null default 'pending',  -- pending, reviewed, resolved, dismissed
  admin_note      text,                 -- 管理者メモ
  resolved_by     bigint references profiles(moodle_id),
  resolved_at     timestamptz,
  created_at      timestamptz default now()
);
create index if not exists idx_reports_status on reports(status, created_at desc);
create index if not exists idx_reports_target on reports(target_type, target_id);
alter table reports enable row level security;
-- anon アクセス不可 (service_role のみ)

-- 3. announcements: 運営からのお知らせ
create table if not exists announcements (
  id              bigint generated always as identity primary key,
  title           text not null,
  body            text not null,
  type            text not null default 'info',  -- info, maintenance, update, urgent
  active          boolean default true,
  created_by      bigint not null references profiles(moodle_id),
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);
alter table announcements enable row level security;
create policy "anon_select_announcements" on announcements for select to anon using (true);

-- 4. admin_audit_log: 管理者操作ログ
create table if not exists admin_audit_log (
  id              bigint generated always as identity primary key,
  admin_id        bigint not null references profiles(moodle_id),
  action          text not null,        -- ban_user, unban_user, delete_post, delete_comment, delete_message, resolve_report, create_announcement, etc.
  target_type     text,                 -- user, post, comment, message, report, announcement
  target_id       text,                 -- 対象のID
  detail          jsonb,                -- 追加情報
  created_at      timestamptz default now()
);
create index if not exists idx_audit_log_admin on admin_audit_log(admin_id, created_at desc);
create index if not exists idx_audit_log_action on admin_audit_log(action, created_at desc);
alter table admin_audit_log enable row level security;
-- anon アクセス不可 (service_role のみ)

-- 5. profiles に last_active_at カラム追加 (DAU/WAU/MAU 統計用)
alter table profiles add column if not exists last_active_at timestamptz;
create index if not exists idx_profiles_last_active on profiles(last_active_at desc);

-- 6. site_settings: サイト全体の設定 (利用規約バージョンなど)
create table if not exists site_settings (
  key         text primary key,
  value       jsonb not null default '{}',
  updated_by  bigint references profiles(moodle_id),
  updated_at  timestamptz default now()
);
alter table site_settings enable row level security;
create policy "anon_select_site_settings" on site_settings for select to anon using (true);

-- 7. ng_words: NGワードフィルター
create table if not exists ng_words (
  id              bigint generated always as identity primary key,
  word            text not null,
  match_type      text not null default 'contains',  -- contains, exact, regex
  action          text not null default 'block',      -- block, warn, shadow
  category        text default 'general',             -- general, spam, slur, ad, other
  added_by        bigint references profiles(moodle_id),
  created_at      timestamptz default now()
);
create unique index if not exists idx_ng_words_word on ng_words(lower(word));
alter table ng_words enable row level security;
-- anon アクセス不可 (service_role のみ)
