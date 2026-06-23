-- 電車（発車時刻）機能: ユーザー登録ルート（出発駅→目的地）
-- 「行きたい駅」を登録し、そこに停車する直近の電車を表示する。
-- RLS方針は出欠/DM等と同じ: anon アクセス不可、service_role 経由のみ。
-- Supabase SQL Editor で一度実行すること。

create table if not exists user_train_routes (
  id             uuid primary key default gen_random_uuid(),
  moodle_user_id bigint not null references profiles(moodle_id) on delete cascade,
  origin_station text not null,   -- 例: static.Station:ek1689 (大岡山)
  dest_station   text not null,   -- 例: static.Station:ek3170 (目黒)
  label          text,            -- 表示用キャッシュ名（出発→目的地）
  sort_order     int not null default 0,
  on_home        boolean not null default false,  -- ホーム画面に表示するか
  created_at     timestamptz not null default now(),
  unique (moodle_user_id, origin_station, dest_station)
);

-- 既存テーブルへの後付け（再実行安全）
alter table user_train_routes add column if not exists on_home boolean not null default false;

create index if not exists idx_user_train_routes_user on user_train_routes(moodle_user_id);

alter table user_train_routes enable row level security;
-- ポリシー無し = anon 不可（service_role のみ）。
