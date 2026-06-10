-- Schedule the server-side deadline reminder cron.
--
-- Runs every 30 min and calls /api/cron/deadline-reminders, which reads the
-- assignment_deadlines cache (NOT the LMS — it 403s server-side) and fires "24h"
-- / "3h" reminders so they arrive even while the app is closed.
--
-- ── Setup (run ONCE in the Supabase SQL editor) ──────────────────────────────
-- 1. Enable extensions (Supabase: Database → Extensions, or run these):
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- 2. Replace the two placeholders below, then run the schedule block:
--      <DOMAIN>       e.g. app.example.com  (no scheme, no trailing slash)
--      <CRON_SECRET>  same value set as the CRON_SECRET env var on Vercel
--
-- 30-min cadence so a "3h" reminder is never missed by more than ~30 min.
-- Re-runs are harmless: notifyDeadline dedups on notifications.dedup_key.

select cron.schedule(
  'deadline-reminders',
  '*/30 * * * *',
  $$
  select net.http_get(
    url     := 'https://<DOMAIN>/api/cron/deadline-reminders',
    headers := jsonb_build_object('Authorization', 'Bearer <CRON_SECRET>')
  );
  $$
);

-- ── Ops ──────────────────────────────────────────────────────────────────────
-- List jobs:        select * from cron.job;
-- Recent runs:      select * from cron.job_run_details order by start_time desc limit 10;
-- HTTP responses:   select * from net._http_response order by created desc limit 10;
-- Unschedule:       select cron.unschedule('deadline-reminders');
