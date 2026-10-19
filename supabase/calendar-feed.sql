-- iCal subscription feed (Google Calendar / Apple Calendar / Outlook "subscribe by URL").
--
-- One row per user who turned the feed on. `token` is the secret in the public
-- feed URL /api/ical/<token>.ics — anyone holding it can read the feed, so it is
-- random (192 bits) and can be rotated or the row deleted from the app.
--
-- The LMS blocks server IPs, so the server cannot build classes / assignment
-- deadlines itself. The client computes them and uploads a snapshot into `items`
-- (PUT /api/calendar-feed) only when its content hash changes. Personal events are
-- NOT in the snapshot: the feed reads them live from user_events.
create table if not exists calendar_feeds (
  user_id     bigint primary key references profiles(moodle_id) on delete cascade,
  token       text not null unique,
  items       jsonb not null default '[]'::jsonb,
  items_hash  text,
  synced_at   timestamptz,
  created_at  timestamptz default now()
);

alter table calendar_feeds enable row level security;
-- No anon policies: all access goes through the service_role API
-- (/api/calendar-feed for the owner, /api/ical/<token> for calendar apps).
