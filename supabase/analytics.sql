-- Admin growth & activity analytics RPCs.
-- These aggregate server-side (counts only) so the admin dashboard can render
-- time-series charts without pulling raw rows over the wire — important for the
-- Nano instance's limited disk IO budget (see optimize-disk-io.sql).
--
-- Day boundaries use Asia/Tokyo so "today" matches what students perceive.
-- Both functions are SECURITY DEFINER but callable only by service_role, which
-- is what the /api/admin route uses (anon/authenticated are revoked below).
--
-- Apply once: psql/Supabase SQL editor → run this file. The /api/admin
-- ?action=analytics endpoint falls back to (heavier) JS aggregation if these
-- functions are absent, so the dashboard works before this is applied too.

-- ── Daily new registrations + running cumulative total ───────────────────────
create or replace function admin_growth_daily(p_days int)
returns table(day text, new_users bigint, cumulative bigint)
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
  daily as (
    select (created_at at time zone 'Asia/Tokyo')::date as d, count(*) as n
    from profiles
    where (created_at at time zone 'Asia/Tokyo')::date >= (select start_day from bounds)
    group by 1
  ),
  base as (
    select count(*) as b
    from profiles
    where (created_at at time zone 'Asia/Tokyo')::date < (select start_day from bounds)
  )
  select to_char(s.d, 'YYYY-MM-DD')                                        as day,
         coalesce(dly.n, 0)                                                as new_users,
         (select b from base) + sum(coalesce(dly.n, 0)) over (order by s.d) as cumulative
  from span s
  left join daily dly on dly.d = s.d
  order by s.d;
$$;

-- ── Daily engagement: distinct active users + content volume by kind ─────────
-- "Active" = created any content that day (post / comment / course message / DM).
-- There is no historical login log (profiles.last_active_at is a single snapshot),
-- so this content-derived active-user count is the best available activity proxy.
create or replace function admin_activity_daily(p_days int)
returns table(day text, active_users bigint, posts bigint, comments bigint, messages bigint, dms bigint)
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
    select moodle_user_id as uid, (created_at at time zone 'Asia/Tokyo')::date as d, 'post' as kind
      from posts        where (created_at at time zone 'Asia/Tokyo')::date >= (select start_day from bounds)
    union all
    select moodle_user_id, (created_at at time zone 'Asia/Tokyo')::date, 'comment'
      from comments     where (created_at at time zone 'Asia/Tokyo')::date >= (select start_day from bounds)
    union all
    select moodle_user_id, (created_at at time zone 'Asia/Tokyo')::date, 'message'
      from messages     where (created_at at time zone 'Asia/Tokyo')::date >= (select start_day from bounds)
    union all
    select sender_id, (created_at at time zone 'Asia/Tokyo')::date, 'dm'
      from dm_messages  where (created_at at time zone 'Asia/Tokyo')::date >= (select start_day from bounds)
  )
  select to_char(s.d, 'YYYY-MM-DD')                                as day,
         count(distinct e.uid)                                     as active_users,
         count(*) filter (where e.kind = 'post')                   as posts,
         count(*) filter (where e.kind = 'comment')                as comments,
         count(*) filter (where e.kind = 'message')                as messages,
         count(*) filter (where e.kind = 'dm')                     as dms
  from span s
  left join ev e on e.d = s.d
  group by s.d
  order by s.d;
$$;

revoke execute on function admin_growth_daily(int)   from anon, authenticated;
revoke execute on function admin_activity_daily(int) from anon, authenticated;
grant  execute on function admin_growth_daily(int)   to service_role;
grant  execute on function admin_activity_daily(int) to service_role;
