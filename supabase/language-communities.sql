-- =============================================================
-- 語学学習コミュニティ マイグレーション
-- Supabase Dashboard の SQL Editor で実行
--
-- 設計メモ:
--  - コミュニティ本体は静的な言語リスト(campus-sns/languages.js)で表現し、
--    DB には「誰がどの言語に、どのロールで参加しているか」だけを持つ。
--  - タイムライン/チャットは既存の posts / messages テーブル(course_id)を
--    `lang:<code>` というルームキーでそのまま流用する（dept ルームと同方式）。
--    そのため専用の投稿テーブルは不要。
--  - 在籍判定は lib/auth/course-enrollment.js の `lang:` 分岐が
--    この language_members を参照する。読み書きは service_role の
--    API ルート経由なので anon ポリシーは付けない。
-- =============================================================

-- language_members: 語学コミュニティ参加メンバー
create table if not exists language_members (
  id         bigint generated always as identity primary key,
  lang_code  text   not null,                       -- 'en','zh','ko','ja',...
  user_id    bigint not null references profiles(moodle_id),
  role       text   not null default 'learner'
             check (role in ('learner','native')),  -- 学習者 / ネイティブ
  joined_at  timestamptz default now(),
  unique(lang_code, user_id)                         -- 1言語につき1ロール
);
create index if not exists idx_language_members_lang on language_members(lang_code);
create index if not exists idx_language_members_user on language_members(user_id);

alter table language_members enable row level security;
-- anon ポリシーは意図的に付与しない（全アクセスは service_role の API ルート経由）
