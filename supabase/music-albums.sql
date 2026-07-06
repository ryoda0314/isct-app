-- =============================================================
-- music_albums: 「ScienceTokyo Music」にアルバムの概念を追加する。
--
-- これまでは配信曲(music_tracks, is_public)がひとつのフラットな一覧だったが、
-- 複数のアルバムを作り、各アルバムに複数曲を紐づけられるようにする。
--   - music_albums … アルバム本体（タイトル/アーティスト/カバー/公開）
--   - music_tracks.album_id … 曲がどのアルバムに属するか（NULL可＝シングル扱い）
--
-- プライバシー/配信モデルは music_tracks を踏襲:
--   - RLS 有効・anon ポリシー無し → 直接アクセスは全て拒否
--   - 読み書きは API ルート(service_role)経由のみ。owner_id = 認証ユーザー で制限
--   - 公式アルバム(is_public)のカバー実体は公開バケット music-public(music/public/cover/)へ
--
-- Supabase Dashboard の SQL Editor で実行してください（冪等・何度実行しても安全）。
-- =============================================================

create table if not exists music_albums (
  id         uuid primary key default gen_random_uuid(),
  owner_id   bigint not null,                 -- moodle user id（作成した管理者）
  title      text not null,                   -- アルバム名
  artist     text,                            -- アーティスト名（任意）
  cover      jsonb,                           -- {path} カバー画像（任意）※url は取得時に付与
  is_public  boolean not null default false,  -- true: 全員に配信された公式アルバム
  sort_order integer not null default 0,      -- 並び順（小さいほど上）。0なら created_at 順
  created_at timestamptz not null default now()
);

create index if not exists music_albums_owner_idx
  on music_albums (owner_id, sort_order asc, created_at desc);
create index if not exists music_albums_public_idx
  on music_albums (is_public, sort_order asc, created_at desc) where is_public;

-- 曲にアルバム参照を追加（NULL = どのアルバムにも属さないシングル）。
-- アルバム削除時は曲を消さずにシングルへ戻す（set null）。
alter table music_tracks add column if not exists album_id uuid references music_albums(id) on delete set null;
create index if not exists music_tracks_album_idx on music_tracks (album_id, sort_order asc, created_at asc);

-- RLS: anon の直接アクセスは拒否（API/service_role 経由のみ）
alter table music_albums enable row level security;
-- anon ポリシーは意図的に作らない → 全操作が拒否される

-- realtime: 端末間同期のため変更を購読（payload は信頼せず再取得のトリガに使う）
alter table music_albums replica identity full;
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'music_albums'
  ) then
    alter publication supabase_realtime add table music_albums;
  end if;
end $$;
