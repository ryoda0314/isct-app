-- =============================================================
-- Course Grading: シラバスからスクレイプした成績評価の方法・割合データ
-- Supabase Dashboard の SQL Editor で実行
--
-- 設計方針:
--   - シラバスHTMLの「成績評価の方法及び基準」セクションの
--     <p class="c-p"> の中身を <br/> を改行に変換して raw_text に保存
--   - breakdown は jsonb で [{label, percent, category}, ...]
--     パースが成功し合計が概ね100%の場合のみ has_breakdown=true
--   - category は 'exam' | 'quiz' | 'report' | 'exercise' | 'practice'
--     | 'presentation' | 'attendance' | 'participation'
--     | 'project' | 'discussion' | 'other'
-- =============================================================

create table if not exists course_grading (
  id              bigint generated always as identity primary key,
  course_code     text not null,            -- 科目コード (e.g. MEC.C201 または MEC.C201:14-RW)
  syllabus_year   text not null,            -- 年度 (e.g. 2026)
  faculty         text not null default 'isct',  -- 'isct' | 'med' | 'den'
  raw_text        text not null,            -- 評価方法の生テキスト
  breakdown       jsonb,                    -- [{label, percent, category}]
  total_percent   int,                      -- breakdown 合計 (検証用)
  has_breakdown   boolean not null default false, -- パース成功フラグ
  is_pass_fail    boolean not null default false, -- 合否科目 (Pass/Fail) フラグ
  source_url      text,                     -- シラバス詳細ページURL
  scraped_at      timestamptz default now()
);

-- 既存テーブルへの追加 (再実行安全)
alter table course_grading add column if not exists is_pass_fail boolean not null default false;

-- 同一(科目, 年度, faculty) はスクレイプ再実行で上書き
create unique index if not exists idx_grading_unique
  on course_grading(course_code, syllabus_year, faculty);

-- 検索用
create index if not exists idx_grading_year
  on course_grading(syllabus_year);
create index if not exists idx_grading_course
  on course_grading(course_code);
create index if not exists idx_grading_has_breakdown
  on course_grading(has_breakdown) where has_breakdown = true;

-- faculty 制約
alter table course_grading
  drop constraint if exists course_grading_faculty_check;
alter table course_grading
  add constraint course_grading_faculty_check
  check (faculty in ('isct', 'med', 'den'));

-- RLS: service_role のみ読み書き可
alter table course_grading enable row level security;
