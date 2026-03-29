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

-- =============================================================
-- 4. (H14) FORCE ROW LEVEL SECURITY on credential tables
--    Even service_role is subject to RLS when FORCE is enabled.
--    Since we only access these via getSupabaseAdmin() this is
--    a defense-in-depth measure — if an RLS bypass were found,
--    these tables would still be protected.
-- =============================================================
alter table user_tokens force row level security;
alter table user_credentials force row level security;
alter table email_auth force row level security;

-- =============================================================
-- 5. (H14) Explicit DENY policies on credential tables
--    RLS enabled + no policies = deny all (for non-service-role).
--    These explicit denies make the intent clear and guard
--    against accidentally-added permissive policies.
-- =============================================================
drop policy if exists "deny_all_user_tokens" on user_tokens;
create policy "deny_all_user_tokens" on user_tokens
  for all to anon, authenticated using (false);

drop policy if exists "deny_all_user_credentials" on user_credentials;
create policy "deny_all_user_credentials" on user_credentials
  for all to anon, authenticated using (false);

drop policy if exists "deny_all_email_auth" on email_auth;
create policy "deny_all_email_auth" on email_auth
  for all to anon, authenticated using (false);

-- =============================================================
-- 6. (H14) NOTE on anon SELECT policies for Realtime tables
--
--    The following tables have `anon SELECT using(true)` policies
--    because the frontend subscribes to Realtime changes via the
--    anon key:
--      - profiles, messages, posts, shared_materials
--
--    RISK: Anyone with the NEXT_PUBLIC_SUPABASE_ANON_KEY can read
--    ALL rows from these tables directly via PostgREST.
--
--    FUTURE MITIGATION: Migrate Realtime subscriptions to use
--    authenticated sessions (Supabase Auth) instead of anon key,
--    then replace these blanket policies with user-scoped ones.
-- =============================================================
