-- =============================================================
-- RLS有効化マイグレーション
-- Supabase Dashboard の SQL Editor で実行
--
-- 方針:
--   anon role → SELECT のみ（リアルタイム購読用）
--   service_role → RLS バイパス（API ルートは変更不要）
--   INSERT/UPDATE/DELETE は API ルート経由のみ許可
-- =============================================================

-- 1. profiles
alter table profiles enable row level security;
create policy "anon_select_profiles" on profiles
  for select to anon using (true);

-- 2. messages (コースチャット)
alter table messages enable row level security;
create policy "anon_select_messages" on messages
  for select to anon using (true);

-- 3. dm_conversations (DM会話)
alter table dm_conversations enable row level security;
create policy "anon_select_dm_conversations" on dm_conversations
  for select to anon using (true);

-- 4. dm_messages (DMメッセージ)
alter table dm_messages enable row level security;
create policy "anon_select_dm_messages" on dm_messages
  for select to anon using (true);

-- 5. notifications (通知)
alter table notifications enable row level security;
create policy "anon_select_notifications" on notifications
  for select to anon using (true);

-- 6. shared_materials (共有教材)
alter table shared_materials enable row level security;
create policy "anon_select_shared_materials" on shared_materials
  for select to anon using (true);

-- 7. friendships (友達関係)
alter table friendships enable row level security;
create policy "anon_select_friendships" on friendships
  for select to anon using (true);

-- 8. storage: shared-materials バケットを読み取り専用に
-- (既に public=true なので読み取りは可能、書き込みはサーバー経由のみ)
create policy "anon_read_shared_materials_storage" on storage.objects
  for select to anon using (bucket_id = 'shared-materials');