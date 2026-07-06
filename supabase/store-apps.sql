-- =============================================================
-- App Store (アプリストア) — store_apps テーブル
--
-- 管理者が「アプリ」を登録し、ユーザーは App Store 風カード一覧から開ける。
-- 各アプリは内部ビュー(target_type='view', 例 'music')または外部URL
-- (target_type='url')を指す。カードの見せ方(タイトル/説明/アイコン/
-- スクショ/注目/並び順/公開)はすべてこのテーブルで管理でき、再デプロイ不要。
--
-- アクセスはすべてサーバー側 API(getSupabaseAdmin, service_role)経由なので
-- RLS は「有効化のみ・匿名ポリシー無し」で service_role のみが読み書きする。
-- 冪等性: 何度実行しても安全 (create if not exists / on conflict do nothing)。
-- =============================================================

create table if not exists public.store_apps (
  id           bigint generated always as identity primary key,
  slug         text unique not null,                 -- 安定キー(コード/管理での識別用)
  title        text not null,                        -- アプリ名
  subtitle     text not null default '',             -- カード用の一言キャッチ
  description  text not null default '',             -- 詳細ページの説明(長文可)
  icon         text not null default '',             -- アイコンキー(icons.jsx の I.* 名) or 絵文字
  color        text not null default '#007AFF',      -- アクセントカラー
  category     text not null default 'other',        -- learning|campus|social|tools|other
  target_type  text not null default 'view',         -- 'view'(内部画面) | 'url'(外部)
  target       text not null,                        -- view id (例 'music') または URL
  screenshots  jsonb not null default '[]'::jsonb,   -- スクショ画像URLの配列
  featured     boolean not null default false,       -- 注目バナーに出す
  badge        text not null default '',             -- 任意: 'new' / 'beta' など
  sort_order   int not null default 0,               -- 小さいほど上
  admin_only   boolean not null default false,       -- 管理者だけに表示
  enabled      boolean not null default true,        -- 公開/非公開
  created_by   text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists store_apps_enabled_idx  on public.store_apps (enabled, sort_order);
create index if not exists store_apps_category_idx on public.store_apps (category);

-- 「ScienceTokyoでログイン」対応アプリか。true のとき、マイアプリから開くと
-- 同一オリジンで発行した SSO code を付けて callback を開き、自動ログインする。
alter table public.store_apps add column if not exists sso_enabled boolean not null default false;

alter table public.store_apps enable row level security;
-- 匿名/認証ユーザー向けポリシーは作らない(service_role が RLS をバイパスして全操作)。

-- --- ユーザーごとの「入手(インストール)」状態 ---
-- ストアで「入手」したアプリだけが「マイアプリ」に並ぶ。ストア=入手、マイアプリ=開く、で分離。
create table if not exists public.store_app_installs (
  user_id     text   not null,
  app_id      bigint not null references public.store_apps(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (user_id, app_id)
);
create index if not exists store_app_installs_user_idx on public.store_app_installs (user_id);
alter table public.store_app_installs enable row level security;
-- アクセスは service_role 経由の API のみ。匿名/認証ポリシーは作らない。

-- --- 掲載方針 ---
-- ストアに載せるのは「別で作った自作アプリ(外部)」のみ。
-- 音楽/教科書などアプリ内蔵の機能はストアに載せない(従来どおりメニューから使う)。
--
-- 過去に内蔵機能をシードしていた場合の掃除:
-- 自動シード分(created_by が NULL)の内部ビュー型(target_type='view')を削除する。
-- 管理画面から手動登録したもの(created_by あり)は消さない。
delete from public.store_apps where created_by is null and target_type = 'view';

-- --- 初期シード: 自作アプリ(外部) ---
insert into public.store_apps
  (slug, title, subtitle, description, icon, color, category, target_type, target, featured, badge, sort_order)
values
  ('polylinga', 'PolyLinga', '多言語学習アプリ', '開発者が作成した多言語学習アプリ。別サイトで開きます。', 'chat', '#0EA5E9', 'tools', 'url', 'https://polylinga.app', true, 'new', 10),
  ('word', 'Word', '単語学習アプリ', '開発者が作成した単語学習アプリ。別サイトで開きます。', 'book', '#34C759', 'learning', 'url', 'https://word-zeta-taupe.vercel.app/', true, 'new', 20)
on conflict (slug) do nothing;

-- word は ScienceTokyo ログイン対応
update public.store_apps set sso_enabled = true where slug = 'word';
