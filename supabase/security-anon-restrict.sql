-- =============================================================
-- anon SELECT カラム制限マイグレーション (2026-04-12 ペネトレ対応)
-- Supabase Dashboard の SQL Editor で実行
--
-- 問題:
--   anon key (NEXT_PUBLIC_SUPABASE_ANON_KEY) を知っている攻撃者が
--   PostgREST API を直接叩き、全メッセージ・投稿・コメントを
--   enrollment check なしで読み取れる。
--
-- 方針:
--   1. course_enrollments: anon SELECT を完全に削除 (Realtime不要)
--   2. messages: Realtime 用に最小限のカラムのみ公開
--   3. posts: Realtime 用に最小限のカラムのみ公開
--   4. comments: Realtime 用に最小限のカラムのみ公開
--   5. shared_materials: Realtime 用に最小限のカラムのみ公開
--   6. freshman_posts/comments: 同上
--
-- 注意:
--   Realtime 購読は anon SELECT を必要とするため完全に閉じられない。
--   カラム制限により、text 等の機密データは PostgREST 直撃から保護。
--   長期的には Supabase Auth + RLS user-scoped ポリシーへの移行を推奨。
-- =============================================================

-- 1. course_enrollments: anon SELECT を完全に削除
--    Realtime 購読不要。API ルート (service_role) 経由でのみアクセス。
drop policy if exists "anon_select_course_enrollments" on course_enrollments;
create policy "deny_all_course_enrollments" on course_enrollments
  for all to anon, authenticated using (false);

-- 2. messages: カラム制限
--    Realtime 用に id, course_id, created_at のみ公開。
--    text, moodle_user_id は API ルート経由 (service_role) でのみ取得。
revoke select on messages from anon;
grant select (id, course_id, created_at) on messages to anon;

-- 3. posts: カラム制限
--    Realtime 用に id, course_id, type, created_at のみ公開。
--    text, moodle_user_id, likes, poll_votes, reactions, attachments は非公開。
revoke select on posts from anon;
grant select (id, course_id, type, created_at) on posts to anon;

-- 4. comments: カラム制限
--    Realtime 用に id, post_id, created_at のみ公開。
revoke select on comments from anon;
grant select (id, post_id, created_at) on comments to anon;

-- 5. shared_materials: カラム制限
--    Realtime 用に id, course_id, created_at のみ公開。
--    filename, storage_path, moodle_user_id は非公開。
revoke select on shared_materials from anon;
grant select (id, course_id, created_at) on shared_materials to anon;

-- 6. freshman_posts: カラム制限
revoke select on freshman_posts from anon;
grant select (id, category, created_at) on freshman_posts to anon;

-- 7. freshman_comments: カラム制限
revoke select on freshman_comments from anon;
grant select (id, post_id, created_at) on freshman_comments to anon;

-- =============================================================
-- FUTURE TODO: Supabase Auth 移行
--
-- 現在の構成では Realtime 購読に anon key を使用しているため、
-- カラム制限でしか防御できない。完全な解決には:
--   1. Supabase Auth でユーザーセッションを管理
--   2. RLS ポリシーを auth.uid() ベースに書き換え
--   3. Realtime 購読を authenticated ロールで実行
--   4. anon SELECT ポリシーを全テーブルから削除
-- =============================================================
