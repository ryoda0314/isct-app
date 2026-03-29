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
-- 6. Explicit DENY policies on private tables
--    These tables already have RLS enabled + no anon policies,
--    but adding explicit denies guards against accidental leaks.
-- =============================================================

-- DM
drop policy if exists "deny_all_dm_conversations" on dm_conversations;
create policy "deny_all_dm_conversations" on dm_conversations
  for all to anon, authenticated using (false);

drop policy if exists "deny_all_dm_messages" on dm_messages;
create policy "deny_all_dm_messages" on dm_messages
  for all to anon, authenticated using (false);

-- Notifications
drop policy if exists "deny_all_notifications" on notifications;
create policy "deny_all_notifications" on notifications
  for all to anon, authenticated using (false);

-- Friendships
drop policy if exists "deny_all_friendships" on friendships;
create policy "deny_all_friendships" on friendships
  for all to anon, authenticated using (false);

-- Groups
do $$ begin
  if exists (select 1 from information_schema.tables where table_schema='public' and table_name='groups') then
    execute 'drop policy if exists "deny_all_groups" on groups';
    execute 'create policy "deny_all_groups" on groups for all to anon, authenticated using (false)';
    execute 'drop policy if exists "deny_all_group_members" on group_members';
    execute 'create policy "deny_all_group_members" on group_members for all to anon, authenticated using (false)';
    execute 'drop policy if exists "deny_all_group_messages" on group_messages';
    execute 'create policy "deny_all_group_messages" on group_messages for all to anon, authenticated using (false)';
  end if;
end $$;

-- Bookmarks / Event RSVPs
drop policy if exists "deny_all_bookmarks" on bookmarks;
create policy "deny_all_bookmarks" on bookmarks
  for all to anon, authenticated using (false);

drop policy if exists "deny_all_event_rsvps" on event_rsvps;
create policy "deny_all_event_rsvps" on event_rsvps
  for all to anon, authenticated using (false);

-- Push subscriptions
drop policy if exists "deny_all_push_subscriptions" on push_subscriptions;
create policy "deny_all_push_subscriptions" on push_subscriptions
  for all to anon, authenticated using (false);

-- Admin
drop policy if exists "deny_all_admin_users" on admin_users;
create policy "deny_all_admin_users" on admin_users
  for all to anon, authenticated using (false);

-- Exam schedules
drop policy if exists "deny_all_exam_schedules" on exam_schedules;
create policy "deny_all_exam_schedules" on exam_schedules
  for all to anon, authenticated using (false);

-- Reports (moderation data — service_role only)
drop policy if exists "deny_all_reports" on reports;
create policy "deny_all_reports" on reports
  for all to anon, authenticated using (false);

-- NG words (filter config — service_role only)
drop policy if exists "deny_all_ng_words" on ng_words;
create policy "deny_all_ng_words" on ng_words
  for all to anon, authenticated using (false);

-- Admin audit log (sensitive — service_role only)
drop policy if exists "deny_all_admin_audit_log" on admin_audit_log;
create policy "deny_all_admin_audit_log" on admin_audit_log
  for all to anon, authenticated using (false);

-- User mutes
drop policy if exists "deny_all_user_mutes" on user_mutes;
create policy "deny_all_user_mutes" on user_mutes
  for all to anon, authenticated using (false);

-- User blocks
drop policy if exists "deny_all_user_blocks" on user_blocks;
create policy "deny_all_user_blocks" on user_blocks
  for all to anon, authenticated using (false);

-- =============================================================
-- 7. (H14) NOTE on anon SELECT policies for Realtime tables
--
--    The following tables have `anon SELECT using(true)` policies
--    because the frontend subscribes to Realtime changes via the
--    anon key:
--      - profiles, messages, posts, shared_materials, comments,
--        announcements, site_settings
--
--    RISK: Anyone with the NEXT_PUBLIC_SUPABASE_ANON_KEY can read
--    ALL rows from these tables directly via PostgREST.
--    攻撃例: ブラウザconsoleから直接PostgREST APIを叩ける
--      fetch('https://xxx.supabase.co/rest/v1/profiles?select=*',
--        { headers: { apikey: '<anon_key>' } })
--
--    FUTURE MITIGATION: Migrate Realtime subscriptions to use
--    authenticated sessions (Supabase Auth) instead of anon key,
--    then replace these blanket policies with user-scoped ones.
--
--    IMMEDIATE MITIGATION: Restrict anon SELECT on profiles to
--    only return non-sensitive columns via column-level grants.
-- =============================================================

-- 8. profiles テーブル: anon に公開するカラムを限定
--    Realtime 用に anon SELECT は必要だが、全カラム公開は不要。
--    これにより banned, banned_at, ban_reason, last_active_at, dept,
--    created_at が anon PostgREST クエリから隠される。
revoke select on profiles from anon;
grant select (moodle_id, name, avatar, color, status) on profiles to anon;
