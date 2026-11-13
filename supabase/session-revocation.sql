-- ログイン任意化（2026-11）: アカウント層の認証 requireSession 用の失効時刻。
--
-- requireSession は Moodle トークンを取らず、署名 Cookie と profiles だけで本人確認する。
-- そのため「資格情報を削除したら他の端末のログインも切れる」を、この列で実現する:
--   Cookie の発行時刻 < sessions_valid_after なら、そのセッションは無効（401 NO_SESSION）。
-- 値を入れるのは /api/auth/credentials の DELETE（資格情報の削除）。通常のログアウトでは入れない（他の端末はログインしたまま）。
--
-- この SQL が未適用の間は、requireSession は従来の requirePortal（Moodle トークンを取る判定）に回るので、
-- 挙動は今と同じ。適用すると、DM・投稿・タスクなどが LMS の不調で止まらなくなる。
--
-- profiles は service role 専用（security-profiles-lockdown.sql）なので、権限の変更は不要。

alter table public.profiles
  add column if not exists sessions_valid_after timestamptz;
