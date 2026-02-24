-- Add a generated UUID path for each user's icon asset.
-- IF NOT EXISTS keeps the migration rerunnable.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS user_icon_path UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE;
