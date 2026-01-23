CREATE TABLE IF NOT EXISTS password_expiry_email_tracking (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  email_sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  email_sent_date DATE NOT NULL DEFAULT CURRENT_DATE,
  password_expires_at TIMESTAMPTZ NOT NULL
);
