-- Core chart-of-accounts table.
-- Note: legacy text category/subcategory columns are later migrated to FK-based IDs.
CREATE TABLE IF NOT EXISTS accounts (
  id BIGSERIAL PRIMARY KEY,
  account_name TEXT NOT NULL UNIQUE,
  account_number BIGINT NOT NULL UNIQUE,
  account_description TEXT,
  normal_side TEXT NOT NULL CHECK (normal_side IN ('debit', 'credit')),
  account_category TEXT NOT NULL,
  account_subcategory TEXT NOT NULL,
  initial_balance NUMERIC NOT NULL DEFAULT 0,
  debit NUMERIC NOT NULL DEFAULT 0,
  credit NUMERIC NOT NULL DEFAULT 0,
  balance NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  account_order INTEGER NOT NULL,
  statement_type TEXT NOT NULL CHECK (statement_type IN ('IS', 'BS', 'RE')),
  comment TEXT
);

-- Secondary uniqueness guard per user to support future multi-tenant semantics.
CREATE UNIQUE INDEX IF NOT EXISTS idx_account_user_account_number
ON accounts(user_id, account_number);

-- Balance-movement audit trail for debit/credit/balance changes.
CREATE TABLE IF NOT EXISTS account_audits (
  id BIGSERIAL PRIMARY KEY,
  account_id BIGINT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  audit_timestamp TIMESTAMPTZ NOT NULL DEFAULT now(),
  previous_debit NUMERIC NOT NULL,
  previous_credit NUMERIC NOT NULL,
  previous_balance NUMERIC NOT NULL,
  new_debit NUMERIC NOT NULL,
  new_credit NUMERIC NOT NULL,
  new_balance NUMERIC NOT NULL,
  changed_by BIGINT NOT NULL REFERENCES users(id) ON DELETE SET NULL
);

-- Metadata edit trail for non-balance account field updates.
CREATE TABLE IF NOT EXISTS account_metadata_edits (
  id BIGSERIAL PRIMARY KEY,
  account_id BIGINT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  edit_timestamp TIMESTAMPTZ NOT NULL DEFAULT now(),
  field_name TEXT NOT NULL,
  previous_value TEXT,
  new_value TEXT,
  changed_by BIGINT NOT NULL REFERENCES users(id) ON DELETE SET NULL
);

-- Initial trigger function placeholder.
-- The full implementation is installed in migrations/007_update_accounts_audit_trigger.sql.
CREATE OR REPLACE FUNCTION trg_accounts_write_audit_and_metadata()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_changed_by BIGINT;
BEGIN
  RETURN NEW;
END;
$$;

-- Bind audit/metadata trigger to account updates.
DROP TRIGGER IF EXISTS trg_accounts_audit_and_metadata ON accounts;

CREATE TRIGGER trg_accounts_audit_and_metadata
BEFORE UPDATE ON accounts
FOR EACH ROW
EXECUTE FUNCTION trg_accounts_write_audit_and_metadata();

-- Tighten FK behavior so changed_by users cannot be deleted while referenced.
ALTER TABLE account_audits
  DROP CONSTRAINT account_audits_changed_by_fkey,
  ADD CONSTRAINT account_audits_changed_by_fkey
  FOREIGN KEY (changed_by) REFERENCES users(id) ON DELETE RESTRICT;

ALTER TABLE account_metadata_edits
  DROP CONSTRAINT account_metadata_edits_changed_by_fkey,
  ADD CONSTRAINT account_metadata_edits_changed_by_fkey
  FOREIGN KEY (changed_by) REFERENCES users(id) ON DELETE RESTRICT;
