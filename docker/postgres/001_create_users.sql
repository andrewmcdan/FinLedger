-- Users table for authentication and admin workflows.
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
  last_login_at TIMESTAMPTZ,
  suspension_start_at TIMESTAMPTZ,
  suspension_end_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
