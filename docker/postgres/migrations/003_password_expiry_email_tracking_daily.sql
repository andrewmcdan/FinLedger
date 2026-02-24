-- Add a date bucket for reminder sends so daily uniqueness can be enforced.
ALTER TABLE password_expiry_email_tracking
  ADD COLUMN IF NOT EXISTS email_sent_date DATE NOT NULL DEFAULT CURRENT_DATE;

-- Prevent duplicate reminder sends for the same user/expiry/day combination.
CREATE UNIQUE INDEX IF NOT EXISTS ux_password_expiry_email_tracking_daily
  ON password_expiry_email_tracking (user_id, password_expires_at, email_sent_date);
