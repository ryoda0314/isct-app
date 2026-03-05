-- =============================================================
-- RLS有効化マイグレーション (v2 - セキュリティ強化版)
-- Supabase Dashboard の SQL Editor で実行
--
-- 方針:
--   anon role → リアルタイム購読に必要な最小限の SELECT のみ
--     - profiles, messages: 公開データとして SELECT 許可
--     - dm_*, notifications, friendships: anon からの直接 SELECT を拒否
--   service_role → RLS バイパス（API ルート経由の全操作）
--   INSERT/UPDATE/DELETE → anon には一切許可しない
--
-- 注意: 既存ポリシーがある場合は先に DROP してから実行
-- =============================================================

-- 既存ポリシーを削除
drop policy if exists "anon_select_profiles" on profiles;
drop policy if exists "anon_select_messages" on messages;
drop policy if exists "anon_select_dm_conversations" on dm_conversations;
drop policy if exists "anon_select_dm_messages" on dm_messages;
drop policy if exists "anon_select_notifications" on notifications;
drop policy if exists "anon_select_shared_materials" on shared_materials;
drop policy if exists "anon_select_friendships" on friendships;
drop policy if exists "anon_read_shared_materials_storage" on storage.objects;

-- 1. profiles (公開データ: リアルタイムでアバター等を取得するため SELECT 許可)
alter table profiles enable row level security;
create policy "anon_select_profiles" on profiles
  for select to anon using (true);

-- 2. messages (コースチャット: リアルタイム購読のため SELECT 許可)
alter table messages enable row level security;
create policy "anon_select_messages" on messages
  for select to anon using (true);

-- 3. dm_conversations (プライベート: anon からの直接アクセス拒否)
alter table dm_conversations enable row level security;
-- anon には SELECT を許可しない (service_role 経由でのみアクセス)

-- 4. dm_messages (プライベート: anon からの直接アクセス拒否)
alter table dm_messages enable row level security;
-- anon には SELECT を許可しない

-- 5. notifications (プライベート: anon からの直接アクセス拒否)
alter table notifications enable row level security;
-- anon には SELECT を許可しない

-- 6. shared_materials (コース教材: リアルタイム購読のため SELECT 許可)
alter table shared_materials enable row level security;
create policy "anon_select_shared_materials" on shared_materials
  for select to anon using (true);

-- 7. friendships (プライベート: anon からの直接アクセス拒否)
alter table friendships enable row level security;
-- anon には SELECT を許可しない

-- 8. groups (プライベート: anon からの直接アクセス拒否)
-- group_members, group_messages も同様
do $$ begin
  if exists (select 1 from information_schema.tables where table_name = 'groups') then
    execute 'alter table groups enable row level security';
  end if;
  if exists (select 1 from information_schema.tables where table_name = 'group_members') then
    execute 'alter table group_members enable row level security';
  end if;
  if exists (select 1 from information_schema.tables where table_name = 'group_messages') then
    execute 'alter table group_messages enable row level security';
  end if;
end $$;

-- 9. storage: shared-materials バケットの読み取りポリシー
create policy "anon_read_shared_materials_storage" on storage.objects
  for select to anon using (bucket_id = 'shared-materials');
