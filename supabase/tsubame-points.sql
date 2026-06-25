-- =============================================================
-- ツバメポイント（インセンティブ）機能 — MVP
--   デイリーログイン / 連続ログイン(ストリーク) で貯まり、
--   レベル・累計・ランキングで「見える」ところまで。
--   交換(リワード)は将来拡張。台帳(reason)で拡張余地を確保。
--
-- Supabase Dashboard の SQL Editor で実行（冪等：再実行可）。
--
-- ユーザーキーは既存慣習どおり moodle_user_id bigint references profiles(moodle_id)。
-- 書き込みは全て service_role（/api/tsubame/* 経由）。anon の直アクセスはさせない。
-- 日付の境界は JST(Asia/Tokyo) 固定（サーバーは UTC のため SQL 内で変換する）。
-- =============================================================

-- 1. tsubame_points: ユーザーごとの残高・ストリーク・累計（1人1行）
create table if not exists tsubame_points (
  moodle_user_id  bigint primary key references profiles(moodle_id) on delete cascade,
  balance         int  not null default 0,   -- 現在残高（将来の交換で減る。MVPでは total_earned と一致）
  total_earned    int  not null default 0,   -- 累計獲得（レベル・ランキングの基準。減らない）
  current_streak  int  not null default 0,   -- 連続ログイン日数
  longest_streak  int  not null default 0,   -- 最長連続記録
  last_login_date date,                       -- 最後にデイリーを受け取った JST 日付
  updated_at      timestamptz not null default now()
);
-- ランキング用（累計降順）。同点は updated_at の早い者(先に到達)を上位に。
create index if not exists idx_tsubame_points_rank on tsubame_points(total_earned desc, updated_at asc);
alter table tsubame_points enable row level security;
-- anon ポリシーなし（自分の残高もランキングも /api/tsubame/* が service_role で返す）

-- 2. tsubame_ledger: 付与/消費の履歴（監査 + 将来の獲得手段拡張の受け皿）
--    reason: 'daily_login' | 'streak_milestone' | (将来) 'attendance' | 'post' | ...
--    amount: 付与は正、消費は負。
create table if not exists tsubame_ledger (
  id              bigint generated always as identity primary key,
  moodle_user_id  bigint not null references profiles(moodle_id) on delete cascade,
  amount          int  not null,
  reason          text not null,
  meta            jsonb,                       -- { "streak": 5 } など
  created_at      timestamptz not null default now()
);
create index if not exists idx_tsubame_ledger_user on tsubame_ledger(moodle_user_id, created_at desc);
alter table tsubame_ledger enable row level security;
-- anon ポリシーなし（個人データ。workout_logs / pocket と同方針）

-- 3. RPC: デイリーログイン付与（冪等・原子的）
--    1日1回のみ付与。同日2回目以降は claimed=false で現状値を返す。
--    並行POSTでも for update で二重付与しない。
--    付与額: 基本10 + ストリークボーナス(連続日-1)×2(上限+20)
--            + マイルストーン(7/30/100/365日)ボーナス。
create or replace function claim_tsubame_daily(p_uid bigint)
returns jsonb language plpgsql as $$
declare
  v_today      date := (now() at time zone 'Asia/Tokyo')::date;
  v_last       date;
  v_streak     int;
  v_longest    int;
  v_new_streak int;
  v_base       int := 10;
  v_bonus      int;          -- ストリークボーナス
  v_milestone  int := 0;     -- マイルストーンボーナス
  v_award      int;          -- 今回の合計付与
  v_balance    int;
  v_total      int;
begin
  -- 行を確保（無ければ作成）。profiles に存在しない uid は FK で弾かれる。
  insert into tsubame_points (moodle_user_id)
    values (p_uid)
    on conflict (moodle_user_id) do nothing;

  -- 排他ロックして現在値を取得
  select last_login_date, current_streak, longest_streak, balance, total_earned
    into v_last, v_streak, v_longest, v_balance, v_total
    from tsubame_points
    where moodle_user_id = p_uid
    for update;

  -- 既に今日受け取り済み → 付与せず現状を返す
  if v_last = v_today then
    return jsonb_build_object(
      'claimed', false,
      'awarded', 0,
      'streak', v_streak,
      'longest_streak', v_longest,
      'balance', v_balance,
      'total_earned', v_total,
      'today', v_today
    );
  end if;

  -- ストリーク更新（昨日からの継続なら +1、それ以外は 1 にリセット）
  if v_last = v_today - 1 then
    v_new_streak := v_streak + 1;
  else
    v_new_streak := 1;
  end if;

  -- ストリークボーナス: (連続日-1)×2、上限 +20
  v_bonus := least((v_new_streak - 1) * 2, 20);

  -- マイルストーンボーナス
  if    v_new_streak = 7   then v_milestone := 50;
  elsif v_new_streak = 30  then v_milestone := 200;
  elsif v_new_streak = 100 then v_milestone := 1000;
  elsif v_new_streak = 365 then v_milestone := 5000;
  end if;

  v_award := v_base + v_bonus + v_milestone;

  update tsubame_points set
    balance         = balance + v_award,
    total_earned    = total_earned + v_award,
    current_streak  = v_new_streak,
    longest_streak  = greatest(longest_streak, v_new_streak),
    last_login_date = v_today,
    updated_at      = now()
  where moodle_user_id = p_uid
  returning balance, total_earned into v_balance, v_total;

  -- 台帳: デイリー本体
  insert into tsubame_ledger (moodle_user_id, amount, reason, meta)
    values (p_uid, v_base + v_bonus, 'daily_login',
            jsonb_build_object('streak', v_new_streak, 'base', v_base, 'streak_bonus', v_bonus));

  -- 台帳: マイルストーン（あれば別行）
  if v_milestone > 0 then
    insert into tsubame_ledger (moodle_user_id, amount, reason, meta)
      values (p_uid, v_milestone, 'streak_milestone',
              jsonb_build_object('streak', v_new_streak));
  end if;

  return jsonb_build_object(
    'claimed', true,
    'awarded', v_award,
    'daily', v_base + v_bonus,
    'milestone_bonus', v_milestone,
    'streak', v_new_streak,
    'longest_streak', greatest(v_longest, v_new_streak),
    'balance', v_balance,
    'total_earned', v_total,
    'today', v_today
  );
end;
$$;

-- =============================================================
-- 4. tsubame_awards: 「対象ごと1回きり」の付与を冪等にするための重複防止台帳。
--    出席など解除→再登録で稼げてしまう獲得手段は、ここに ref_key を一意登録し、
--    既に登録済みなら加点しない（解除しても返還しない＝再付与もしない）。
--    reason: 'attendance' | (将来) 'review_posted' | 'task_complete' ...
--    ref_key 例: 出席 = 'sci:<course_key>:<session_key>'
-- =============================================================
create table if not exists tsubame_awards (
  moodle_user_id  bigint not null references profiles(moodle_id) on delete cascade,
  reason          text not null,
  ref_key         text not null,
  amount          int  not null,
  created_at      timestamptz not null default now(),
  primary key (moodle_user_id, reason, ref_key)   -- ← 冪等の肝（同一対象は二度入らない）
);
-- 日次上限チェック用（JST日付での件数カウント）
create index if not exists idx_tsubame_awards_daily on tsubame_awards(moodle_user_id, reason, created_at);
alter table tsubame_awards enable row level security;
-- anon ポリシーなし（付与は service_role の RPC 経由のみ）

-- 5. RPC: 出席チェックインのポイント付与（冪等・1日上限つき）
--    p_ref      = 'sci:<course_key>:<session_key>'（授業回で一意）
--    p_amount   = 付与額（既定 5）
--    p_daily_cap= 当日(JST)の attendance 付与回数の上限（既定 5 ＝ +25/日まで）
--    返り値: { awarded, reason?, balance?, total_earned? }
--      awarded=0 かつ reason='already'    → 既に付与済み（再チェックイン）
--      awarded=0 かつ reason='daily_cap'  → 当日上限に到達
create or replace function award_attendance(
  p_uid bigint, p_ref text, p_amount int default 5, p_daily_cap int default 5
) returns jsonb language plpgsql as $$
declare
  v_inserted   int;
  v_today      date := (now() at time zone 'Asia/Tokyo')::date;
  v_today_cnt  int;
  v_balance    int;
  v_total      int;
begin
  -- 当日(JST)の出席付与回数が上限に達していれば付与しない
  select count(*) into v_today_cnt
    from tsubame_awards
    where moodle_user_id = p_uid
      and reason = 'attendance'
      and (created_at at time zone 'Asia/Tokyo')::date = v_today;
  if v_today_cnt >= p_daily_cap then
    return jsonb_build_object('awarded', 0, 'reason', 'daily_cap');
  end if;

  -- 重複防止: この授業回が未付与のときだけ行が入る
  insert into tsubame_awards (moodle_user_id, reason, ref_key, amount)
    values (p_uid, 'attendance', p_ref, p_amount)
    on conflict (moodle_user_id, reason, ref_key) do nothing;
  get diagnostics v_inserted = row_count;
  if v_inserted = 0 then
    return jsonb_build_object('awarded', 0, 'reason', 'already');
  end if;

  -- 残高・累計を加算（行が無ければ作成）
  insert into tsubame_points (moodle_user_id) values (p_uid)
    on conflict (moodle_user_id) do nothing;
  update tsubame_points set
    balance      = balance + p_amount,
    total_earned = total_earned + p_amount,
    updated_at   = now()
  where moodle_user_id = p_uid
  returning balance, total_earned into v_balance, v_total;

  -- 台帳に履歴を残す
  insert into tsubame_ledger (moodle_user_id, amount, reason, meta)
    values (p_uid, p_amount, 'attendance', jsonb_build_object('ref', p_ref));

  return jsonb_build_object(
    'awarded', p_amount, 'balance', v_balance, 'total_earned', v_total
  );
end;
$$;

-- 6. RPC: フレンド成立ポイント（双方に冪等付与・1ペア1回・上限なし）
--    p_amount = 双方それぞれに付与する額（既定 10）
--    ref_key  = 'friend:<小さいID>_<大きいID>'（ペアで一意。解除→再追加でも再付与しない）
--    各ユーザーが独立した tsubame_awards 行を持つので、片側だけ未付与なら片側だけ入る。
--    返り値: { awarded_total }（今回実際に加算した合計。0=両者とも付与済み）
create or replace function award_friend(p_a bigint, p_b bigint, p_amount int default 10)
returns jsonb language plpgsql as $$
declare
  v_ref    text := 'friend:' || least(p_a, p_b) || '_' || greatest(p_a, p_b);
  v_total  int  := 0;
  v_uid    bigint;
  v_ins    int;
begin
  if p_a is null or p_b is null or p_a = p_b then
    return jsonb_build_object('awarded_total', 0);
  end if;

  foreach v_uid in array array[p_a, p_b] loop
    insert into tsubame_awards (moodle_user_id, reason, ref_key, amount)
      values (v_uid, 'friend_added', v_ref, p_amount)
      on conflict (moodle_user_id, reason, ref_key) do nothing;
    get diagnostics v_ins = row_count;
    if v_ins > 0 then
      insert into tsubame_points (moodle_user_id) values (v_uid)
        on conflict (moodle_user_id) do nothing;
      update tsubame_points set
        balance      = balance + p_amount,
        total_earned = total_earned + p_amount,
        updated_at   = now()
      where moodle_user_id = v_uid;
      insert into tsubame_ledger (moodle_user_id, amount, reason, meta)
        values (v_uid, p_amount, 'friend_added', jsonb_build_object('ref', v_ref));
      v_total := v_total + p_amount;
    end if;
  end loop;

  return jsonb_build_object('awarded_total', v_total);
end;
$$;

-- 7. バックフィル: 既存の accepted フレンド全員に遡って +10 を配布（冪等）。
--    award_friend が tsubame_awards で重複排除するため、再実行しても二重付与されない。
--    今後の自動付与（/api/friends の承認時）とも ref_key を共有するので衝突しない。
do $$
declare r record;
begin
  for r in select requester_id, addressee_id from friendships where status = 'accepted' loop
    perform award_friend(r.requester_id, r.addressee_id, 10);
  end loop;
end $$;
