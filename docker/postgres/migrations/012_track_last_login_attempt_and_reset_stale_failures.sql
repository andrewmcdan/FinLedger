-- Add a timestamp field to track the most recent login attempt time.
-- This supports automatic failed-attempt reset logic after a quiet period.
ALTER TABLE users
    ADD COLUMN IF NOT EXISTS last_login_attempt_at TIMESTAMPTZ;

-- Optimize the scheduled reset query that only targets active users with failures.
CREATE INDEX IF NOT EXISTS idx_users_last_login_attempt_active_failed
    ON users (last_login_attempt_at)
    WHERE status = 'active' AND failed_login_attempts > 0;
