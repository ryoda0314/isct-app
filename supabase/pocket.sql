-- =============================================================
-- pocket_items: 自分専用クリップボード（端末間同期）
-- スマホ⇔PC でテキスト・URL・画像・ファイルを即同期する個人ストレージ。
-- LINEの「Keepメモ／自分宛トーク」置き換え。
--
-- Supabase Dashboard の SQL Editor で実行してください。
--
-- プライバシーモデルは dm_messages を踏襲:
--   - RLS 有効・anon ポリシー無し → 直接アクセスは全て拒否
--   - 読み書きは API ルート (service_role) 経由のみ。owner_id = 認証ユーザー で制限
--   - 添付の実体は既存の非公開バケット post-attachments に pocket/<owner_id>/ で保存し、
--     署名URL経由でのみ取得（投稿添付と同じ仕組み）
-- =============================================================

create table if not exists pocket_items (
  id         uuid primary key default gen_random_uuid(),
  owner_id   bigint not null,                 -- moodle user id（投稿/DMと同じ）
  kind       text not null check (kind in ('text', 'image', 'file')),
  text       text,                            -- text/url の本文、または添付のキャプション
  attachment jsonb,                           -- {name, path, size, type} ※urlは取得時に署名して付与
  pinned     boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists pocket_items_owner_created_idx
  on pocket_items (owner_id, created_at desc);

-- RLS: anon の直接アクセスは拒否（API/service_role 経由のみ）
alter table pocket_items enable row level security;
-- anon ポリシーは意図的に作らない → SELECT/INSERT/UPDATE/DELETE 全て拒否される

-- realtime: 端末間同期のため INSERT/DELETE/UPDATE を購読。
-- 中身は購読イベントをトリガに認証付きAPIで再取得するため、payload は信頼しない。
-- DELETE イベントでも owner_id でフィルタできるよう REPLICA IDENTITY FULL を設定。
alter table pocket_items replica identity full;
-- 既に登録済みでも再実行できるよう冪等化
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'pocket_items'
  ) then
    alter publication supabase_realtime add table pocket_items;
  end if;
end $$;
