-- Track failed password-reset verification attempts for lockout enforcement.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS reset_failed_attempts INTEGER NOT NULL DEFAULT 0 CHECK (reset_failed_attempts >= 0);

-- Register the API/UI message used when reset lockout is triggered.
-- Upsert keeps message text current across repeated migration runs.
INSERT INTO app_messages (code, message_text, category)
VALUES (
  'ERR_PASSWORD_RESET_LOCKED_DUE_TO_ATTEMPTS',
  'Password reset is locked after multiple failed verification attempts. Please contact an administrator.',
  'error'
)
ON CONFLICT (code) DO UPDATE
SET
  message_text = EXCLUDED.message_text,
  category = EXCLUDED.category,
  is_active = TRUE,
  updated_at = now();
