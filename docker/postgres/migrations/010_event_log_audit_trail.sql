-- Expand audit_logs with richer audit-trail metadata fields.
-- These columns support structured before/after images and actor attribution.
ALTER TABLE audit_logs
  ADD COLUMN IF NOT EXISTS action TEXT,
  ADD COLUMN IF NOT EXISTS changed_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS changed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS b_image JSONB,
  ADD COLUMN IF NOT EXISTS a_image JSONB;

-- Backward-compatibility block:
-- If changes is still text/varchar on an existing DB, convert it to JSONB.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'audit_logs'
      AND column_name = 'changes'
      AND data_type IN ('text', 'character varying')
  ) THEN
    ALTER TABLE audit_logs
      ALTER COLUMN changes TYPE JSONB
      USING CASE WHEN changes IS NULL THEN NULL ELSE to_jsonb(changes) END;
  END IF;
END;
$$;

-- Backward-compatibility block:
-- If metadata is still text/varchar on an existing DB, convert it to JSONB.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'audit_logs'
      AND column_name = 'metadata'
      AND data_type IN ('text', 'character varying')
  ) THEN
    ALTER TABLE audit_logs
      ALTER COLUMN metadata TYPE JSONB
      USING CASE WHEN metadata IS NULL THEN NULL ELSE to_jsonb(metadata) END;
  END IF;
END;
$$;

-- Backfill new columns for historical rows when values are missing.
UPDATE audit_logs
SET
  action = COALESCE(action, event_type),
  changed_by = COALESCE(changed_by, user_id),
  changed_at = COALESCE(changed_at, created_at, now())
WHERE action IS NULL
   OR changed_by IS NULL
   OR changed_at IS NULL;

-- Indexes for actor/action/timeline lookups.
CREATE INDEX IF NOT EXISTS idx_audit_logs_changed_by ON audit_logs(changed_by);
CREATE INDEX IF NOT EXISTS idx_audit_logs_changed_at ON audit_logs(changed_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity_changed_at ON audit_logs(entity_type, entity_id, changed_at DESC);

-- Remove sensitive keys from stored row snapshots before writing audit records.
CREATE OR REPLACE FUNCTION audit_sanitize_row(row_data JSONB)
RETURNS JSONB
LANGUAGE sql
IMMUTABLE
AS $$
    SELECT CASE
      WHEN row_data IS NULL THEN NULL
      ELSE row_data - ARRAY[
        'password_hash',
        'security_answer_hash_1',
        'security_answer_hash_2',
        'security_answer_hash_3',
        'reset_token',
        'token'
      ]
    END;
$$;

-- Generic event-log trigger function reused across many tables.
-- Captures operation type, actor, entity id, and sanitized before/after images.
CREATE OR REPLACE FUNCTION trg_write_event_log()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_old_json JSONB;
  v_new_json JSONB;
  v_b_image JSONB;
  v_a_image JSONB;
  v_changed_by BIGINT;
  v_entity_id BIGINT;
  v_action TEXT;
BEGIN
  -- Convert OLD/NEW records into JSONB based on operation type.
  IF TG_OP = 'INSERT' THEN
    v_old_json := NULL;
    v_new_json := to_jsonb(NEW);
  ELSIF TG_OP = 'UPDATE' THEN
    v_old_json := to_jsonb(OLD);
    v_new_json := to_jsonb(NEW);
  ELSIF TG_OP = 'DELETE' THEN
    v_old_json := to_jsonb(OLD);
    v_new_json := NULL;
  ELSE
    RETURN NULL;
  END IF;

  -- Sanitize snapshots and normalize action label (insert/update/delete).
  v_b_image := audit_sanitize_row(v_old_json);
  v_a_image := audit_sanitize_row(v_new_json);
  v_action := lower(TG_OP);

  -- Primary actor resolution path: transaction-scoped app.user_id.
  v_changed_by := NULLIF(current_setting('app.user_id', true), '')::BIGINT;

  -- Fallback actor resolution path:
  -- inspect common user-id style fields from NEW first, then OLD.
  -- Regex guards avoid cast failures when values are non-numeric.
  IF v_changed_by IS NULL THEN
    v_changed_by := COALESCE(
      CASE WHEN (COALESCE(v_new_json, '{}'::jsonb) ->> 'updated_by') ~ '^[0-9]+$' THEN (COALESCE(v_new_json, '{}'::jsonb) ->> 'updated_by')::BIGINT END,
      CASE WHEN (COALESCE(v_new_json, '{}'::jsonb) ->> 'created_by') ~ '^[0-9]+$' THEN (COALESCE(v_new_json, '{}'::jsonb) ->> 'created_by')::BIGINT END,
      CASE WHEN (COALESCE(v_new_json, '{}'::jsonb) ->> 'user_id') ~ '^[0-9]+$' THEN (COALESCE(v_new_json, '{}'::jsonb) ->> 'user_id')::BIGINT END,
      CASE WHEN (COALESCE(v_new_json, '{}'::jsonb) ->> 'changed_by') ~ '^[0-9]+$' THEN (COALESCE(v_new_json, '{}'::jsonb) ->> 'changed_by')::BIGINT END,
      CASE WHEN (COALESCE(v_old_json, '{}'::jsonb) ->> 'updated_by') ~ '^[0-9]+$' THEN (COALESCE(v_old_json, '{}'::jsonb) ->> 'updated_by')::BIGINT END,
      CASE WHEN (COALESCE(v_old_json, '{}'::jsonb) ->> 'created_by') ~ '^[0-9]+$' THEN (COALESCE(v_old_json, '{}'::jsonb) ->> 'created_by')::BIGINT END,
      CASE WHEN (COALESCE(v_old_json, '{}'::jsonb) ->> 'user_id') ~ '^[0-9]+$' THEN (COALESCE(v_old_json, '{}'::jsonb) ->> 'user_id')::BIGINT END,
      CASE WHEN (COALESCE(v_old_json, '{}'::jsonb) ->> 'changed_by') ~ '^[0-9]+$' THEN (COALESCE(v_old_json, '{}'::jsonb) ->> 'changed_by')::BIGINT END
    );
  END IF;

  -- Resolve entity_id from NEW.id for insert/update, else OLD.id for delete.
  v_entity_id := COALESCE(
    CASE WHEN (COALESCE(v_new_json, '{}'::jsonb) ->> 'id') ~ '^[0-9]+$' THEN (COALESCE(v_new_json, '{}'::jsonb) ->> 'id')::BIGINT END,
    CASE WHEN (COALESCE(v_old_json, '{}'::jsonb) ->> 'id') ~ '^[0-9]+$' THEN (COALESCE(v_old_json, '{}'::jsonb) ->> 'id')::BIGINT END
  );

  -- Write one structured audit row for the DML event.
  INSERT INTO audit_logs (
    event_type,
    action,
    user_id,
    changed_by,
    entity_type,
    entity_id,
    changes,
    metadata,
    b_image,
    a_image,
    changed_at
  ) VALUES (
    TG_TABLE_NAME || '_' || v_action,
    v_action,
    v_changed_by,
    v_changed_by,
    TG_TABLE_NAME,
    v_entity_id,
    jsonb_build_object('before', v_b_image, 'after', v_a_image),
    jsonb_build_object(
      'schema', TG_TABLE_SCHEMA,
      'table', TG_TABLE_NAME,
      'operation', TG_OP
    ),
    v_b_image,
    v_a_image,
    now()
  );

  -- Standard trigger return contract.
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

-- Attach the shared event-log trigger to each tracked table.
DROP TRIGGER IF EXISTS trg_event_log_users ON users;
CREATE TRIGGER trg_event_log_users
AFTER INSERT OR UPDATE OR DELETE ON users
FOR EACH ROW
EXECUTE FUNCTION trg_write_event_log();

DROP TRIGGER IF EXISTS trg_event_log_accounts ON accounts;
CREATE TRIGGER trg_event_log_accounts
AFTER INSERT OR UPDATE OR DELETE ON accounts
FOR EACH ROW
EXECUTE FUNCTION trg_write_event_log();

DROP TRIGGER IF EXISTS trg_event_log_account_categories ON account_categories;
CREATE TRIGGER trg_event_log_account_categories
AFTER INSERT OR UPDATE OR DELETE ON account_categories
FOR EACH ROW
EXECUTE FUNCTION trg_write_event_log();

DROP TRIGGER IF EXISTS trg_event_log_account_subcategories ON account_subcategories;
CREATE TRIGGER trg_event_log_account_subcategories
AFTER INSERT OR UPDATE OR DELETE ON account_subcategories
FOR EACH ROW
EXECUTE FUNCTION trg_write_event_log();

DROP TRIGGER IF EXISTS trg_event_log_documents ON documents;
CREATE TRIGGER trg_event_log_documents
AFTER INSERT OR UPDATE OR DELETE ON documents
FOR EACH ROW
EXECUTE FUNCTION trg_write_event_log();

DROP TRIGGER IF EXISTS trg_event_log_password_history ON password_history;
CREATE TRIGGER trg_event_log_password_history
AFTER INSERT OR UPDATE OR DELETE ON password_history
FOR EACH ROW
EXECUTE FUNCTION trg_write_event_log();

DROP TRIGGER IF EXISTS trg_event_log_password_expiry_email_tracking ON password_expiry_email_tracking;
CREATE TRIGGER trg_event_log_password_expiry_email_tracking
AFTER INSERT OR UPDATE OR DELETE ON password_expiry_email_tracking
FOR EACH ROW
EXECUTE FUNCTION trg_write_event_log();

DROP TRIGGER IF EXISTS trg_event_log_journal_entries ON journal_entries;
CREATE TRIGGER trg_event_log_journal_entries
AFTER INSERT OR UPDATE OR DELETE ON journal_entries
FOR EACH ROW
EXECUTE FUNCTION trg_write_event_log();

DROP TRIGGER IF EXISTS trg_event_log_journal_entry_lines ON journal_entry_lines;
CREATE TRIGGER trg_event_log_journal_entry_lines
AFTER INSERT OR UPDATE OR DELETE ON journal_entry_lines
FOR EACH ROW
EXECUTE FUNCTION trg_write_event_log();

DROP TRIGGER IF EXISTS trg_event_log_ledger_entries ON ledger_entries;
CREATE TRIGGER trg_event_log_ledger_entries
AFTER INSERT OR UPDATE OR DELETE ON ledger_entries
FOR EACH ROW
EXECUTE FUNCTION trg_write_event_log();

DROP TRIGGER IF EXISTS trg_event_log_trial_balance_runs ON trial_balance_runs;
CREATE TRIGGER trg_event_log_trial_balance_runs
AFTER INSERT OR UPDATE OR DELETE ON trial_balance_runs
FOR EACH ROW
EXECUTE FUNCTION trg_write_event_log();

DROP TRIGGER IF EXISTS trg_event_log_trial_balance_lines ON trial_balance_lines;
CREATE TRIGGER trg_event_log_trial_balance_lines
AFTER INSERT OR UPDATE OR DELETE ON trial_balance_lines
FOR EACH ROW
EXECUTE FUNCTION trg_write_event_log();

DROP TRIGGER IF EXISTS trg_event_log_adjustment_metadata ON adjustment_metadata;
CREATE TRIGGER trg_event_log_adjustment_metadata
AFTER INSERT OR UPDATE OR DELETE ON adjustment_metadata
FOR EACH ROW
EXECUTE FUNCTION trg_write_event_log();

DROP TRIGGER IF EXISTS trg_event_log_adjustment_lines ON adjustment_lines;
CREATE TRIGGER trg_event_log_adjustment_lines
AFTER INSERT OR UPDATE OR DELETE ON adjustment_lines
FOR EACH ROW
EXECUTE FUNCTION trg_write_event_log();

DROP TRIGGER IF EXISTS trg_event_log_statement_runs ON statement_runs;
CREATE TRIGGER trg_event_log_statement_runs
AFTER INSERT OR UPDATE OR DELETE ON statement_runs
FOR EACH ROW
EXECUTE FUNCTION trg_write_event_log();

DROP TRIGGER IF EXISTS trg_event_log_app_messages ON app_messages;
CREATE TRIGGER trg_event_log_app_messages
AFTER INSERT OR UPDATE OR DELETE ON app_messages
FOR EACH ROW
EXECUTE FUNCTION trg_write_event_log();
