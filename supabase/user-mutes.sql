-- User mute (相手に通知されない非表示機能)
create table if not exists user_mutes (
  id          bigint generated always as identity primary key,
  muter_id    bigint not null references profiles(moodle_id) on delete cascade,
  muted_id    bigint not null references profiles(moodle_id) on delete cascade,
  created_at  timestamptz default now(),
  unique(muter_id, muted_id),
  check(muter_id != muted_id)
);

create index if not exists idx_user_mutes_muter on user_mutes(muter_id);
alter table user_mutes enable row level security;
