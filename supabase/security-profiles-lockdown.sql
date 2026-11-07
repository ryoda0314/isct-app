-- =============================================================
-- profiles: anon / authenticated からの直接アクセスを全面遮断
-- (2026-11-07 セキュリティ評価報告書 F-1 対応)
-- Supabase Dashboard の SQL Editor で実行
--
-- 問題:
--   migration.sql の "anon_select_profiles" (using true) と table-level
--   SELECT 権限が残っており、公開 anon キーだけで profiles の全行・全列
--   (氏名・学籍番号・組・last_active_at・ban_reason 等) を取得できた。
--   security-hardening.sql §8 の列制限は本番に適用されていなかった
--   (適用すると useDeptMembers の dept/unit 絞り込みが壊れるため)。
--
-- 方針:
--   ブラウザから profiles を直接読む箇所は useDeptMembers だけだったので、
--   /api/data/dept-members (service_role) 経由に置き換えた上で、
--   anon / authenticated の権限をすべて剥奪する。
--   profiles の Realtime 購読はないので、列を残す必要もない。
--
-- 追加で見つかった抜け道 (報告書には未記載, 2026-11-07 実測):
--   SECURITY DEFINER の管理用 RPC (admin_users_by_opens 等) が anon から
--   POST /rest/v1/rpc/... で実行できた。analytics.sql / usage-analytics.sql は
--   "from anon, authenticated" を revoke しているが、Postgres は関数作成時に
--   PUBLIC へ EXECUTE を付けるので、anon は PUBLIC 経由で実行できてしまう。
--   admin_users_by_opens は全員の氏名・学籍番号・学系を返すため、テーブルを
--   閉じてもここから同じ情報が漏れる。circles.sql の SECURITY DEFINER 関数
--   (transfer_circle_ownership 等) は revoke 自体がなかった。
--   アプリの .rpc() 呼び出しはすべて API ルート (service_role) なので、
--   public スキーマの関数は anon / authenticated / PUBLIC から一括で外す。
--
-- 順序:
--   useDeptMembers の変更より先に実行してもよい。デプロイまでの間、
--   学系/学院/ユニット部屋のメンバー一覧が空になるだけ (旧コードはエラー時に
--   空配列のまま)。漏洩を止めるほうを優先して先に実行する想定。
-- =============================================================

-- 1. 既存ポリシーを全削除 (ダッシュボードで足されたものも含めて)
do $$
declare p record;
begin
  for p in select policyname from pg_policies
           where schemaname = 'public' and tablename = 'profiles' loop
    execute format('drop policy %I on public.profiles', p.policyname);
  end loop;
end $$;

-- 2. RLS を確実に有効化し、明示的な deny ポリシーを置く
alter table public.profiles enable row level security;
create policy "deny_all_profiles" on public.profiles
  for all to anon, authenticated using (false) with check (false);

-- 3. テーブル権限・列権限を剥奪 (table-level REVOKE は列権限も消す)
revoke all on table public.profiles from anon, authenticated;

-- 4. Realtime publication から外す (購読者がいないので WAL デコードの無駄)
do $$
begin
  if exists (select 1 from pg_publication_tables
             where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'profiles') then
    execute 'alter publication supabase_realtime drop table public.profiles';
  end if;
end $$;

-- 5. public スキーマの関数 (拡張機能のものを除く) を anon / authenticated /
--    PUBLIC から実行不可にし、service_role だけに残す
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prokind in ('f', 'p')
      and not exists (select 1 from pg_depend d
                      where d.classid = 'pg_proc'::regclass and d.objid = p.oid and d.deptype = 'e')
  loop
    execute format('revoke execute on routine %s from public, anon, authenticated', f.sig);
    execute format('grant execute on routine %s to service_role', f.sig);
  end loop;
end $$;

-- 今後 SQL Editor (postgres ロール) で作る関数も既定で anon から呼べないようにする。
-- anon に公開したい関数を作るときは個別に grant execute すること。
alter default privileges in schema public revoke execute on routines from public, anon, authenticated;

-- =============================================================
-- 確認 (3つとも 0 行なら OK)
-- =============================================================
select grantee, privilege_type from information_schema.role_table_grants
  where table_schema = 'public' and table_name = 'profiles' and grantee in ('anon', 'authenticated');
select grantee, column_name, privilege_type from information_schema.column_privileges
  where table_schema = 'public' and table_name = 'profiles' and grantee in ('anon', 'authenticated');
select p.oid::regprocedure as anon_callable
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.prokind in ('f', 'p')
    and has_function_privilege('anon', p.oid, 'execute')
    and not exists (select 1 from pg_depend d
                    where d.classid = 'pg_proc'::regclass and d.objid = p.oid and d.deptype = 'e');
-- 外部からの確認:
--   curl -I "$SUPABASE_URL/rest/v1/profiles?select=moodle_id" -H "apikey: $ANON" -H "Authorization: Bearer $ANON"
--     → 401/403 (permission denied for table profiles) になれば完了
--   curl -X POST "$SUPABASE_URL/rest/v1/rpc/admin_growth_daily" -H "apikey: $ANON" -H "Authorization: Bearer $ANON" \
--        -H "Content-Type: application/json" -d '{"p_days":1}'
--     → permission denied for function になれば完了
