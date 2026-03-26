-- =============================================================
-- Syllabus Courses: シラバス時間割データ
-- Supabase Dashboard の SQL Editor で実行
-- =============================================================

create table if not exists syllabus_courses (
  id              bigint generated always as identity primary key,
  code            text not null,            -- 科目コード (e.g. MEC.C201)
  name            text,                     -- 科目名
  section         text not null default '',  -- セクション (e.g. 14-RW, S16, B)
  dept            text not null,            -- 学科キー (e.g. MEC, CSC)
  year            text not null,            -- 年度 (e.g. 2025, 2026)
  day             text,                     -- 曜日 (月,火,水,木,金)
  per             text,                     -- 時限 (e.g. 木1-4)
  period_start    int,                      -- 開始時限
  period_end      int,                      -- 終了時限
  room            text,                     -- 教室 (e.g. M-B07(H101))
  quarter         text,                     -- クォーター (e.g. 1Q, 1-2Q)
  syllabus_url    text,                     -- シラバスページURL
  school          text,                     -- 学院名 (e.g. 工学院)
  fetched_at      timestamptz default now() -- 取得日時
);

-- 同じ科目コード+年度+URL+セクションは重複させない
create unique index if not exists idx_syllabus_code_year_url_section
  on syllabus_courses(code, year, syllabus_url, section);

-- セクション付き検索用
create index if not exists idx_syllabus_code_year_section
  on syllabus_courses(code, year, section);

-- 検索用インデックス
create index if not exists idx_syllabus_dept_year on syllabus_courses(dept, year);
create index if not exists idx_syllabus_quarter on syllabus_courses(quarter);
create index if not exists idx_syllabus_day on syllabus_courses(day);

-- RLS: service_role のみ読み書き可
alter table syllabus_courses enable row level security;

-- =============================================================
-- 既存テーブルへの追加（既にテーブル作成済みの場合はこちらを実行）
-- =============================================================
-- alter table syllabus_courses add column if not exists section text;
-- create index if not exists idx_syllabus_code_year_section on syllabus_courses(code, year, section);
