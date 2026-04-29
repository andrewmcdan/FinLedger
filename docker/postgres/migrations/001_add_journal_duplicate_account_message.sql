INSERT INTO app_messages (code, message_text, category)
VALUES ('ERR_JOURNAL_DUPLICATE_ACCOUNT', 'An account cannot be used more than once in the same transaction.', 'error')
ON CONFLICT (code) DO UPDATE
SET message_text = EXCLUDED.message_text,
    category = EXCLUDED.category,
    is_active = TRUE,
    updated_at = now();