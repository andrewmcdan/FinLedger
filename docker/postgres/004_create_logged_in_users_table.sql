-- Session table tracking active login tokens and their expected expiry window.
-- logout_at is initialized to one hour after login as a default session horizon.
CREATE TABLE If NOT EXISTS logged_in_users (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token TEXT NOT NULL,
  login_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  logout_at TIMESTAMPTZ DEFAULT now() + INTERVAL '1 hour'
);
