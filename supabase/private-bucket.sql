-- =============================================================
-- M6: shared-materials バケットを非公開に変更
-- Supabase Dashboard の SQL Editor で実行
--
-- API側で signed URL を使用するため、公開URLは不要になる
-- =============================================================

UPDATE storage.buckets SET public = false WHERE id = 'shared-materials';

-- 既存の公開読み取りポリシーを削除
DROP POLICY IF EXISTS "anon_read_shared_materials_storage" ON storage.objects;
