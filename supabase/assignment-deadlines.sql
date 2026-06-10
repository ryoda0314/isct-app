-- Server-side cache of upcoming assignment deadlines.
--
-- The LMS (Moodle) blocks server-side IPs with 403, so the server can never poll
-- assignments itself. Instead the client (which CAN reach Moodle) uploads its
-- upcoming deadlines here on every app load via /api/data/all-meta. A pg_cron job
-- then reads THIS table — never the LMS — and fires deadline reminders even while
-- the app is closed (see deadline-cron.sql + /api/cron/deadline-reminders).
--
-- Notification dedup is handled by notifications.dedup_key, NOT by this table; a
-- row may legitimately fire both the "24h" and "3h" reminders over its lifetime.

create table if not exists assignment_deadlines (
  moodle_user_id  bigint not null references profiles(moodle_id) on delete cascade,
  assignment_id   text not null,           -- campus-sns assignment id, e.g. "ma_12345"
  title           text not null,
  course_id       text,
  due_at          timestamptz not null,
  updated_at      timestamptz default now(),
  primary key (moodle_user_id, assignment_id)
);

-- The cron scans by upcoming due date across all users.
create index if not exists idx_asgn_deadlines_due on assignment_deadlines(due_at);

alter table assignment_deadlines enable row level security;
-- No policies: only the service_role (server) reads/writes this table. anon has no access.
