-- =============================================================
-- Course Textbooks (Raw): シラバスからスクレイプした教科書/参考書の生データ
-- Supabase Dashboard の SQL Editor で実行
--
-- 設計方針:
--  - シラバスHTMLの <p class="c-p"> の中身を <br/> を改行に変換して
--    そのまま raw_text に保存する（パース失敗による情報損失を避けるため）
--  - ISBN抽出・複数冊への分割・「なし」フィルタは後工程の正規化フェーズで行い、
--    books テーブル（バーコード読取と共用）に展開する想定
-- =============================================================

create table if not exists course_textbooks_raw (
  id              bigint generated always as identity primary key,
  course_code     text not null,            -- 科目コード (e.g. MEC.C201)
  syllabus_year   text not null,            -- 年度 (e.g. 2026)
  faculty         text not null default 'isct',  -- 'isct' | 'med' | 'den'
  kind            text not null,            -- 'textbook' (教科書) | 'reference' (参考書、講義資料等)
  raw_text        text not null,            -- <p class="c-p"> の中身（<br/>は改行に変換）
  source_url      text,                     -- シラバス詳細ページURL
  scraped_at      timestamptz default now()
);

-- 同一(科目, 年度, faculty, kind) はスクレイプ再実行で上書きしたいので
-- raw_text を含めず (course_code, syllabus_year, faculty, kind) で一意化
create unique index if not exists idx_textbooks_raw_unique
  on course_textbooks_raw(course_code, syllabus_year, faculty, kind);

-- 検索用
create index if not exists idx_textbooks_raw_course_year
  on course_textbooks_raw(course_code, syllabus_year);

-- kind 制約
alter table course_textbooks_raw
  drop constraint if exists course_textbooks_raw_kind_check;
alter table course_textbooks_raw
  add constraint course_textbooks_raw_kind_check
  check (kind in ('textbook', 'reference'));

-- faculty 制約
alter table course_textbooks_raw
  drop constraint if exists course_textbooks_raw_faculty_check;
alter table course_textbooks_raw
  add constraint course_textbooks_raw_faculty_check
  check (faculty in ('isct', 'med', 'den'));

-- RLS: service_role のみ読み書き可
alter table course_textbooks_raw enable row level security;
