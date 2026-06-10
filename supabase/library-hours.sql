-- Server-side cache of the 附属図書館 opening calendar (大岡山 / すずかけ台).
--
-- The hours come from the public official calendar
-- (https://www.libra.titech.ac.jp/calendar/print) and are the SAME for every
-- user, so we scrape once and keep the parsed result here instead of hitting
-- the library site on every request. /api/data/library-hours reads this row,
-- and only re-scrapes + upserts when the row is missing or older than the TTL
-- (see lib/api/library-hours.js). A short in-memory cache sits in front of this
-- table so warm serverless instances avoid even the DB read.
--
-- Single-row table (id is pinned to 1). `data` holds the whole parsed calendar:
--   { "ookayama": [ {date,dow,open,close,closed}, ... ],
--     "suzukakedai": [ ... ] }

create table if not exists library_hours_cache (
  id          smallint primary key default 1,
  data        jsonb not null,
  fetched_at  timestamptz not null default now(),
  constraint library_hours_cache_singleton check (id = 1)
);

alter table library_hours_cache enable row level security;
-- No policies: only the service_role (server) reads/writes. anon has no access.

-- ── Optional: proactive daily refresh via pg_cron ────────────────────────────
-- Lazy refresh-on-read already keeps the row fresh; this just avoids the first
-- post-expiry user paying the ~1–2s scrape latency. Run ONCE in the SQL editor
-- after replacing <DOMAIN> (no scheme/trailing slash). `force=1` bypasses the
-- cache, re-scrapes, and upserts this table.
--
-- create extension if not exists pg_cron;
-- create extension if not exists pg_net;
-- select cron.schedule(
--   'library-hours-refresh',
--   '0 5 * * *',                    -- 05:00 JST-ish daily
--   $$ select net.http_get(url := 'https://<DOMAIN>/api/data/library-hours?force=1'); $$
-- );
--
-- Ops:  select * from cron.job;
--       select cron.unschedule('library-hours-refresh');
