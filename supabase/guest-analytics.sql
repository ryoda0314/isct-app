-- =============================================================
-- Guest Analytics: ゲストユーザーのアクセス追跡
-- Supabase Dashboard の SQL Editor で実行
-- =============================================================

-- ── ゲストセッションテーブル ──
create table if not exists guest_sessions (
  id              bigint generated always as identity primary key,
  session_id      uuid not null,                      -- ブラウザ側で生成する一意ID
  mode            text not null,                      -- freshman, navi, reg
  user_agent      text,
  referrer        text,
  page_views      int default 1,                      -- 同セッション内のページビュー数
  converted       boolean default false,               -- ログイン/新規登録に遷移したか
  last_active_at  timestamptz default now(),
  created_at      timestamptz default now()
);

create index if not exists idx_gs_mode       on guest_sessions(mode, created_at desc);
create index if not exists idx_gs_created    on guest_sessions(created_at desc);
create index if not exists idx_gs_session    on guest_sessions(session_id);

alter table guest_sessions enable row level security;

-- anon は INSERT のみ（自分のセッション記録用）
create policy "anon_insert_guest_sessions"
  on guest_sessions for insert to anon
  with check (true);

-- anon は自分の session_id の UPDATE のみ（page_views / converted 更新用）
create policy "anon_update_own_guest_session"
  on guest_sessions for update to anon
  using (true)
  with check (true);

-- service_role (admin API) は全操作可能（デフォルトで RLS バイパス）
