-- Core chart-of-accounts table.
-- Category/subcategory FK constraints are added in 008_create_account_categories.sql
-- because referenced tables are created there.
CREATE TABLE IF NOT EXISTS accounts (
  id BIGSERIAL PRIMARY KEY,
  account_name TEXT NOT NULL UNIQUE,
  account_number BIGINT NOT NULL UNIQUE,
  account_description TEXT,
  normal_side TEXT NOT NULL CHECK (normal_side IN ('debit', 'credit')),
  initial_balance NUMERIC NOT NULL DEFAULT 0,
  total_debits NUMERIC NOT NULL DEFAULT 0,
  total_credits NUMERIC NOT NULL DEFAULT 0,
  balance NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  account_order INTEGER NOT NULL,
  statement_type TEXT NOT NULL CHECK (statement_type IN ('IS', 'BS', 'RE')),
  comment TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  account_category_id BIGINT,
  account_subcategory_id BIGINT
);

-- Secondary uniqueness guard per user to support future multi-tenant semantics.
CREATE UNIQUE INDEX IF NOT EXISTS idx_account_user_account_number
ON accounts(user_id, account_number);

-- Indexes for joins/filtering on category and subcategory selectors.
CREATE INDEX IF NOT EXISTS idx_accounts_account_subcategory_id
ON accounts(account_subcategory_id);

CREATE INDEX IF NOT EXISTS idx_accounts_account_category_id
ON accounts(account_category_id);

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

-- Full audit + metadata change capture for account updates.
CREATE OR REPLACE FUNCTION trg_accounts_write_audit_and_metadata()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_changed_by BIGINT;
BEGIN

  -- Prefer app.user_id from transaction context; fallback to row owner.
  v_changed_by := NULLIF(current_setting('app.user_id', true), '')::bigint;
  IF v_changed_by IS NULL THEN
    v_changed_by := NEW.user_id;
  END IF;

  -- Balance-related values are audited together as one movement record.
  IF (NEW.total_debits IS DISTINCT FROM OLD.total_debits)
     OR (NEW.total_credits IS DISTINCT FROM OLD.total_credits)
     OR (NEW.balance IS DISTINCT FROM OLD.balance)
  THEN
    INSERT INTO account_audits (
      account_id,
      audit_timestamp,
      previous_debit, previous_credit, previous_balance,
      new_debit, new_credit, new_balance,
      changed_by
    ) VALUES (
      OLD.id,
      now(),
      OLD.total_debits, OLD.total_credits, OLD.balance,
      NEW.total_debits, NEW.total_credits, NEW.balance,
      v_changed_by
    );
  END IF;

  -- Metadata edits are captured one field at a time for precise history.
  IF NEW.account_name IS DISTINCT FROM OLD.account_name THEN
    INSERT INTO account_metadata_edits(account_id, edit_timestamp, field_name, previous_value, new_value, changed_by)
    VALUES (OLD.id, now(), 'account_name', OLD.account_name, NEW.account_name, v_changed_by);
  END IF;

  IF NEW.account_number IS DISTINCT FROM OLD.account_number THEN
    INSERT INTO account_metadata_edits(account_id, edit_timestamp, field_name, previous_value, new_value, changed_by)
    VALUES (OLD.id, now(), 'account_number', OLD.account_number::text, NEW.account_number::text, v_changed_by);
  END IF;

  IF NEW.account_description IS DISTINCT FROM OLD.account_description THEN
    INSERT INTO account_metadata_edits(account_id, edit_timestamp, field_name, previous_value, new_value, changed_by)
    VALUES (OLD.id, now(), 'account_description', OLD.account_description, NEW.account_description, v_changed_by);
  END IF;

  IF NEW.normal_side IS DISTINCT FROM OLD.normal_side THEN
    INSERT INTO account_metadata_edits(account_id, edit_timestamp, field_name, previous_value, new_value, changed_by)
    VALUES (OLD.id, now(), 'normal_side', OLD.normal_side, NEW.normal_side, v_changed_by);
  END IF;

  IF NEW.account_category_id IS DISTINCT FROM OLD.account_category_id THEN
    INSERT INTO account_metadata_edits(account_id, edit_timestamp, field_name, previous_value, new_value, changed_by)
    VALUES (OLD.id, now(), 'account_category_id', OLD.account_category_id::text, NEW.account_category_id::text, v_changed_by);
  END IF;

  IF NEW.account_subcategory_id IS DISTINCT FROM OLD.account_subcategory_id THEN
    INSERT INTO account_metadata_edits(account_id, edit_timestamp, field_name, previous_value, new_value, changed_by)
    VALUES (OLD.id, now(), 'account_subcategory_id', OLD.account_subcategory_id::text, NEW.account_subcategory_id::text, v_changed_by);
  END IF;

  IF NEW.initial_balance IS DISTINCT FROM OLD.initial_balance THEN
    INSERT INTO account_metadata_edits(account_id, edit_timestamp, field_name, previous_value, new_value, changed_by)
    VALUES (OLD.id, now(), 'initial_balance', OLD.initial_balance::text, NEW.initial_balance::text, v_changed_by);
  END IF;

  IF NEW.account_order IS DISTINCT FROM OLD.account_order THEN
    INSERT INTO account_metadata_edits(account_id, edit_timestamp, field_name, previous_value, new_value, changed_by)
    VALUES (OLD.id, now(), 'account_order', OLD.account_order::text, NEW.account_order::text, v_changed_by);
  END IF;

  IF NEW.statement_type IS DISTINCT FROM OLD.statement_type THEN
    INSERT INTO account_metadata_edits(account_id, edit_timestamp, field_name, previous_value, new_value, changed_by)
    VALUES (OLD.id, now(), 'statement_type', OLD.statement_type, NEW.statement_type, v_changed_by);
  END IF;

  IF NEW.comment IS DISTINCT FROM OLD.comment THEN
    INSERT INTO account_metadata_edits(account_id, edit_timestamp, field_name, previous_value, new_value, changed_by)
    VALUES (OLD.id, now(), 'comment', OLD.comment, NEW.comment, v_changed_by);
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO account_metadata_edits(account_id, edit_timestamp, field_name, previous_value, new_value, changed_by)
    VALUES (OLD.id, now(), 'status', OLD.status::text, NEW.status::text, v_changed_by);
  END IF;

  IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    INSERT INTO account_metadata_edits(account_id, edit_timestamp, field_name, previous_value, new_value, changed_by)
    VALUES (OLD.id, now(), 'user_id', OLD.user_id::text, NEW.user_id::text, v_changed_by);
  END IF;

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
  DROP CONSTRAINT IF EXISTS account_audits_changed_by_fkey,
  ADD CONSTRAINT account_audits_changed_by_fkey
  FOREIGN KEY (changed_by) REFERENCES users(id) ON DELETE RESTRICT;

ALTER TABLE account_metadata_edits
  DROP CONSTRAINT IF EXISTS account_metadata_edits_changed_by_fkey,
  ADD CONSTRAINT account_metadata_edits_changed_by_fkey
  FOREIGN KEY (changed_by) REFERENCES users(id) ON DELETE RESTRICT;
