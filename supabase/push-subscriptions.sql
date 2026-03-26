-- Push notification subscriptions (Web Push)
create table if not exists push_subscriptions (
  id          bigint generated always as identity primary key,
  moodle_id   bigint not null references profiles(moodle_id) on delete cascade,
  endpoint    text not null unique,
  p256dh      text not null,
  auth        text not null,
  created_at  timestamptz default now()
);

create index if not exists idx_push_subs_user on push_subscriptions(moodle_id);
alter table push_subscriptions enable row level security;
