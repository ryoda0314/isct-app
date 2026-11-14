-- キャリアの掲載の週 1 回の見直し（/api/cron/career）。先に supabase/career.sql を実行しておくこと。
-- <CRON_SECRET> を Vercel の CRON_SECRET と同じ値に置き換えてから実行する（deadline-cron.sql と同じ値）。

-- ── 週 1 回の見直し（pg_cron + pg_net。supabase/deadline-cron.sql と同じやり方） ──
-- 締切・開催が終わった掲載を終了にし、応募先のリンクを確かめ、古い終了分と処理済みの情報提供を消す。
-- 毎週月曜 3:00（日本時間）= 日曜 18:00 UTC。
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'career-weekly',
  '0 18 * * 0',
  $$
  select net.http_get(
    url     := 'https://sciencetokyo.app/api/cron/career',
    headers := jsonb_build_object('Authorization', 'Bearer <CRON_SECRET>'),
    timeout_milliseconds := 120000
  );
  $$
);

-- 今すぐ 1 回:  select net.http_get(url := 'https://sciencetokyo.app/api/cron/career', headers := jsonb_build_object('Authorization', 'Bearer <CRON_SECRET>'), timeout_milliseconds := 120000);
-- 結果:        select * from net._http_response order by created desc limit 3;
-- 止める:      select cron.unschedule('career-weekly');
