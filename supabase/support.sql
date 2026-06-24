-- =============================================================
-- Support Chat Migration: 運営とのお問い合わせチャット
-- Supabase Dashboard の SQL Editor で実行
--
-- モデル: ユーザーは案件ごとに複数の「チケット」を持ち、各チケットが
-- 運営との会話スレッド（support_messages）になる。
-- reports（コンテンツ通報）とは別系統。送信・閲覧は全てサーバー API 経由。
-- =============================================================

create table if not exists support_tickets (
  id                bigint generated always as identity primary key,
  user_id           bigint not null references profiles(moodle_id) on delete cascade,
  subject           text not null,
  category          text not null default 'bug',   -- bug, feature, question, account, other
  status            text not null default 'open',  -- open, in_progress, resolved, closed
  diagnostics       jsonb,                          -- 端末情報（作成時に収集）
  last_message_at   timestamptz default now(),
  last_sender_role  text default 'user',            -- 直近メッセージの送信者 (user/admin)
  user_last_read_at timestamptz default now(),
  admin_last_read_at timestamptz,
  resolved_by       bigint references profiles(moodle_id),
  resolved_at       timestamptz,
  created_at        timestamptz default now()
);
create index if not exists idx_support_tickets_user on support_tickets(user_id, last_message_at desc);
create index if not exists idx_support_tickets_status on support_tickets(status, last_message_at desc);
alter table support_tickets enable row level security;
-- anon アクセス不可 (service_role のみ)

create table if not exists support_messages (
  id            bigint generated always as identity primary key,
  ticket_id     bigint not null references support_tickets(id) on delete cascade,
  sender_role   text not null,        -- user, admin
  sender_id     bigint references profiles(moodle_id),
  body          text not null,
  created_at    timestamptz default now()
);
create index if not exists idx_support_messages_ticket on support_messages(ticket_id, created_at);
alter table support_messages enable row level security;
-- anon アクセス不可 (service_role のみ)
