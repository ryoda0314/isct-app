-- =============================================================
-- Usage Analytics: 認証ユーザーの利用行動ログ（追記専用）
-- Supabase Dashboard の SQL Editor で実行
-- =============================================================
--
-- 設計方針（Nano Disk の IO 予算対策）:
--   * クライアントがイベントをメモリに溜め、まとめて 1 回だけ INSERT する。
--   * 追記のみ（UPDATE しない）＝ dead tuple / WAL churn が出ない。
--     profiles.last_active_at の毎リクエスト UPDATE churn とは対照的。
--   * 生ログは肥大化するので pg_cron で古い行を日次削除（末尾・任意）。
--
-- 記録するイベント（event 列）:
--   'app_open'     … コールド起動（セッション開始）
--   'resume'       … バックグラウンドからの復帰
--   'feature_open' … 画面切り替え（＝「開いた回数」の単位）。feature 列に view id。
--
-- 日境界は Asia/Tokyo（学生の体感する「今日」に合わせる。analytics.sql と同じ）。

-- ── 利用イベントテーブル（追記専用） ─────────────────────────────
create table if not exists usage_events (
  id          bigint generated always as identity primary key,
  moodle_id   bigint not null,          -- 認証から付与（クライアント値は信用しない）
  session_id  text,                     -- 起動ごとにクライアント生成（=1回の利用の単位）
  event       text not null,            -- app_open / resume / feature_open
  feature     text,                     -- view id（timetable, dm, map ... feature_open のみ）
  ts          timestamptz not null default now(),  -- クライアント時刻（検証済み）
  created_at  timestamptz not null default now()   -- サーバー着信時刻
);

-- 集計用インデックス。すべて created_at ではなく ts（体感時刻）を軸にする。
create index if not exists idx_ue_ts        on usage_events(ts desc);
create index if not exists idx_ue_user_ts   on usage_events(moodle_id, ts desc);
create index if not exists idx_ue_feat_ts   on usage_events(feature, ts desc) where event = 'feature_open';
create index if not exists idx_ue_event_ts  on usage_events(event, ts desc);

alter table usage_events enable row level security;
-- anon / authenticated には一切許可しない。書き込みは /api/track が service_role で行う。
-- （service_role はデフォルトで RLS をバイパス）

-- ── 日別 利用サマリ ──────────────────────────────────────────────
-- opens          = feature_open の総数（＝画面切り替え回数）
-- active_users   = その日に何らかのイベントを出したユニークユーザー数
-- opens_per_user = opens / active_users（1人あたり平均 画面切り替え回数）
-- app_opens      = コールド起動数 / resumes = 復帰数
create or replace function admin_usage_daily(p_days int)
returns table(
  day text, active_users bigint, opens bigint,
  opens_per_user numeric, app_opens bigint, resumes bigint
)
language sql
security definer
set search_path = public
as $$
  with bounds as (
    select (now() at time zone 'Asia/Tokyo')::date                            as end_day,
           (now() at time zone 'Asia/Tokyo')::date - (greatest(p_days, 1) - 1) as start_day
  ),
  span as (
    select generate_series((select start_day from bounds),
                           (select end_day from bounds),
                           interval '1 day')::date as d
  ),
  ev as (
    select moodle_id, event, (ts at time zone 'Asia/Tokyo')::date as d
    from usage_events
    where (ts at time zone 'Asia/Tokyo')::date >= (select start_day from bounds)
  ),
  agg as (
    select d,
           count(distinct moodle_id)                          as active_users,
           count(*) filter (where event = 'feature_open')     as opens,
           count(*) filter (where event = 'app_open')         as app_opens,
           count(*) filter (where event = 'resume')           as resumes
    from ev group by d
  )
  select to_char(s.d, 'YYYY-MM-DD')                            as day,
         coalesce(a.active_users, 0)                           as active_users,
         coalesce(a.opens, 0)                                  as opens,
         case when coalesce(a.active_users,0) > 0
              then round(a.opens::numeric / a.active_users, 1)
              else 0 end                                       as opens_per_user,
         coalesce(a.app_opens, 0)                              as app_opens,
         coalesce(a.resumes, 0)                                as resumes
  from span s
  left join agg a on a.d = s.d
  order by s.d;
$$;

-- ── 機能別 利用ランキング ────────────────────────────────────────
-- 期間内に各画面が何回開かれたか（opens）と、開いたユニークユーザー数（users）。
create or replace function admin_feature_usage(p_days int)
returns table(feature text, opens bigint, users bigint)
language sql
security definer
set search_path = public
as $$
  with bounds as (
    select (now() at time zone 'Asia/Tokyo')::date - (greatest(p_days, 1) - 1) as start_day
  )
  select coalesce(feature, '(unknown)')       as feature,
         count(*)                             as opens,
         count(distinct moodle_id)            as users
  from usage_events
  where event = 'feature_open'
    and (ts at time zone 'Asia/Tokyo')::date >= (select start_day from bounds)
  group by 1
  order by opens desc;
$$;

-- ── ユーザー別 機能アクセス内訳 ──────────────────────────────────
-- 特定ユーザーが期間内に各画面を何回開いたか。専用カウンタテーブルは持たず
-- （UPDATE churn 回避）、生ログをここで集計する。管理画面のユーザー詳細用。
create or replace function admin_user_feature_usage(p_user bigint, p_days int)
returns table(feature text, opens bigint, last_at timestamptz)
language sql
security definer
set search_path = public
as $$
  with bounds as (
    select (now() at time zone 'Asia/Tokyo')::date - (greatest(p_days, 1) - 1) as start_day
  )
  select coalesce(feature, '(unknown)')  as feature,
         count(*)                        as opens,
         max(ts)                         as last_at
  from usage_events
  where moodle_id = p_user
    and event = 'feature_open'
    and (ts at time zone 'Asia/Tokyo')::date >= (select start_day from bounds)
  group by 1
  order by opens desc;
$$;

revoke execute on function admin_usage_daily(int)             from anon, authenticated;
revoke execute on function admin_feature_usage(int)           from anon, authenticated;
revoke execute on function admin_user_feature_usage(bigint,int) from anon, authenticated;
grant  execute on function admin_usage_daily(int)             to service_role;
grant  execute on function admin_feature_usage(int)           to service_role;
grant  execute on function admin_user_feature_usage(bigint,int) to service_role;

-- ── 生ログの保持期間（任意・推奨） ───────────────────────────────
-- 90 日より古い生イベントを日次で削除して肥大化を防ぐ。
-- pg_cron 拡張が有効な場合のみ。無効でも上記の記録・集計は動作する。
-- 手動実行: delete from usage_events where ts < now() - interval '90 days';
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule(
      'usage_events_prune',
      '17 4 * * *',  -- 毎日 04:17 UTC (= 13:17 JST)
      $cron$ delete from usage_events where ts < now() - interval '90 days'; $cron$
    );
  end if;
end $$;
