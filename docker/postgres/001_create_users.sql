-- Core identity and profile table used by authentication and user management.
-- This table stores login state, lifecycle state (pending/active/suspended/etc.),
-- password metadata, and password-reset/security-question data.
CREATE TABLE IF NOT EXISTS users (
  id BIGSERIAL PRIMARY KEY,
  username TEXT UNIQUE,
  email TEXT NOT NULL UNIQUE,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  address TEXT,
  date_of_birth DATE,
  role TEXT NOT NULL CHECK (role IN ('administrator', 'manager', 'accountant')),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'active', 'suspended', 'deactivated', 'rejected')),
  profile_image_url TEXT,
  password_hash TEXT,
  password_changed_at TIMESTAMPTZ,
  password_expires_at TIMESTAMPTZ,
  failed_login_attempts INTEGER NOT NULL DEFAULT 0 CHECK (failed_login_attempts >= 0),
  last_login_attempt_at TIMESTAMPTZ,
  last_login_at TIMESTAMPTZ,
  suspension_start_at TIMESTAMPTZ,
  suspension_end_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  security_question_1 TEXT,
  security_answer_hash_1 TEXT,
  security_question_2 TEXT,
  security_answer_hash_2 TEXT,
  security_question_3 TEXT,
  security_answer_hash_3 TEXT,
  reset_token TEXT,
  reset_token_expires_at TIMESTAMPTZ
);

-- Historical password hashes for password-reuse prevention checks.
-- Rows are cascade-deleted when a user is removed.
CREATE TABLE IF NOT EXISTS password_history (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  password_hash TEXT NOT NULL,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
