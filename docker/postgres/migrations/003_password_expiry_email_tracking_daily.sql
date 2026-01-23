ALTER TABLE password_expiry_email_tracking
  ADD COLUMN IF NOT EXISTS email_sent_date DATE NOT NULL DEFAULT CURRENT_DATE;

CREATE UNIQUE INDEX IF NOT EXISTS ux_password_expiry_email_tracking_daily
  ON password_expiry_email_tracking (user_id, password_expires_at, email_sent_date);
