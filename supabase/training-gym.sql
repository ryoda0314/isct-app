-- =============================================================
-- トレセン（トレーニングルーム）機能
--   入退館ログ / 現在人数 / スタッフお知らせ / 筋トレ記録
-- Supabase Dashboard の SQL Editor で実行（冪等：再実行可）
--
-- 注意: このアプリは実際の入退館ゲート（カードリーダー等）とは連携しない。
--       gym_checkins / gym_occupancy は「アプリで操作したユーザーのみ」のデータで、
--       現在人数・混雑度は参考値（実際の人数とは異なる）。UI 側で必ず明記する。
--
-- ユーザーキーは既存慣習どおり moodle_user_id bigint references profiles(moodle_id)。
-- 書き込みは全て service_role（/api/gym/* 経由）。anon の直アクセスはさせない。
-- =============================================================

-- 1. gym_checkins: 入退館の生ログ（利用履歴・将来の混雑統計の元データ）
create table if not exists gym_checkins (
  id              bigint generated always as identity primary key,
  moodle_user_id  bigint not null references profiles(moodle_id) on delete cascade,
  action          text not null,           -- 'check_in' | 'check_out'
  at              timestamptz not null default now()
);
create index if not exists idx_gym_checkins_user on gym_checkins(moodle_user_id, at desc);
alter table gym_checkins enable row level security;
-- anon ポリシーなし（service_role のみ）

-- 2. gym_occupancy: 現在館内にいるユーザー（現在人数 = 行数）
create table if not exists gym_occupancy (
  moodle_user_id  bigint primary key references profiles(moodle_id) on delete cascade,
  checked_in_at   timestamptz not null default now()
);
alter table gym_occupancy enable row level security;
-- anon ポリシーなし（人数は /api/gym/state が service_role で集計して返す）

-- 3. gym_announcements: スタッフからのお知らせ
--    type は AnnouncementBanner.jsx の TYPE_STYLES と揃える（info/maintenance/update/urgent）
create table if not exists gym_announcements (
  id          bigint generated always as identity primary key,
  title       text not null,
  body        text not null,
  type        text not null default 'info',   -- info, maintenance, update, urgent
  pinned      boolean not null default false,
  active      boolean not null default true,
  created_by  bigint references profiles(moodle_id),
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);
create index if not exists idx_gym_announcements_active on gym_announcements(active, pinned desc, created_at desc);
alter table gym_announcements enable row level security;
-- 読み取りは公開（アプリ全体共通のお知らせ扱い）。書き込みは admin のみ＝service_role 経由。
drop policy if exists "anon_select_gym_announcements" on gym_announcements;
create policy "anon_select_gym_announcements" on gym_announcements for select to anon using (true);

-- 4. workout_logs: 個人の筋トレ記録（本人のみ・service_role 経由）
create table if not exists workout_logs (
  id              bigint generated always as identity primary key,
  moodle_user_id  bigint not null references profiles(moodle_id) on delete cascade,
  exercise_name   text not null,
  weight_kg       real,
  reps            integer,
  sets            integer,
  notes           text,
  logged_at       timestamptz not null default now(),
  created_at      timestamptz default now()
);
create index if not exists idx_workout_logs_user on workout_logs(moodle_user_id, logged_at desc);
alter table workout_logs enable row level security;
-- anon ポリシーなし（個人データ。pocket / user_tasks と同方針）

-- ── 動作確認用シード（任意）─────────────────────────────────
-- お知らせを1件投入して表示確認する場合は、<MOODLE_ID> を自分の moodle_id に置換して実行:
-- insert into gym_announcements (title, body, type, created_by)
-- values ('トレセン機能を公開しました', '開館状況・QR入退場・筋トレ記録が使えます。', 'update', <MOODLE_ID>);
