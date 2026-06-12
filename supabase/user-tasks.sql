-- My Tasks (個人タスク) — server-persisted, synced across devices.
-- Replaces the previous client-only useState store (lost on reload).
create table if not exists user_tasks (
  id          bigint generated always as identity primary key,
  user_id     bigint not null references profiles(moodle_id) on delete cascade,
  title       text not null,
  done        boolean not null default false,
  due_at      timestamptz,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

-- Listing is always scoped to a user; done is used for filtering/notification gating.
create index if not exists idx_user_tasks_user on user_tasks(user_id);
-- Cron scans upcoming, not-done deadlines across all users.
create index if not exists idx_user_tasks_due on user_tasks(due_at) where done = false;

alter table user_tasks enable row level security;
-- No anon policies: all access goes through the service_role API (/api/tasks).
