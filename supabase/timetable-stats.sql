-- =============================================================
-- Timetable Stats: 履修状況の匿名統計
-- Supabase Dashboard の SQL Editor で実行
-- =============================================================
--
-- 1行 = 1人 × 年度 × Q の時間割。/api/data/all-meta（と /api/data/all）が
-- ログインのたびに書く（中身が変わったときだけ）。書き手は lib/timetable-stats.js。
--
--   anon_id … moodle_id をサーバーの秘密鍵で HMAC した番号。同じ人は同じ番号になる。
--             氏名・学籍番号・moodle_id は保存しないので、このテーブルだけでは本人をたどれない。
--             ただしサーバー（鍵）は moodle_id から番号を計算できる（オフにしたときの削除に使う）。
--   grade   … 年度 − 入学年度 + 1（学籍番号から。B2 なら degree='B', grade=2）
--   courses … [{ code, section, name, slots:["月1-2","水3-4"], credits }]
--
-- 本人が設定でオフにすると profiles.timetable_stats_opt_out = true になり、行は削除される。
-- profiles.timetable_stats_sig = 最後に記録した内容の要約。データ読み込み時に読む profiles 行と
-- 比べるだけで「変わっていない」と分かるので、変わらない限りこのテーブルには触らない。

create table if not exists timetable_stats (
  anon_id     text     not null,
  year        int      not null,          -- 年度（4月始まり）
  quarter     smallint not null,          -- 1..4
  entry_year  int,                        -- 入学年度 (e.g. 2025)
  degree      text,                       -- B / M / D / R
  grade       smallint,                   -- 年度 − 入学年度 + 1
  school      text,                       -- 学院キー (engineering, computing, ...)
  dept        text,                       -- 学系キー (MEC, CSC, ...)。1年生は null
  courses     jsonb    not null default '[]'::jsonb,
  hash        text     not null,          -- 変更検出用（同じなら書かない）
  updated_at  timestamptz not null default now(),
  primary key (anon_id, year, quarter)
);

create index if not exists idx_timetable_stats_year_q on timetable_stats(year, quarter);

-- RLS: service_role のみ読み書き可（ポリシーを作らない）
alter table timetable_stats enable row level security;

-- オフにした人 / 最後に記録した内容の要約
alter table profiles add column if not exists timetable_stats_opt_out boolean not null default false;
alter table profiles add column if not exists timetable_stats_sig text;
