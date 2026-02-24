-- Add explicit marker for temporary passwords requiring change on first login.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS temp_password BOOLEAN NOT NULL DEFAULT FALSE;
