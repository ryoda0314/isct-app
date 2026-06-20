-- 電車（発車時刻）機能: ユーザー登録ルート
-- RLS方針は出欠/DM等と同じ: anon アクセス不可、書き込み/読み取りとも service_role 経由のみ。
-- Supabase SQL Editor で一度実行すること。

create table if not exists user_train_routes (
  id             uuid primary key default gen_random_uuid(),
  moodle_user_id bigint not null references profiles(moodle_id) on delete cascade,
  railway        text not null,   -- 例: odpt.Railway:Tokyu.Meguro
  station        text not null,   -- 例: odpt.Station:Tokyu.Meguro.Ookayama
  direction      text not null,   -- 例: odpt.RailDirection:Tokyu.Meguro
  train_type     text,            -- 登録種別 例: odpt.TrainType:Tokyu.Express（任意）
  label          text,            -- 表示用キャッシュ名（駅名/方面/種別）
  sort_order     int not null default 0,
  created_at     timestamptz not null default now(),
  unique (moodle_user_id, railway, station, direction)
);

create index if not exists idx_user_train_routes_user on user_train_routes(moodle_user_id);

alter table user_train_routes enable row level security;
-- ポリシー無し = anon 不可（service_role のみ）。
