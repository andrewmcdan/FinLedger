CREATE OR REPLACE FUNCTION trg_accounts_write_audit_and_metadata()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_changed_by BIGINT;
BEGIN

  v_changed_by := NULLIF(current_setting('app.user_id', true), '')::bigint;
  IF v_changed_by IS NULL THEN
    v_changed_by := NEW.user_id;
  END IF;

  IF (NEW.total_debits   IS DISTINCT FROM OLD.total_debits)
     OR (NEW.total_credits  IS DISTINCT FROM OLD.total_credits)
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
