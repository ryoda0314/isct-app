-- =============================================================
-- Festival Booths: 学園祭（工大祭など）の出店・展示の宣伝
-- 学生が自分の模擬店・展示・ステージ等を登録し、誰でも一覧で見られる。
--
-- Supabase Dashboard の SQL Editor で実行（冪等：再実行可）。
-- 全操作は /api/festival（service_role）経由。anon ポリシーは作らない。
-- =============================================================

create table if not exists festival_booths (
  id           uuid primary key default gen_random_uuid(),
  festival     text not null default 'koudaisai2026',   -- 開催回の識別子
  owner_id     bigint not null,                         -- moodle user id（投稿者）
  name         text not null,                           -- 出店名
  org          text,                                    -- 団体名（サークル・研究室など）
  category     text not null,                           -- food, drink, exhibit, game, stage, goods, other
  description  text,                                    -- 紹介文・メニュー・価格など
  building     text,                                    -- SPOTS の id（マップ連携用・任意）
  location     text,                                    -- 場所の補足（例: 本館前 3番テント）
  hours        text,                                    -- 営業時間・公演時間（自由記述）
  link         text,                                    -- SNS 等のURL（任意）
  image        jsonb,                                   -- {path} 公開バケット festival-public 内（url は取得時に付与）
  likes        bigint[] not null default '{}',
  hidden       boolean not null default false,          -- 管理者による非表示
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists festival_booths_list_idx on festival_booths (festival, category, created_at desc) where not hidden;
create index if not exists festival_booths_owner_idx on festival_booths (owner_id);

alter table festival_booths enable row level security;
-- anon ポリシーは意図的に作らない → API 経由以外の操作はすべて拒否

-- いいねのトグル（競合しないよう1文で更新）
create or replace function toggle_festival_like(p_booth_id uuid, p_user_id bigint)
returns bigint[] language sql as $$
  update festival_booths
     set likes = case when p_user_id = any(likes) then array_remove(likes, p_user_id)
                      else array_append(likes, p_user_id) end
   where id = p_booth_id
  returning likes;
$$;

-- 画像用の公開バケット（安定URLで CDN キャッシュを効かせ、egress を抑える）
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('festival-public', 'festival-public', true, 2097152, array['image/jpeg','image/png','image/webp'])  -- 2MB/ファイル
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- =============================================================
-- 学生限定クーポン（1出店につき1枚・1人1回）
-- 学生が店頭で「使う」を押し、表示された使用済み画面を店員が目視で確認する方式。
-- =============================================================

alter table festival_booths add column if not exists coupon_title  text;     -- 特典（例: 50円引き）。null ならクーポンなし
alter table festival_booths add column if not exists coupon_detail text;     -- 条件など
alter table festival_booths add column if not exists coupon_limit  integer;  -- 先着枚数（null = 上限なし）
alter table festival_booths add column if not exists coupon_used   integer not null default 0;

create table if not exists festival_coupon_uses (
  id        bigint generated always as identity primary key,
  booth_id  uuid not null references festival_booths(id) on delete cascade,
  user_id   bigint not null,                    -- moodle user id
  used_at   timestamptz not null default now(),
  unique (booth_id, user_id)
);
create index if not exists festival_coupon_uses_user_idx on festival_coupon_uses (user_id);

alter table festival_coupon_uses enable row level security;
-- anon ポリシーは作らない（/api/festival 経由のみ）

-- クーポン使用（行ロックで先着上限と1人1回を保証）
-- r_status: ok / already / sold_out / no_coupon
create or replace function use_festival_coupon(p_booth_id uuid, p_user_id bigint)
returns table (r_status text, r_used_at timestamptz, r_used_count integer)
language plpgsql as $$
declare
  b festival_booths%rowtype;
  t timestamptz;
begin
  select * into b from festival_booths where id = p_booth_id for update;
  if not found or b.coupon_title is null or b.hidden then
    return query select 'no_coupon'::text, null::timestamptz, 0; return;
  end if;
  select u.used_at into t from festival_coupon_uses u where u.booth_id = p_booth_id and u.user_id = p_user_id;
  if found then
    return query select 'already'::text, t, b.coupon_used; return;
  end if;
  if b.coupon_limit is not null and b.coupon_used >= b.coupon_limit then
    return query select 'sold_out'::text, null::timestamptz, b.coupon_used; return;
  end if;
  insert into festival_coupon_uses (booth_id, user_id) values (p_booth_id, p_user_id) returning used_at into t;
  update festival_booths set coupon_used = coupon_used + 1 where id = p_booth_id;
  return query select 'ok'::text, t, b.coupon_used + 1;
end;
$$;

-- =============================================================
-- 掲載申請（代表者が申請 → 運営が承認すると festival_booths に掲載）
-- 条件: 団体メンバー3人以上（代表者を含む）がアプリに登録済みであること。
--       メンバーは対面でQRを読み取って追加する（本人がその場で同意したことの確認を兼ねる）。
-- =============================================================

create table if not exists festival_applications (
  id                uuid primary key default gen_random_uuid(),
  festival          text not null default 'koudaisai2026',
  applicant_id      bigint not null,                 -- 代表者の moodle user id
  applicant_login   text not null,                   -- 代表者の Science Tokyo ID
  booth_id          uuid references festival_booths(id) on delete cascade,  -- null = 新規、値あり = 掲載中の出店の変更申請
  payload           jsonb not null,                  -- 検証済みの出店内容（festival_booths の列と同じ形）
  member_ids        bigint[] not null default '{}',  -- 代表者以外のメンバーの moodle user id（QRで確認済み）
  status            text not null default 'pending', -- pending / approved / rejected / withdrawn
  reject_reason     text,
  reviewed_by       bigint,
  reviewed_at       timestamptz,
  created_at        timestamptz not null default now()
);
create index if not exists festival_applications_status_idx on festival_applications (festival, status, created_at desc);
create index if not exists festival_applications_applicant_idx on festival_applications (applicant_id, created_at desc);

-- 旧版（Science Tokyo ID を手入力していた版）を実行済みの場合に備える
alter table festival_applications add column if not exists member_ids bigint[] not null default '{}';
alter table festival_applications drop column if exists member_logins;

alter table festival_applications enable row level security;
-- anon ポリシーは作らない（/api/festival/applications 経由のみ）

-- =============================================================
-- 確認済みメンバー名簿（代表者ごと・期限なし）
-- 代表者がメンバー用QRを読み取ると登録される。申請時はこの名簿のメンバーを使う。
-- =============================================================

create table if not exists festival_member_links (
  rep_id       bigint not null,                    -- 代表者の moodle user id
  member_id    bigint not null,                    -- メンバーの moodle user id
  verified_at  timestamptz not null default now(), -- QRを読み取った日時
  primary key (rep_id, member_id)
);
alter table festival_member_links enable row level security;

-- =============================================================
-- 申請の下書き（サーバー保存。端末をまたいで再開できる）
-- draft_key: 'new' = 新規申請、出店の uuid = その出店の変更申請
-- =============================================================

create table if not exists festival_drafts (
  applicant_id  bigint not null,
  draft_key     text not null,
  form          jsonb not null,     -- フォームの入力内容（未検証）。画像は {path,url} で保持
  updated_at    timestamptz not null default now(),
  primary key (applicant_id, draft_key)
);
alter table festival_drafts enable row level security;
-- どちらも anon ポリシーは作らない（/api/festival/* 経由のみ）
