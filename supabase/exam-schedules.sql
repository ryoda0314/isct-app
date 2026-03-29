-- =============================================================
-- Exam Schedules: 期末試験スケジュールデータ
-- Supabase Dashboard の SQL Editor で実行
-- =============================================================

create table if not exists exam_schedules (
  id              bigint generated always as identity primary key,
  code            text not null,            -- 科目コード (ベース: e.g. MEC.C201)
  code_raw        text,                     -- 元の科目コード (e.g. MEC.C201-01)
  name            text not null,            -- 科目名
  date            date not null,            -- 試験日 (e.g. 2026-01-28)
  day             text,                     -- 曜日 (月,火,水,木,金)
  period          text not null,            -- 時限 (e.g. 1-2, 3-4)
  room            text,                     -- 教室 (e.g. W5-106)
  instructor      text,                     -- 担当教員
  year            text not null default '2025', -- 年度
  quarter         text not null default '4Q',   -- クォーター
  created_by      bigint,                   -- 追加した管理者ID
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

-- 同じ科目コード(raw)+日付+時限は重複させない（セクション違いで同code+date+periodが複数存在するため code_raw を使用）
create unique index if not exists idx_exam_coderaw_date_period
  on exam_schedules(code_raw, date, period);

-- 検索用インデックス
create index if not exists idx_exam_date on exam_schedules(date);
create index if not exists idx_exam_year_quarter on exam_schedules(year, quarter);
create index if not exists idx_exam_code on exam_schedules(code);

-- RLS: service_role のみ読み書き可
alter table exam_schedules enable row level security;
