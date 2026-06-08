-- =============================================================
-- 一時診断RPC: Disk IO 原因追求用（読み取り専用 / service_role 限定）
-- Supabase Dashboard の SQL Editor で「1回だけ」実行する。
-- 調査が終わったら必ず末尾の DROP（_diag-io-rpc-teardown.sql）を実行して削除すること。
--
-- 安全策:
--  - SELECT / WITH で始まる読み取りクエリ以外は実行を拒否（書き込み・DDL不可）
--  - EXECUTE 権限は service_role のみ。anon / authenticated からは剥奪。
--  - SECURITY DEFINER だが search_path を固定し、pg_catalog 統計ビューのみ参照する想定。
-- =============================================================

-- pg_stat_statements は Supabase ではデフォルト有効。念のため。
create extension if not exists pg_stat_statements;

create or replace function public.diag_sql(q text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_catalog, pg_temp
as $$
declare
  result jsonb;
  norm   text := regexp_replace(lower(q), '^\s+', '');  -- 先頭の全空白（改行/タブ含む）を除去
begin
  -- 読み取り専用ガード: SELECT または WITH で始まること
  if norm !~ '^(select|with)\s' then
    raise exception 'diag_sql: only read-only SELECT/WITH queries are allowed';
  end if;
  -- 複文を防ぐ（末尾のセミコロン以外にセミコロンがあれば拒否）
  if position(';' in rtrim(rtrim(norm), ';')) > 0 then
    raise exception 'diag_sql: multiple statements are not allowed';
  end if;

  execute 'select coalesce(jsonb_agg(t), ''[]''::jsonb) from (' || q || ') t' into result;
  return result;
end;
$$;

revoke all on function public.diag_sql(text) from public;
revoke all on function public.diag_sql(text) from anon;
revoke all on function public.diag_sql(text) from authenticated;
grant execute on function public.diag_sql(text) to service_role;

-- 動作確認
select public.diag_sql('select now() as ok');
