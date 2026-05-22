-- =============================================================
-- Books (canonical) + Course Books (link)
-- Supabase Dashboard の SQL Editor で実行
--
-- 設計方針:
--  - books        : 書籍正本テーブル。ISBN13 がプライマリキー的役割。
--                   シラバススクレイプ／バーコード読取／手動入力のすべてが
--                   このテーブルに集約される。
--  - course_books : 講義 ↔ 書籍 のリンクテーブル。1行=1冊。
--                   raw_line に分割後の元テキスト、confidence/status で
--                   レビュー状態を管理。Stage B でこのテーブルに書き込み、
--                   Stage D（管理者レビュー）で confirmed/rejected を更新。
-- =============================================================

-- ── books: 書誌正本 ─────────────────────────────────────────
create table if not exists books (
  id              bigint generated always as identity primary key,
  isbn13          text unique,                -- 13桁ハイフン無し（メイン識別子）
  isbn10          text,                       -- 任意
  title           text not null,
  author          text,
  publisher       text,
  published_year  text,
  cover_url       text,
  source          text not null,              -- 'openbd' | 'google_books' | 'ndl' | 'barcode' | 'manual'
  source_data     jsonb,                      -- 元APIレスポンス（デバッグ・再正規化用）
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

create index if not exists idx_books_isbn13 on books(isbn13);
create index if not exists idx_books_title on books(title);

-- source 制約
alter table books
  drop constraint if exists books_source_check;
alter table books
  add constraint books_source_check
  check (source in ('openbd', 'google_books', 'ndl', 'barcode', 'manual'));

alter table books enable row level security;

-- ── course_books: 講義 ↔ 書籍 リンク ──────────────────────
create table if not exists course_books (
  id             bigint generated always as identity primary key,
  course_code    text not null,
  syllabus_year  text not null,
  faculty        text not null default 'isct',
  kind           text not null,               -- 'textbook' | 'reference'
  book_id        bigint references books(id) on delete set null,
  raw_id         bigint references course_textbooks_raw(id) on delete cascade,
  raw_line       text not null,               -- 分割後の元テキスト1冊分
  confidence     text not null,               -- 'high' | 'medium' | 'low' | 'none'
  status         text not null default 'pending',  -- 'pending' | 'confirmed' | 'rejected' | 'not_a_book'
  note           text,
  created_at     timestamptz default now(),
  updated_at     timestamptz default now()
);

-- 同一(raw_id, raw_line) は再正規化で上書き
create unique index if not exists idx_course_books_raw_line
  on course_books(raw_id, raw_line);

create index if not exists idx_course_books_course_year
  on course_books(course_code, syllabus_year);

create index if not exists idx_course_books_book_id
  on course_books(book_id) where book_id is not null;

create index if not exists idx_course_books_status
  on course_books(status);

-- kind 制約
alter table course_books
  drop constraint if exists course_books_kind_check;
alter table course_books
  add constraint course_books_kind_check
  check (kind in ('textbook', 'reference'));

-- faculty 制約
alter table course_books
  drop constraint if exists course_books_faculty_check;
alter table course_books
  add constraint course_books_faculty_check
  check (faculty in ('isct', 'med', 'den'));

-- confidence 制約
alter table course_books
  drop constraint if exists course_books_confidence_check;
alter table course_books
  add constraint course_books_confidence_check
  check (confidence in ('high', 'medium', 'low', 'none'));

-- status 制約
alter table course_books
  drop constraint if exists course_books_status_check;
alter table course_books
  add constraint course_books_status_check
  check (status in ('pending', 'confirmed', 'rejected', 'not_a_book'));

alter table course_books enable row level security;
