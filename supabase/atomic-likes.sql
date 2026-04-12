-- =============================================================
-- アトミックな Like/React 操作用 RPC 関数 (2026-04-12 ペネトレ対応)
-- Supabase Dashboard の SQL Editor で実行
--
-- 問題:
--   Like/Vote/React の Read-Modify-Write が非原子的で、
--   並行リクエストによるデータ消失が発生しうる。
--
-- 解決:
--   PostgreSQL 関数で配列操作をアトミックに実行。
-- =============================================================

-- 1. posts.likes のトグル (Like/Unlike)
create or replace function toggle_post_like(p_post_id bigint, p_user_id bigint)
returns jsonb language plpgsql as $$
declare
  v_likes jsonb;
  v_idx int;
begin
  select coalesce(likes, '[]'::jsonb) into v_likes
    from posts where id = p_post_id for update;
  if v_likes is null then
    raise exception 'Post not found';
  end if;

  -- Check if user already liked
  select i - 1 into v_idx
    from jsonb_array_elements(v_likes) with ordinality as t(val, i)
    where val = to_jsonb(p_user_id);

  if v_idx is not null then
    v_likes := v_likes - v_idx;
  else
    v_likes := v_likes || to_jsonb(p_user_id);
  end if;

  update posts set likes = v_likes where id = p_post_id;
  return v_likes;
end;
$$;

-- 2. posts.reactions のトグル
create or replace function toggle_post_reaction(p_post_id bigint, p_user_id bigint, p_emoji text)
returns jsonb language plpgsql as $$
declare
  v_reactions jsonb;
  v_arr jsonb;
  v_idx int;
begin
  select coalesce(reactions, '{}'::jsonb) into v_reactions
    from posts where id = p_post_id for update;
  if v_reactions is null then
    raise exception 'Post not found';
  end if;

  v_arr := coalesce(v_reactions -> p_emoji, '[]'::jsonb);

  select i - 1 into v_idx
    from jsonb_array_elements(v_arr) with ordinality as t(val, i)
    where val = to_jsonb(p_user_id);

  if v_idx is not null then
    v_arr := v_arr - v_idx;
    if jsonb_array_length(v_arr) = 0 then
      v_reactions := v_reactions - p_emoji;
    else
      v_reactions := jsonb_set(v_reactions, array[p_emoji], v_arr);
    end if;
  else
    v_arr := v_arr || to_jsonb(p_user_id);
    v_reactions := jsonb_set(v_reactions, array[p_emoji], v_arr);
  end if;

  update posts set reactions = v_reactions where id = p_post_id;
  return v_reactions;
end;
$$;

-- 3. freshman_posts.likes のトグル
create or replace function toggle_freshman_like(p_post_id bigint, p_user_id bigint)
returns jsonb language plpgsql as $$
declare
  v_likes jsonb;
  v_idx int;
begin
  select coalesce(likes, '[]'::jsonb) into v_likes
    from freshman_posts where id = p_post_id for update;
  if v_likes is null then
    raise exception 'Post not found';
  end if;

  select i - 1 into v_idx
    from jsonb_array_elements(v_likes) with ordinality as t(val, i)
    where val = to_jsonb(p_user_id);

  if v_idx is not null then
    v_likes := v_likes - v_idx;
  else
    v_likes := v_likes || to_jsonb(p_user_id);
  end if;

  update freshman_posts set likes = v_likes where id = p_post_id;
  return v_likes;
end;
$$;
