-- キャリア（インターン・就職・謝礼や賞金のあるイベント）の掲載。
--
-- 載せるのは運営者が公式ページを確認したもの（ほかに学生からの情報提供・提携先からの提供）。
-- アプリは /api/career（誰でも読める・CDN キャッシュ）で公開中のものを読むだけ。書き込みは管理者と定期処理。
-- 利用者の興味・保存・閲覧はサーバーに送らない（端末の中だけ。職業安定法の「特定募集情報等提供」にしないため）。
-- 何度実行しても同じ結果になるように書いてある。

create table if not exists career_listings (
  id              uuid        primary key default gen_random_uuid(),
  kind            text        not null check (kind in ('intern', 'job', 'event')),
  status          text        not null default 'draft' check (status in ('draft', 'published', 'closed', 'hidden')),
  title           text        not null,
  org             text        not null,
  org_url         text,
  summary         text,                                -- 事実だけの短い要約（募集元の文言を変えない）
  apply_url       text        not null,                -- 公式の応募先（または提携先のページ）
  apply_url_norm  text        not null,                -- 重複判定用（lib/career.js normalizeUrl）
  source          text        not null default 'manual', -- manual / tip / partner:<名前>
  source_ref      text,                                -- 提携先側の ID
  source_url      text,                                -- 確認したページ（応募先と違うとき）
  fields          text[]      not null default '{}',   -- 分野（lib/career-tags.js CAREER_FIELDS）
  skills_req      text[]      not null default '{}',   -- 必須スキル
  skills_pref     text[]      not null default '{}',   -- 歓迎スキル
  depts           text[]      not null default '{}',   -- 募集元が対象と明記した系
  degrees         text[]      not null default '{}',   -- 対象の学位 B / M / D（空 = 書かれていない）
  grad_years      int[]       not null default '{}',   -- 対象の卒業年（空 = 書かれていない）
  intern_type     smallint,                            -- 三省合意の類型 1〜4（分かるときだけ）
  duration        text,                                -- short / long
  period_text     text,                                -- 期間・日数（募集元の記載）
  pay_kind        text,                                -- paid / unpaid / unknown
  pay_text        text,                                -- 給与・待遇（募集元の記載どおり）
  remote          text,                                -- onsite / remote / hybrid
  location        text,
  reward_kind     text,                                -- イベント: all / conditional / lottery / prize / travel / none
  reward_text     text,                                -- もらえるもの（募集元の記載どおり）
  reward_max      int,                                 -- 並べ替え用の金額（円）
  starts_at       timestamptz,
  ends_at         timestamptz,
  deadline        date,                                -- 応募締切（null = 随時）
  promo           text,                                -- null / pr / partner（表示ラベル。並び順には使わない）
  promo_note      text,
  checked_at      timestamptz not null default now(),  -- 最終確認日（画面に出す）
  link_status     text        not null default 'unknown', -- ok / broken / unknown（定期処理が更新）
  link_checked_at timestamptz,
  created_by      bigint,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create unique index if not exists career_listings_apply_url_norm on career_listings (apply_url_norm);
create index if not exists career_listings_status_deadline on career_listings (status, deadline);
create index if not exists career_listings_source on career_listings (source, source_ref);

-- service role（API ルート）だけが読み書きする。anon / authenticated からは見えない。
alter table career_listings enable row level security;
alter table career_listings force row level security;
revoke all on career_listings from anon, authenticated;

-- 公開の切り替え: 有効な掲載がそろうまでは管理者にだけ入口を出す（管理画面のキャリアのタブから切り替えられる）
insert into site_settings (key, value) values ('career', '{"public": false}'::jsonb)
on conflict (key) do nothing;
