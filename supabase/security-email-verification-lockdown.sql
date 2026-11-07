-- =============================================================
-- email_verification: anon からの読み取りを遮断 (2026-11-07 実測で発覚)
-- Supabase Dashboard の SQL Editor で実行
--
-- 問題:
--   公開 anon キーだけで email_verification の全行・全列が読めた
--   (GET /rest/v1/email_verification?select=* → 200, 24 行)。
--   列: email, login_id, moodle_id, pw_hash(scrypt), code, expires_at, attempts
--   → メールアドレス ↔ 大学ログインID ↔ moodle_id の対応表と、メールログイン用
--     パスワードのハッシュ(オフライン総当たり可能)が外部に出ていた。
--   migration.sql では enable row level security しているが、本番では RLS が
--   無効か、許可ポリシーが足されている状態だったと考えられる。
--   RLS が無効なら anon は INSERT/UPDATE/DELETE もできた可能性があり、その場合は
--   確認中のレコードの pw_hash を差し替えて、本人が確認を終えた瞬間に
--   メールログインのパスワードを攻撃者のものにできる (アカウント乗っ取り)。
--
-- アプリは /api/auth/email/link・verify (service_role) からしか触らないので、
-- anon / authenticated の権限はすべて不要。
-- =============================================================

do $$
declare p record;
begin
  for p in select policyname from pg_policies
           where schemaname = 'public' and tablename = 'email_verification' loop
    execute format('drop policy %I on public.email_verification', p.policyname);
  end loop;
end $$;

alter table public.email_verification enable row level security;
alter table public.email_verification force row level security;
create policy "deny_all_email_verification" on public.email_verification
  for all to anon, authenticated using (false) with check (false);
revoke all on table public.email_verification from anon, authenticated;

-- 期限切れのまま残っている確認レコードを消す (確認成功時と期限切れ検出時にしか
-- 消えないので、途中でやめた人の pw_hash がずっと残っていた)
delete from public.email_verification where expires_at < now();

-- =============================================================
-- 確認: 同じ穴が他のテーブルにないか (結果を見て、anon に見せる意図のない行があれば対応)
--   rls=false のテーブル、または anon/public 向けの許可ポリシーがあるテーブルを列挙する
-- =============================================================
select c.relname as tbl,
       c.relrowsecurity as rls,
       has_table_privilege('anon', c.oid, 'SELECT') as anon_select,
       has_table_privilege('anon', c.oid, 'INSERT') as anon_insert,
       has_table_privilege('anon', c.oid, 'UPDATE') as anon_update,
       has_table_privilege('anon', c.oid, 'DELETE') as anon_delete,
       (select string_agg(p.policyname || ' [' || p.cmd || '] using(' || coalesce(p.qual, '') || ') check(' || coalesce(p.with_check, '') || ')', ' / ')
          from pg_policies p
         where p.schemaname = 'public' and p.tablename = c.relname
           and p.qual is distinct from 'false'
           and (p.roles && array['anon', 'public']::name[])) as permissive_anon_policies
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm')
   and (not c.relrowsecurity
        or exists (select 1 from pg_policies p
                    where p.schemaname = 'public' and p.tablename = c.relname
                      and p.qual is distinct from 'false'
                      and (p.roles && array['anon', 'public']::name[])))
 order by c.relname;
-- 期待される結果 (意図どおりの公開): announcements, site_settings, circles(is_public),
-- gym_announcements, guest_sessions(insert/update), messages/posts/comments/
-- shared_materials/freshman_* (列限定) あたり。それ以外が出たら要確認。

-- 外部からの確認:
--   curl "$SUPABASE_URL/rest/v1/email_verification?select=email&limit=1" -H "apikey: $ANON" -H "Authorization: Bearer $ANON"
--   → 401 permission denied になれば完了
