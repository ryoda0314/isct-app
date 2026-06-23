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
