-- Personal calendar events (My Calendar) — server-persisted, synced across devices.
-- Only user-created events live here; RSVP-derived calendar entries are regenerated
-- client-side from the RSVP state (see /api/events), so they are NOT stored here.
create table if not exists user_events (
  id          bigint generated always as identity primary key,
  user_id     bigint not null references profiles(moodle_id) on delete cascade,
  title       text not null,
  color       text,
  memo        text,
  start_at    timestamptz not null,
  end_at      timestamptz,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

create index if not exists idx_user_events_user on user_events(user_id);

alter table user_events enable row level security;
-- No anon policies: all access goes through the service_role API (/api/my-events).
