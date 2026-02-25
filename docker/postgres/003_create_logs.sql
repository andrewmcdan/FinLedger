-- Application log stream for operational/diagnostic logging.
CREATE TABLE IF NOT EXISTS app_logs (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  level TEXT NOT NULL,
  message TEXT NOT NULL,
  context TEXT,
  source TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Audit/event log stream for entity-level changes.
CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGSERIAL PRIMARY KEY,
  event_type TEXT NOT NULL,
  user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  entity_type TEXT,
  entity_id BIGINT,
  changes JSONB,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  action TEXT,
  changed_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  b_image JSONB,
  a_image JSONB
);

-- Common access-path indexes for log viewers and audit lookups.
CREATE INDEX IF NOT EXISTS idx_logs_user_id ON app_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON audit_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_app_logs_level ON app_logs(level);
CREATE INDEX IF NOT EXISTS idx_audit_logs_changed_by ON audit_logs(changed_by);
CREATE INDEX IF NOT EXISTS idx_audit_logs_changed_at ON audit_logs(changed_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity_changed_at ON audit_logs(entity_type, entity_id, changed_at DESC);

-- Centralized API/UI message catalog.
CREATE TABLE IF NOT EXISTS app_messages (
    code TEXT PRIMARY KEY,
    message_text TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'error' CHECK (category IN ('error', 'success', 'info')),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Keep updated_at in sync whenever a message row changes.
CREATE OR REPLACE FUNCTION app_messages_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_app_messages_updated_at ON app_messages;
CREATE TRIGGER trg_app_messages_updated_at
BEFORE UPDATE ON app_messages
FOR EACH ROW
EXECUTE FUNCTION app_messages_set_updated_at();

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
-- No-op UPDATEs are skipped when before/after sanitized snapshots are identical.
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

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

-- Seed/refresh message catalog entries.
-- ON CONFLICT updates text/category and re-activates message codes.
INSERT INTO app_messages (code, message_text, category)
VALUES
    ('ERR_UNAUTHORIZED', 'Unauthorized', 'error'),
    ('ERR_FORBIDDEN', 'Forbidden', 'error'),
    ('ERR_ACCESS_DENIED_ADMIN_REQUIRED', 'Access denied. Administrator role required.', 'error'),
    ('ERR_FORBIDDEN_ADMIN_CREATE_ACCOUNTS', 'Forbidden. Only Admins can create accounts.', 'error'),
    ('ERR_FORBIDDEN_ADMIN_UPDATE_ACCOUNTS', 'Forbidden. Only Admins can update accounts.', 'error'),
    ('ERR_FORBIDDEN_ADMIN_ADD_ACCOUNT_CATEGORIES', 'Forbidden. Only Admins can add account categories.', 'error'),
    ('ERR_FORBIDDEN_ADMIN_DELETE_ACCOUNT_CATEGORIES', 'Forbidden. Only Admins can delete account categories.', 'error'),
    ('ERR_FORBIDDEN_ADMIN_DELETE_ACCOUNT_SUBCATEGORIES', 'Forbidden. Only Admins can delete account subcategories.', 'error'),
    ('ERR_FORBIDDEN_ADMIN_SET_ACCOUNT_STATUS', 'Forbidden. Only Admins can set account status.', 'error'),
    ('ERR_MISSING_AUTH_HEADER', 'Missing Authorization header', 'error'),
    ('ERR_INVALID_AUTH_HEADER', 'Invalid Authorization header', 'error'),
    ('ERR_MISSING_USER_ID_HEADER', 'Missing X-User-Id header', 'error'),
    ('ERR_INVALID_OR_EXPIRED_TOKEN', 'Invalid or expired token', 'error'),
    ('ERR_NOT_LOGGED_IN', 'You are not logged in', 'error'),
    ('ERR_TEMP_PASSWORD_CHANGE_REQUIRED', 'Password change is required', 'error'),
    ('ERR_INVALID_USERNAME_OR_PASSWORD', 'Invalid username or password', 'error'),
    ('ERR_ACCOUNT_SUSPENDED_DUE_TO_ATTEMPTS', 'Account is suspended due to multiple failed login attempts. Please contact the Administrator.', 'error'),
    ('ERR_ACCOUNT_SUSPENDED_UNTIL', 'Account is suspended until {{suspension_end_at}}', 'error'),
    ('ERR_LOGIN_SERVER', 'Login failed due to a server error', 'error'),
    ('ERR_INTERNAL_SERVER', 'Internal server error', 'error'),
    ('ERR_USER_NOT_FOUND', 'User not found', 'error'),
    ('ERR_USER_NOT_PENDING_APPROVAL', 'User is not pending approval', 'error'),
    ('ERR_USERNAME_SUBJECT_MESSAGE_REQUIRED', 'Username, subject, and message are required', 'error'),
    ('ERR_FAILED_TO_SEND_EMAIL', 'Failed to send email', 'error'),
    ('ERR_FAILED_TO_CREATE_USER', 'Failed to create user', 'error'),
    ('ERR_CURRENT_AND_NEW_PASSWORD_REQUIRED', 'Current password and new password are required', 'error'),
    ('ERR_PASSWORDS_DO_NOT_MATCH', 'Passwords do not match', 'error'),
    ('ERR_CURRENT_PASSWORD_INCORRECT', 'Current password is incorrect', 'error'),
    ('ERR_PASSWORD_COMPLEXITY', 'Password does not meet complexity requirements', 'error'),
    ('ERR_PASSWORD_HISTORY_REUSE', 'New password cannot be the same as any past passwords', 'error'),
    ('ERR_FAILED_TO_CHANGE_PASSWORD', 'Failed to change password', 'error'),
    ('ERR_CURRENT_PASSWORD_REQUIRED', 'Current password is required', 'error'),
    ('ERR_ALL_SECURITY_QA_REQUIRED', 'All security questions and answers are required', 'error'),
    ('ERR_EXACTLY_THREE_SECURITY_QA_REQUIRED', 'Exactly three security questions and answers are required', 'error'),
    ('ERR_FAILED_TO_UPDATE_SECURITY_QUESTIONS', 'Failed to update security questions', 'error'),
    ('ERR_PROFILE_IMAGE_PATH_NOT_SET', 'User profile image path is not set', 'error'),
    ('ERR_FAILED_TO_UPDATE_PROFILE_IMAGE', 'Failed to update profile image', 'error'),
    ('ERR_FAILED_TO_UPDATE_PROFILE', 'Failed to update profile', 'error'),
    ('ERR_NEW_PASSWORD_REQUIRED', 'New password is required', 'error'),
    ('ERR_TEMP_PASSWORD_NOT_REQUIRED', 'Temporary password not required', 'error'),
    ('ERR_FAILED_TO_REGISTER_USER', 'Failed to register user', 'error'),
    ('ERR_EMAIL_DOES_NOT_MATCH_USER', 'Email does not match user ID', 'error'),
    ('ERR_INVALID_OR_EXPIRED_RESET_TOKEN', 'Invalid or expired reset token', 'error'),
    ('ERR_SECURITY_ANSWER_VERIFICATION_FAILED', 'Security answers verification failed', 'error'),
    ('ERR_FAILED_TO_RESET_PASSWORD', 'Failed to reset password', 'error'),
    ('ERR_PASSWORD_RESET_LOCKED_DUE_TO_ATTEMPTS', 'Password reset is locked after multiple failed verification attempts. Please contact an administrator.', 'error'),
    ('ERR_ONLY_ACTIVE_USERS_CAN_BE_SUSPENDED', 'Only active users can be suspended', 'error'),
    ('ERR_ONLY_SUSPENDED_USERS_CAN_BE_REINSTATED', 'Only suspended users can be reinstated', 'error'),
    ('ERR_FIELD_CANNOT_BE_UPDATED', 'Field cannot be updated', 'error'),
    ('ERR_FAILED_TO_RESET_USER_PASSWORD', 'Failed to reset user password', 'error'),
    ('ERR_NO_FILE_UPLOADED', 'No file uploaded', 'error'),
    ('ERR_INVALID_FILE_TYPE', 'Invalid file type', 'error'),
    ('ERR_CATEGORY_AND_SUBCATEGORY_REQUIRED', 'Category and subcategory names are required.', 'error'),
    ('ERR_CATEGORY_PREFIX_SUBCATEGORY_REQUIRED', 'Category name, account prefix, and at least one subcategory are required.', 'error'),
    ('ERR_CANNOT_DELETE_CATEGORY_WITH_ACCOUNTS', 'Cannot delete category because accounts are tied to it.', 'error'),
    ('ERR_CANNOT_DELETE_SUBCATEGORY_WITH_ACCOUNTS', 'Cannot delete subcategory because accounts are tied to it.', 'error'),
    ('ERR_ACCOUNT_CREATION_FAILED', 'Account creation failed.', 'error'),
    ('ERR_FAILED_TO_FETCH_USERS', 'Failed to fetch users', 'error'),
    ('ERR_FAILED_TO_LOAD_ACCOUNTS', 'Failed to load accounts', 'error'),
    ('ERR_FAILED_TO_UPDATE_ACCOUNT_FIELD', 'Failed to update account field', 'error'),
    ('ERR_NO_SUBCATEGORIES_FOUND', 'No subcategories found for the selected category.', 'error'),
    ('ERR_INVALID_SELECTION', 'Invalid selection.', 'error'),
    ('ERR_JOURNAL_ENTRY_NOT_BALANCED', 'Debits and credits must balance before submission.', 'error'),
    ('ERR_JOURNAL_REFERENCE_CODE_CHECK_PENDING', 'Reference code is still being validated. Please wait a moment.', 'error'),
    ('ERR_JOURNAL_REFERENCE_CODE_NOT_AVAILABLE', 'Reference code is not available.', 'error'),
    ('ERR_SELECT_CATEGORY_OR_SUBCATEGORY_TO_DELETE', 'Please select a category or subcategory to delete.', 'error'),
    ('ERR_SELECT_ACCOUNT_TO_DEACTIVATE', 'Please select an account to deactivate.', 'error'),
    ('ERR_INVALID_USERNAME_SELECTED', 'Invalid username selected', 'error'),
    ('ERR_PLEASE_FILL_ALL_FIELDS', 'Please fill in all fields', 'error'),
    ('ERR_PROVIDE_VALID_SUSPENSION_DATES', 'Please provide valid suspension dates', 'error'),
    ('ERR_SUSPENSION_END_AFTER_START', 'Suspension end date must be after start date', 'error'),
    ('ERR_ENTER_USERNAME_TO_DELETE', 'Please enter a username to delete', 'error'),
    ('ERR_ENTER_USERNAME_TO_RESET_PASSWORD', 'Please enter a username to reset password', 'error'),
    ('ERR_CANNOT_DELETE_OWN_ACCOUNT', 'You cannot delete your own account', 'error'),
    ('ERR_FAILED_TO_DELETE_USER', 'Failed to delete user', 'error'),
    ('ERR_FAILED_TO_RESET_PASSWORD_GENERIC', 'Error resetting password', 'error'),
    ('ERR_FAILED_TO_LOAD_SECURITY_QUESTIONS', 'Failed to load security questions', 'error'),
    ('ERR_PASSWORD_RESET_REQUEST_FAILED', 'Password reset request failed', 'error'),
    ('ERR_UNABLE_TO_UPDATE_PASSWORD', 'Unable to update password.', 'error'),
    ('ERR_UNKNOWN', 'An unknown error occurred.', 'error'),
    ('MSG_LOGGED_OUT_SUCCESS', 'Logged out successfully', 'success'),
    ('MSG_EMAIL_SENT_SUCCESS', 'Email sent successfully', 'success'),
    ('MSG_USER_APPROVED_SUCCESS', 'User approved successfully', 'success'),
    ('MSG_USER_REJECTED_SUCCESS', 'User rejected successfully', 'success'),
    ('MSG_PASSWORD_CHANGED_SUCCESS', 'Password changed successfully', 'success'),
    ('MSG_SECURITY_QUESTIONS_UPDATED_SUCCESS', 'Security questions updated successfully', 'success'),
    ('MSG_PROFILE_UPDATED_SUCCESS', 'Profile updated successfully', 'success'),
    ('MSG_PASSWORD_RESET_EMAIL_SENT_SUCCESS', 'Password reset email sent successfully', 'success'),
    ('MSG_PASSWORD_RESET_SUCCESS', 'Password reset successfully', 'success'),
    ('MSG_USER_SUSPENDED_SUCCESS', 'User suspended successfully', 'success'),
    ('MSG_USER_REINSTATED_SUCCESS', 'User reinstated successfully', 'success'),
    ('MSG_USER_FIELD_UPDATED_SUCCESS', 'User field updated successfully', 'success'),
    ('MSG_USER_DELETED_SUCCESS', 'User deleted successfully', 'success'),
    ('MSG_USER_PASSWORD_RESET_SUCCESS', 'User password reset successfully', 'success'),
    ('MSG_FILE_UPLOADED_SUCCESS', 'File uploaded successfully', 'success'),
    ('MSG_JOURNAL_ENTRY_CREATED_SUCCESS', 'Journal entry created successfully', 'success'),
    ('MSG_LOGIN_SUCCESS', 'Login successful!', 'success'),
    ('MSG_REGISTRATION_SUCCESS_REDIRECT', 'Registration successful! Check your email for further instructions. Redirecting to login page...', 'success'),
    ('MSG_PASSWORD_UPDATED_REDIRECT', 'Password updated successfully. Redirecting...', 'success'),
    ('MSG_USER_CREATED_SUCCESS', 'User created successfully', 'success')
ON CONFLICT (code) DO UPDATE
SET
    message_text = EXCLUDED.message_text,
    category = EXCLUDED.category,
    is_active = TRUE,
    updated_at = now();
