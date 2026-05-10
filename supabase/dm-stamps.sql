-- =============================================================
-- DM Stamps: 個別DMメッセージにスタンプID列を追加
-- 既存メッセージは text のみ。スタンプ送信時は stamp_id だけ入る（text は空文字）。
-- Supabase Dashboard → SQL Editor で1回だけ実行してください。
-- =============================================================

alter table dm_messages add column if not exists stamp_id text;

-- 既存の text NOT NULL 制約はそのまま維持。
-- スタンプ単独メッセージは text='' で保存される（API 側で扱う）。
