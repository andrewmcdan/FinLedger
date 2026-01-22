-- Example migration: add a temp_password flag to users.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS temp_password BOOLEAN NOT NULL DEFAULT FALSE;
