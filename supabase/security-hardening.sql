-- =============================================================
-- セキュリティ強化マイグレーション
-- Supabase Dashboard の SQL Editor で実行
--
-- 対象:
--   1. admin_users: RLS 有効化（未設定だった）
--   2. push_subscriptions: RLS確認（RLS有効・ポリシーなし = service_role のみ）
--   3. プライベートテーブルの誤った anon SELECT ポリシーを削除
-- =============================================================

-- 1. admin_users — RLS 有効化 (anon からのアクセス���完全に遮断)
alter table admin_users enable row level security;

-- 2. push_subscriptions — RLS有効確認 (ポリシーなし = service_role のみアクセス可能)
-- push-subscriptions.sql で enable 済み。追加ポリシー不要。

-- 3. プラ���ベートデータの anon SELECT ポリシーを削除
--    (migration.sql で誤って作成された可能性があるため、存在する場合のみ削除)
drop policy if exists "anon_select_dm_conversations" on dm_conversations;
drop policy if exists "anon_select_dm_messages" on dm_messages;
drop policy if exists "anon_select_notifications" on notifications;
drop policy if exists "anon_select_friendships" on friendships;
drop policy if exists "anon_select_groups" on groups;
drop policy if exists "anon_select_group_members" on group_members;
drop policy if exists "anon_select_group_messages" on group_messages;
drop policy if exists "anon_select_bookmarks" on bookmarks;
drop policy if exists "anon_select_event_rsvps" on event_rsvps;
