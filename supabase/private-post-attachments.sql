-- =============================================================
-- post-attachments バケットを非公開に変更 (2026-04-12 ペネトレ対応)
-- Supabase Dashboard の SQL Editor で実行
--
-- 問題:
--   post-attachments バケットが public=true のため、
--   ストレージパスを知っていれば signed URL なしで直接アクセス可能。
--   API側で createSignedUrl に変更済みだが、バケット自体が
--   公開のままでは signed URL の意味がない。
--
-- 対策:
--   バケットを非公開にし、signed URL 経由でのみアクセス可能にする。
-- =============================================================

UPDATE storage.buckets SET public = false WHERE id = 'post-attachments';

-- 公開読み取りポリシーがあれば削除
DROP POLICY IF EXISTS "anon_read_post_attachments" ON storage.objects;

-- service_role はバケット操作に制限なし（APIルート経由のアップロード/署名URL生成は引き続き動作）
