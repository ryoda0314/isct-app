-- =============================================================
-- DM Call Log: 個別DMメッセージに通話履歴メタ列を追加
-- 通話が終わると発信者が1行だけ「通話ログ」メッセージを挿入する（text='' / stamp_id=null）。
-- call_meta 例: {"status":"completed","durationSec":47}
--   status: 'completed'（通話成立・durationSec あり） | 'missed'（不在） | 'declined'（拒否）
-- sender_id は常に発信者。閲覧者が発信者か着信者かで表示を出し分ける（API/クライアント側）。
-- Supabase Dashboard → SQL Editor で1回だけ実行してください。
-- =============================================================

alter table dm_messages add column if not exists call_meta jsonb;

-- 既存の text NOT NULL 制約はそのまま維持。通話ログは text='' で保存される。
