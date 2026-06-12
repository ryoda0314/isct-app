-- Native push device tokens (APNs / iOS).
-- Web Push lives in push_subscriptions; native tokens differ in shape so they
-- get their own table. service_role-only access (no client/anon RLS policies).
create table if not exists device_push_tokens (
  id         bigint generated always as identity primary key,
  moodle_id  bigint not null references profiles(moodle_id) on delete cascade,
  token      text not null unique,
  platform   text not null default 'ios',
  updated_at timestamptz default now()
);

create index if not exists idx_device_push_tokens_user on device_push_tokens(moodle_id);
alter table device_push_tokens enable row level security;
