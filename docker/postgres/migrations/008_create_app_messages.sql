-- Centralized API/UI message catalog.
-- Message codes are stable keys; text/category can be revised via migration upserts.
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

-- Seed/refresh message catalog entries.
-- ON CONFLICT updates text/category and re-activates message codes.
INSERT INTO app_messages (code, message_text, category)
VALUES
    ('ERR_UNAUTHORIZED', 'Unauthorized', 'error'),
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
    ('MSG_LOGIN_SUCCESS', 'Login successful!', 'success'),
    ('MSG_REGISTRATION_SUCCESS_REDIRECT', 'Registration successful! Check your email for further instructions. Redirecting to login page...', 'success'),
    ('MSG_PASSWORD_UPDATED_REDIRECT', 'Password updated successfully. Redirecting...', 'success'),
    ('MSG_USER_CREATED_SUCCESS', 'User created successfully', 'success')
ON CONFLICT (code) DO UPDATE
SET
    -- Use incoming values from this migration as source of truth.
    message_text = EXCLUDED.message_text,
    category = EXCLUDED.category,
    is_active = TRUE,
    updated_at = now();
