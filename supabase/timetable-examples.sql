-- =============================================================
-- Timetable Examples: 時間割例（学年・Q・学院・学系つき）
-- Supabase Dashboard の SQL Editor で実行
-- =============================================================
--
-- 1行 = 1人 × 年度 × Q の時間割例。/api/data/all-meta（と /api/data/all）がデータ読み込みのたびに
-- 呼ぶが、書くのは中身が変わったときだけ。書き手・読み手は lib/timetable-examples.js。
--
--   anon_id … moodle_id をサーバーの秘密鍵で HMAC した番号（固有番号）。同じ人は同じ番号になる。
--             氏名・学籍番号・moodle_id は保存しないので、このテーブルだけでは本人をたどれない。
--             ただしサーバー（鍵）は moodle_id から番号を計算できる（オフ・削除・公開切り替えに使う）。
--   grade   … 年度 − 入学年度 + 1（学籍番号から。B2 なら degree='B', grade=2）
--   courses … [{ code, section, name, slots:["月1-2","水3-4"], credits, requirement:"必修"|"選択必修"|"選択"|null }]
--   shared  … 本人が「他の学生に公開」をオンにしている。学生向け（履修登録補助）に出すのはこの行だけ。
--
-- profiles 側:
--   timetable_examples_opt_out … 収集をオフにした（行は削除される）
--   timetable_examples_share   … 他の学生への公開をオンにした（既定はオフ＝同意した人だけ公開）
--   timetable_examples_sig     … 最後に記録した内容の要約。データ読み込み時に読む profiles 行と比べるだけで
--                                「変わっていない」と分かるので、変わらない限りこのテーブルには触らない。

create table if not exists timetable_examples (
  anon_id     text     not null,
  year        int      not null,          -- 年度（4月始まり）
  quarter     smallint not null,          -- 1..4
  entry_year  int,                        -- 入学年度 (e.g. 2025)
  degree      text,                       -- B / M / D / R
  grade       smallint,                   -- 年度 − 入学年度 + 1
  school      text,                       -- 学院キー (engineering, computing, ...)
  dept        text,                       -- 学系キー (MEC, CSC, ...)。1年生は null
  courses     jsonb    not null default '[]'::jsonb,
  shared      boolean  not null default false,
  hash        text     not null,          -- 変更検出用（同じなら書かない）
  updated_at  timestamptz not null default now(),
  primary key (anon_id, year, quarter)
);

create index if not exists idx_timetable_examples_year_q on timetable_examples(year, quarter);
-- 学生向けの一覧（公開中だけ、学年×Q で引く）
create index if not exists idx_timetable_examples_shared on timetable_examples(degree, grade, quarter) where shared;

-- RLS: service_role のみ読み書き可（ポリシーを作らない）
alter table timetable_examples enable row level security;

alter table profiles add column if not exists timetable_examples_opt_out boolean not null default false;
alter table profiles add column if not exists timetable_examples_share   boolean not null default false;
alter table profiles add column if not exists timetable_examples_sig     text;

-- 以前の版（supabase/timetable-stats.sql）を実行していた場合だけ、後片付けとして実行:
-- drop table if exists timetable_stats;
-- alter table profiles drop column if exists timetable_stats_opt_out;
-- alter table profiles drop column if exists timetable_stats_sig;
