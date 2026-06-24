-- =============================================================
-- Feedback / お問い合わせ Migration: 不具合報告・機能要望・質問
-- Supabase Dashboard の SQL Editor で実行
--
-- reports テーブルは「他ユーザーのコンテンツ通報（モデレーション）」専用。
-- こちらは「アプリ自体への不具合報告・お問い合わせ」を扱う別系統。
-- =============================================================

create table if not exists feedback (
  id            bigint generated always as identity primary key,
  user_id       bigint not null references profiles(moodle_id),
  category      text not null default 'bug',   -- bug, feature, question, account, other
  subject       text,                          -- 件名（任意）
  body          text not null,                 -- 本文
  contact       text,                          -- 返信用連絡先（任意）
  diagnostics   jsonb,                          -- 端末情報（バージョン/OS/UA/画面/言語など）
  status        text not null default 'open',  -- open, in_progress, resolved, closed
  admin_note    text,                          -- 管理者メモ
  resolved_by   bigint references profiles(moodle_id),
  resolved_at   timestamptz,
  created_at    timestamptz default now()
);
create index if not exists idx_feedback_status on feedback(status, created_at desc);
create index if not exists idx_feedback_user on feedback(user_id, created_at desc);
alter table feedback enable row level security;
-- anon アクセス不可 (service_role のみ)。送信・閲覧はすべてサーバー API 経由。
