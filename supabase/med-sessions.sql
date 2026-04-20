-- 医歯学系セッションデータ (LctSchedule.aspxから取得した各回のデータをそのまま保存)
-- 管理者が事前にスクレイプし、時間割表示はここから読む

create table if not exists med_sessions (
  id              bigint generated always as identity primary key,
  lct_cd          text not null,          -- 時間割番号 (e.g. "021177")
  code            text,                   -- Moodleコード (e.g. "DEN.A305")
  name            text not null,          -- 科目名
  faculty         text not null,          -- 学部キー (MED, DEN, LIB)
  year            text not null,          -- 年度 (e.g. "2026")
  semester        text,                   -- 学期 (前期, 後期, 通年)
  credits         real,                   -- 単位数
  instructor      text,                   -- 責任教員
  seq_no          text,                   -- 回番号 (e.g. "1", "6-8")
  date            text,                   -- 日付 (e.g. "2026/04/03")
  day             text,                   -- 曜日 (月,火,水,木,金)
  time_start      text,                   -- 開始時刻 (e.g. "09:00")
  time_end        text,                   -- 終了時刻 (e.g. "11:50")
  period_str      text,                   -- 開始時限コード (e.g. "11", "g3")
  period_end      text,                   -- 終了時限コード
  room            text,                   -- 教室
  session_instructor text,                -- その回の担当教員
  fetched_at      timestamptz default now()
);

-- よく使うクエリ用インデックス
create index if not exists idx_med_sessions_lct on med_sessions(lct_cd, year);
create index if not exists idx_med_sessions_faculty on med_sessions(faculty, year);
create index if not exists idx_med_sessions_date on med_sessions(date);
-- NULLを含むカラムではunique制約が効かないため、COALESCE でデフォルト値を設定
create unique index if not exists idx_med_sessions_unique on med_sessions(lct_cd, year, coalesce(seq_no, ''), coalesce(date, ''), coalesce(time_start, ''));

alter table med_sessions enable row level security;

-- 授業題目・授業内容・到達目標列の追加（既存テーブルへの追加用）
-- alter table med_sessions add column if not exists session_title   text;
-- alter table med_sessions add column if not exists session_content text;
-- alter table med_sessions add column if not exists session_goal    text;
