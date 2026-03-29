-- Matrix scan rate-limit log
-- Tracks per-user OpenAI API calls for matrix card OCR to enforce rate limits
-- that survive serverless cold starts.

CREATE TABLE IF NOT EXISTS matrix_scan_log (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id    text    NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Fast lookup for rate-limit window queries
CREATE INDEX IF NOT EXISTS idx_matrix_scan_log_user_time
  ON matrix_scan_log (user_id, created_at DESC);

-- Auto-cleanup: delete rows older than 2 hours (generous margin over 1h window)
-- Run daily via pg_cron or Supabase scheduled function
-- SELECT cron.schedule('cleanup-matrix-scan-log', '0 * * * *',
--   $$DELETE FROM matrix_scan_log WHERE created_at < now() - interval '2 hours'$$
-- );

-- RLS: service_role only (API route uses getSupabaseAdmin)
ALTER TABLE matrix_scan_log ENABLE ROW LEVEL SECURITY;
-- No user-facing policies — only service_role can read/write
