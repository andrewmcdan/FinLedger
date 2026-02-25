-- Tracks password-expiration reminder emails by user and expiry timestamp.
-- Used to avoid duplicate notifications and support reminder cadence logic.
CREATE TABLE IF NOT EXISTS password_expiry_email_tracking (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  email_sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  email_sent_date DATE NOT NULL DEFAULT CURRENT_DATE,
  password_expires_at TIMESTAMPTZ NOT NULL
);

-- Prevent duplicate reminder sends for the same user/expiry/day combination.
CREATE UNIQUE INDEX IF NOT EXISTS ux_password_expiry_email_tracking_daily
  ON password_expiry_email_tracking (user_id, password_expires_at, email_sent_date);
