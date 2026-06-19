-- =============================================================
-- music_tracks: 自分専用ミュージックライブラリ（AI生成曲などをアップロードして再生）
-- 「ScienceTokyo Music」: 自分でアップロードした音源を、アプリ内のどの画面でも
-- バックグラウンドで聴ける個人プレイヤー。
--
-- Supabase Dashboard の SQL Editor で実行してください。
--
-- プライバシーモデルは pocket_items / dm_messages を踏襲:
--   - RLS 有効・anon ポリシー無し → 直接アクセスは全て拒否
--   - 読み書きは API ルート (service_role) 経由のみ。owner_id = 認証ユーザー で制限
--   - 音源/カバー画像の実体は既存の非公開バケット post-attachments に
--     music/<owner_id>/ で保存し、署名URL経由でのみ取得（pocket と同じ仕組み）
-- =============================================================

create table if not exists music_tracks (
  id         uuid primary key default gen_random_uuid(),
  owner_id   bigint not null,                 -- moodle user id（投稿/DM/pocket と同じ）
  title      text not null,                   -- 曲名
  artist     text,                            -- アーティスト名（任意。AI生成なら使用モデル名など）
  audio      jsonb not null,                  -- {name, path, size, type} ※urlは取得時に署名して付与
  cover      jsonb,                           -- {path} カバー画像（任意）※同上
  duration   real,                            -- 秒（クライアントが計測して保存。任意）
  is_public  boolean not null default false,  -- true: 管理者が全員へ配信した公式曲（owner_id=投稿した管理者）
  lyrics     text,                            -- 歌詞（任意）。プレーンテキスト or LRC形式（[mm:ss.xx]）。同期はクライアントで解析
  sort_order integer not null default 0,      -- 並び順（小さいほど上）。0なら created_at 順
  created_at timestamptz not null default now()
);

-- 既にテーブルがある場合に列を追加（冪等）
alter table music_tracks add column if not exists is_public boolean not null default false;
alter table music_tracks add column if not exists lyrics text;

create index if not exists music_tracks_owner_idx
  on music_tracks (owner_id, sort_order asc, created_at desc);

-- 公式曲（全員配信）を高速に引くための部分インデックス
create index if not exists music_tracks_public_idx
  on music_tracks (is_public, created_at desc) where is_public;

-- RLS: anon の直接アクセスは拒否（API/service_role 経由のみ）
alter table music_tracks enable row level security;
-- anon ポリシーは意図的に作らない → SELECT/INSERT/UPDATE/DELETE 全て拒否される

-- realtime: 端末間同期のため変更を購読。中身は購読イベントをトリガに
-- 認証付きAPIで再取得するため、payload は信頼しない。
-- DELETE イベントでも owner_id でフィルタできるよう REPLICA IDENTITY FULL を設定。
alter table music_tracks replica identity full;
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'music_tracks'
  ) then
    alter publication supabase_realtime add table music_tracks;
  end if;
end $$;
