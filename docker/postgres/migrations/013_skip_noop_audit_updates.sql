-- Prevent noisy audit rows for no-op UPDATE statements.
-- If the sanitized before/after images are identical, skip inserting into audit_logs.
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

  -- Skip no-op updates where sanitized before/after snapshots are identical.
  IF TG_OP = 'UPDATE' AND v_b_image IS NOT DISTINCT FROM v_a_image THEN
    RETURN NEW;
  END IF;

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
