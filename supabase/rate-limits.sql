-- Shared rate-limit counters (survive serverless cold starts / multiple instances)
-- Used by lib/rate-limit.js for login / credential-validation brute-force protection.
-- Run in Supabase Dashboard → SQL Editor.

CREATE TABLE IF NOT EXISTS rate_limits (
  key          text PRIMARY KEY,
  count        integer     NOT NULL DEFAULT 0,
  window_start timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rate_limits_window_start ON rate_limits (window_start);

ALTER TABLE rate_limits ENABLE ROW LEVEL SECURITY;
-- No policies: only service_role (getSupabaseAdmin) can read/write.

-- Atomically add p_increment to the counter for p_key and return the new count.
-- If the stored window is older than p_window_seconds, the window restarts.
-- p_increment = 0 reads the current count (0 when the window has expired).
CREATE OR REPLACE FUNCTION rate_limit_hit(p_key text, p_window_seconds integer, p_increment integer DEFAULT 1)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  IF p_increment = 0 THEN
    SELECT CASE WHEN window_start > now() - make_interval(secs => p_window_seconds) THEN count ELSE 0 END
      INTO v_count
      FROM rate_limits WHERE key = p_key;
    RETURN COALESCE(v_count, 0);
  END IF;

  INSERT INTO rate_limits AS r (key, count, window_start)
  VALUES (p_key, p_increment, now())
  ON CONFLICT (key) DO UPDATE SET
    count = CASE WHEN r.window_start > now() - make_interval(secs => p_window_seconds)
                 THEN r.count + p_increment ELSE p_increment END,
    window_start = CASE WHEN r.window_start > now() - make_interval(secs => p_window_seconds)
                        THEN r.window_start ELSE now() END
  RETURNING count INTO v_count;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION rate_limit_hit(text, integer, integer) FROM PUBLIC, anon, authenticated;

-- Optional cleanup (rows are also reset lazily when their window expires):
-- SELECT cron.schedule('cleanup-rate-limits', '0 * * * *',
--   $$DELETE FROM rate_limits WHERE window_start < now() - interval '1 day'$$);
