-- Taki Plaza の予約状況の保存先（週ごと）と、月 1 回の読み取りジョブ。
--
-- 以前はアプリで開くたびにサーバーのヘッドレスブラウザで教務Webの施設予約ページを読み取っていた（遅い）。
-- 今は /api/cron/facility-reservations がまとめて読み取り、この表に保存する。アプリはこの表を読むだけ。
-- 読み取りには Vercel の環境変数 FACILITY_SCRAPE_LOGIN_ID のアカウント（ポータルの資格情報を保存済み）を使う。

create table if not exists facility_reservation_weeks (
  building    text        not null,                -- 教務Webの建物番号（1 = 大岡山 Taki Plaza）
  week_start  date        not null,                -- 週の月曜
  data        jsonb       not null,                -- { building, weekStart, weekEnd, days, spaces }
  fetched_at  timestamptz not null default now(),  -- 読み取った時刻（アプリに「◯日時点」と出す）
  primary key (building, week_start)
);

-- service role（API ルート）だけが読み書きする。anon / authenticated からは見えない。
alter table facility_reservation_weeks enable row level security;
alter table facility_reservation_weeks force row level security;
revoke all on facility_reservation_weeks from anon, authenticated;

-- ── 月 1 回の読み取り（pg_cron + pg_net。supabase/deadline-cron.sql と同じやり方） ──
-- <DOMAIN> と <CRON_SECRET> を置き換えてから実行する。
-- 毎月 1 日 12:00（日本時間）= 03:00 UTC。読み取りは 1〜2 分かかるので timeout を長くする。
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'facility-reservations',
  '0 3 1 * *',
  $$
  select net.http_get(
    url     := 'https://<DOMAIN>/api/cron/facility-reservations?weeks=6',
    headers := jsonb_build_object('Authorization', 'Bearer <CRON_SECRET>'),
    timeout_milliseconds := 300000
  );
  $$
);

-- 今すぐ 1 回読み取る（初回やデータが古いとき）:
--   select net.http_get(url := 'https://<DOMAIN>/api/cron/facility-reservations?weeks=6',
--                       headers := jsonb_build_object('Authorization', 'Bearer <CRON_SECRET>'),
--                       timeout_milliseconds := 300000);
-- 結果:            select * from net._http_response order by created desc limit 3;
-- 止める:          select cron.unschedule('facility-reservations');
