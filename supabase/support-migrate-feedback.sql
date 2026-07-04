-- =============================================================
-- 旧 feedback テーブル → support_tickets / support_messages 統合
--
-- 旧「一発送信フォーム(feedback)」に残っているデータを、現行の運営チャット
-- (support_tickets + support_messages) に取り込む。
-- 各 feedback 行 = 1チケット + 最初のユーザーメッセージ(=body)。
-- admin_note があれば運営返信メッセージとしても取り込む。
--
-- 前提: supabase/support.sql を先に実行済みであること。
-- 冪等性: (user_id, created_at) で既存チケットを重複判定するので再実行しても増えない。
-- 実行後、問題なければ末尾のコメントを外して旧 feedback テーブルを削除してよい。
-- =============================================================

-- feedback テーブルが無い環境では何もしない
do $$
begin
  if to_regclass('public.feedback') is null then
    raise notice 'feedback table not found; nothing to migrate';
    return;
  end if;

  -- 移行元を紐付けるための一時列
  alter table support_tickets add column if not exists _src_feedback_id bigint;

  -- 1) チケット本体
  insert into support_tickets
    (user_id, subject, category, status, diagnostics,
     last_message_at, last_sender_role, user_last_read_at, admin_last_read_at,
     resolved_by, resolved_at, created_at, _src_feedback_id)
  select
    f.user_id,
    coalesce(nullif(btrim(f.subject), ''), left(f.body, 60), '(件名なし)'),
    coalesce(nullif(f.category, ''), 'other'),
    coalesce(nullif(f.status, ''), 'open'),
    f.diagnostics,
    f.created_at,                 -- last_message_at
    'user',                       -- last_sender_role
    f.created_at,                 -- user_last_read_at
    null,                         -- admin_last_read_at
    f.resolved_by,
    f.resolved_at,
    f.created_at,
    f.id
  from feedback f
  where not exists (
    select 1 from support_tickets t
    where t.user_id = f.user_id and t.created_at = f.created_at
  );

  -- 2) 最初のユーザーメッセージ(body)。contact があれば末尾に追記
  insert into support_messages (ticket_id, sender_role, sender_id, body, created_at)
  select t.id, 'user', f.user_id,
    coalesce(f.body, '') ||
      case when nullif(btrim(f.contact), '') is not null
           then E'\n\n（返信先: ' || f.contact || '）' else '' end,
    f.created_at
  from support_tickets t
  join feedback f on f.id = t._src_feedback_id
  where not exists (select 1 from support_messages m where m.ticket_id = t.id);

  -- 3) admin_note があれば運営返信として取り込み、直近メッセージ情報を更新
  insert into support_messages (ticket_id, sender_role, sender_id, body, created_at)
  select t.id, 'admin', f.resolved_by, f.admin_note, coalesce(f.resolved_at, f.created_at)
  from support_tickets t
  join feedback f on f.id = t._src_feedback_id
  where nullif(btrim(f.admin_note), '') is not null
    and not exists (
      select 1 from support_messages m where m.ticket_id = t.id and m.sender_role = 'admin'
    );

  update support_tickets t
  set last_sender_role = 'admin',
      last_message_at = greatest(t.last_message_at, coalesce(f.resolved_at, f.created_at)),
      admin_last_read_at = coalesce(f.resolved_at, f.created_at)
  from feedback f
  where f.id = t._src_feedback_id
    and nullif(btrim(f.admin_note), '') is not null;

  -- 後片付け
  alter table support_tickets drop column if exists _src_feedback_id;
end $$;

-- 統合を確認したら、旧テーブルを削除して統合完了にできる:
-- drop table if exists feedback;
