-- Example migration: add a user icon path to users.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS user_icon_path TEXT;
