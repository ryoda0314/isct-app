-- =============================================================
-- サークル機能マイグレーション
-- Supabase Dashboard の SQL Editor で実行
-- =============================================================

-- 22. circles: サークル本体
create table if not exists circles (
  id          text primary key,                -- 'cir_xxxx'
  name        text not null,
  icon        text,                            -- 絵文字/1文字 or 画像URL (data: / https:)
  color       text default '#6375f0',
  banner      text,                            -- バナー画像URL
  description text default '',
  is_public   boolean default true,
  allow_invite boolean default true,
  join_mode   text default 'open',             -- open: 自由参加, approval: 承認制, invite_only: 招待のみ
  tags        text[] default '{}',             -- ジャンルタグ (例: {'運動','テニス','初心者歓迎'})
  owner_id    bigint not null references profiles(moodle_id),  -- 最高権限者 (譲渡可能)
  created_at  timestamptz default now()
);

-- 23. circle_roles: カスタム役職 (ownerが作成・管理)
create table if not exists circle_roles (
  id          text primary key,                -- 'role_xxxx'
  circle_id   text not null references circles(id) on delete cascade,
  name        text not null,                   -- 役職名 (例: 副部長, 会計, 広報)
  color       text default '#888888',          -- 役職の表示カラー
  sort_order  int default 0,                   -- 表示順 (小さい=上位)
  -- 権限フラグ
  can_manage_members  boolean default false,   -- メンバー管理 (キック・役職変更)
  can_manage_channels boolean default false,   -- チャンネル管理
  can_announce        boolean default false,   -- お知らせ投稿
  can_manage_events   boolean default false,   -- イベント管理
  can_manage_recruit  boolean default false,   -- 募集管理
  can_pin             boolean default false,   -- メッセージピン留め
  created_at  timestamptz default now()
);
create index if not exists idx_circle_roles_circle on circle_roles(circle_id, sort_order);

-- 24. circle_members: メンバー
create table if not exists circle_members (
  id         bigint generated always as identity primary key,
  circle_id  text not null references circles(id) on delete cascade,
  user_id    bigint not null references profiles(moodle_id),
  role_id    text references circle_roles(id) on delete set null,  -- カスタム役職 (null=一般メンバー)
  joined_at  timestamptz default now(),
  unique(circle_id, user_id)
);
create index if not exists idx_circle_members_circle on circle_members(circle_id);
create index if not exists idx_circle_members_user on circle_members(user_id);

-- オーナー譲渡用関数
-- 現オーナーのみ実行可能。新オーナーはサークルメンバーである必要あり。
create or replace function transfer_circle_ownership(
  p_circle_id text,
  p_current_owner bigint,
  p_new_owner bigint
) returns void as $$
begin
  -- 現オーナーであることを確認
  if not exists (
    select 1 from circles where id = p_circle_id and owner_id = p_current_owner
  ) then
    raise exception 'Only the current owner can transfer ownership';
  end if;
  -- 新オーナーがメンバーであることを確認
  if not exists (
    select 1 from circle_members where circle_id = p_circle_id and user_id = p_new_owner
  ) then
    raise exception 'New owner must be a member of the circle';
  end if;
  -- 譲渡
  update circles set owner_id = p_new_owner where id = p_circle_id;
end;
$$ language plpgsql security definer;

-- 25. circle_categories: チャンネルカテゴリ
create table if not exists circle_categories (
  id         text primary key,                 -- 'cat_xxxx'
  circle_id  text not null references circles(id) on delete cascade,
  name       text not null,
  sort_order int default 0,
  created_at timestamptz default now()
);
create index if not exists idx_circle_categories_circle on circle_categories(circle_id);

-- 26. circle_channels: チャンネル
create table if not exists circle_channels (
  id          text primary key,                -- 'ch_xxxx'
  circle_id   text not null references circles(id) on delete cascade,
  category_id text references circle_categories(id) on delete set null,
  name        text not null,
  type        text not null default 'text',    -- text, voice, etc.
  sort_order  int default 0,
  created_at  timestamptz default now()
);
create index if not exists idx_circle_channels_circle on circle_channels(circle_id);

-- 27. circle_messages: チャンネルメッセージ
create table if not exists circle_messages (
  id          bigint generated always as identity primary key,
  channel_id  text not null references circle_channels(id) on delete cascade,
  sender_id   bigint not null references profiles(moodle_id),
  text        text not null,
  pinned      boolean default false,
  created_at  timestamptz default now()
);
create index if not exists idx_circle_messages_channel on circle_messages(channel_id, created_at desc);

-- 28. circle_announcements: お知らせ
create table if not exists circle_announcements (
  id         text primary key,                 -- 'ann_xxxx'
  circle_id  text not null references circles(id) on delete cascade,
  text       text not null,
  by_name    text not null,                    -- 投稿者名
  by_user_id bigint references profiles(moodle_id),
  pinned     boolean default false,
  created_at timestamptz default now()
);
create index if not exists idx_circle_announcements_circle on circle_announcements(circle_id, created_at desc);

-- 29. circle_events: イベント
create table if not exists circle_events (
  id          text primary key,                -- 'cev_xxxx'
  circle_id   text not null references circles(id) on delete cascade,
  title       text not null,
  description text default '',
  location    text default '',
  event_date  timestamptz not null,
  created_at  timestamptz default now()
);
create index if not exists idx_circle_events_circle on circle_events(circle_id, event_date);

-- 30. circle_event_rsvps: イベント参加表明
create table if not exists circle_event_rsvps (
  id         bigint generated always as identity primary key,
  event_id   text not null references circle_events(id) on delete cascade,
  user_id    bigint not null references profiles(moodle_id),
  status     text not null default 'going',    -- going, maybe, not_going
  created_at timestamptz default now(),
  unique(event_id, user_id)
);

-- 31. circle_recruits: 募集
create table if not exists circle_recruits (
  id          text primary key,                -- 'rec_xxxx'
  circle_id   text not null references circles(id) on delete cascade,
  title       text not null,
  description text default '',
  spots       int default 1,
  applied     int default 0,
  deadline    timestamptz,
  closed      boolean default false,
  created_at  timestamptz default now()
);
create index if not exists idx_circle_recruits_circle on circle_recruits(circle_id);

-- =============================================
-- 会費・申請・承認・期間管理
-- =============================================

-- 32. circle_join_applications: 参加申請
create table if not exists circle_join_applications (
  id          text primary key,                -- 'app_xxxx'
  circle_id   text not null references circles(id) on delete cascade,
  user_id     bigint not null references profiles(moodle_id),
  message     text default '',                 -- 申請メッセージ (自己紹介・志望動機)
  status      text not null default 'pending', -- pending, approved, rejected, withdrawn
  reviewed_by bigint references profiles(moodle_id),  -- 承認/却下した人
  reviewed_at timestamptz,
  reject_reason text,                          -- 却下理由
  created_at  timestamptz default now(),
  unique(circle_id, user_id, status)           -- 同じユーザーの重複 pending 防止
);
create index if not exists idx_circle_join_apps_circle on circle_join_applications(circle_id, status);
create index if not exists idx_circle_join_apps_user on circle_join_applications(user_id);

-- 33. circle_fee_plans: 会費プラン設定 (ownerが管理)
create table if not exists circle_fee_plans (
  id          text primary key,                -- 'fp_xxxx'
  circle_id   text not null references circles(id) on delete cascade,
  name        text not null,                   -- プラン名 (例: 通常会費, 新入生割引, 幽霊部員)
  amount      int not null default 0,          -- 金額 (円)
  cycle       text not null default 'yearly',  -- yearly: 年次, half_yearly: 半期, monthly: 月次, one_time: 入会時のみ
  description text default '',                 -- 説明
  is_default  boolean default false,           -- 新規メンバーに自動適用するか
  is_active   boolean default true,            -- 有効/無効
  created_at  timestamptz default now()
);
create index if not exists idx_circle_fee_plans_circle on circle_fee_plans(circle_id);

-- 34. circle_fiscal_periods: 会計期間 (年度/半期)
create table if not exists circle_fiscal_periods (
  id          text primary key,                -- 'per_xxxx'
  circle_id   text not null references circles(id) on delete cascade,
  name        text not null,                   -- 表示名 (例: 2026年度, 2026前期, 2026後期)
  period_type text not null default 'yearly',  -- yearly, first_half, second_half, custom
  start_date  date not null,
  end_date    date not null,
  is_current  boolean default false,           -- 現在の会計期間か
  created_at  timestamptz default now()
);
create index if not exists idx_circle_fiscal_periods_circle on circle_fiscal_periods(circle_id);

-- 35. circle_fee_assignments: メンバーへの会費割当
-- どのメンバーにどの期間・どのプランの会費を請求するか
create table if not exists circle_fee_assignments (
  id          text primary key,                -- 'fa_xxxx'
  circle_id   text not null references circles(id) on delete cascade,
  user_id     bigint not null references profiles(moodle_id),
  plan_id     text not null references circle_fee_plans(id) on delete cascade,
  period_id   text not null references circle_fiscal_periods(id) on delete cascade,
  amount      int not null,                    -- 請求額 (プランと異なる場合に上書き可)
  status      text not null default 'unpaid',  -- unpaid: 未納, paid: 納入済, exempt: 免除, overdue: 滞納
  due_date    date,                            -- 支払期限
  paid_at     timestamptz,                     -- 支払日時
  confirmed_by bigint references profiles(moodle_id), -- 回収確認した管理者
  confirmed_at timestamptz,
  memo        text default '',                 -- 備考 (免除理由、特記事項)
  created_at  timestamptz default now(),
  unique(circle_id, user_id, plan_id, period_id)
);
create index if not exists idx_circle_fee_assignments_circle on circle_fee_assignments(circle_id, period_id, status);
create index if not exists idx_circle_fee_assignments_user on circle_fee_assignments(user_id);

-- 36. circle_fee_logs: 会費操作ログ (監査証跡)
create table if not exists circle_fee_logs (
  id          bigint generated always as identity primary key,
  circle_id   text not null references circles(id) on delete cascade,
  assignment_id text references circle_fee_assignments(id) on delete set null,
  action      text not null,                   -- created, paid, confirmed, exempted, overdue, refunded, plan_changed
  actor_id    bigint references profiles(moodle_id), -- 操作した人
  target_id   bigint references profiles(moodle_id), -- 対象メンバー
  detail      text default '',                 -- 操作詳細
  amount      int,                             -- 関連金額
  created_at  timestamptz default now()
);
create index if not exists idx_circle_fee_logs_circle on circle_fee_logs(circle_id, created_at desc);

-- 会計期間の一括生成ヘルパー (年度 or 半期)
create or replace function generate_circle_fiscal_periods(
  p_circle_id text,
  p_year int,            -- 例: 2026
  p_type text            -- 'yearly' or 'half_yearly'
) returns void as $$
begin
  if p_type = 'yearly' then
    insert into circle_fiscal_periods (id, circle_id, name, period_type, start_date, end_date)
    values (
      'per_' || p_circle_id || '_' || p_year,
      p_circle_id,
      p_year || '年度',
      'yearly',
      make_date(p_year, 4, 1),    -- 4月始まり
      make_date(p_year + 1, 3, 31)
    ) on conflict do nothing;
  elsif p_type = 'half_yearly' then
    insert into circle_fiscal_periods (id, circle_id, name, period_type, start_date, end_date)
    values
    (
      'per_' || p_circle_id || '_' || p_year || '_h1',
      p_circle_id,
      p_year || '年度 前期',
      'first_half',
      make_date(p_year, 4, 1),
      make_date(p_year, 9, 30)
    ),
    (
      'per_' || p_circle_id || '_' || p_year || '_h2',
      p_circle_id,
      p_year || '年度 後期',
      'second_half',
      make_date(p_year, 10, 1),
      make_date(p_year + 1, 3, 31)
    ) on conflict do nothing;
  end if;
end;
$$ language plpgsql security definer;

-- 会費の一括割当ヘルパー
-- 指定期間に対して全メンバーにデフォルトプランの会費を割り当てる
create or replace function bulk_assign_circle_fees(
  p_circle_id text,
  p_period_id text,
  p_due_date date default null
) returns int as $$
declare
  v_plan circle_fee_plans%rowtype;
  v_count int := 0;
begin
  -- デフォルトプランを取得
  select * into v_plan from circle_fee_plans
    where circle_id = p_circle_id and is_default = true and is_active = true
    limit 1;
  if v_plan.id is null then
    raise exception 'No active default fee plan found for this circle';
  end if;
  -- 全メンバーに割当
  insert into circle_fee_assignments (id, circle_id, user_id, plan_id, period_id, amount, due_date)
    select
      'fa_' || p_circle_id || '_' || cm.user_id || '_' || p_period_id,
      p_circle_id,
      cm.user_id,
      v_plan.id,
      p_period_id,
      v_plan.amount,
      p_due_date
    from circle_members cm
    where cm.circle_id = p_circle_id
  on conflict do nothing;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$ language plpgsql security definer;

-- ── RLS ──
alter table circles enable row level security;
alter table circle_roles enable row level security;
alter table circle_members enable row level security;
alter table circle_categories enable row level security;
alter table circle_channels enable row level security;
alter table circle_messages enable row level security;
alter table circle_announcements enable row level security;
alter table circle_events enable row level security;
alter table circle_event_rsvps enable row level security;
alter table circle_recruits enable row level security;
alter table circle_join_applications enable row level security;
alter table circle_fee_plans enable row level security;
alter table circle_fiscal_periods enable row level security;
alter table circle_fee_assignments enable row level security;
alter table circle_fee_logs enable row level security;

-- anon: 公開サークル情報の SELECT のみ
create policy "anon_select_circles" on circles
  for select to anon using (is_public = true);

-- その他は service_role 経由のみ (anon SELECT 不可)
-- circle_members, circle_channels, circle_messages 等はAPIルート経由

-- ── Realtime有効化 ──
alter publication supabase_realtime add table circle_messages;
alter publication supabase_realtime add table circle_members;
alter publication supabase_realtime add table circle_announcements;

-- ── サークルアイコン/バナー用ストレージ ──
insert into storage.buckets (id, name, public) values ('circle-assets', 'circle-assets', true)
on conflict do nothing;

create policy "anon_read_circle_assets" on storage.objects
  for select to anon using (bucket_id = 'circle-assets');
