# Audit and Event Logs

## Current Logging Model

FinLedger currently records change/audit data in multiple tables:

- `audit_logs`
- `account_audits`
- `account_metadata_edits`

The generalized audit trigger captures:

- action (`insert`, `update`, `delete`)
- changed_by
- changed_at
- entity_type/entity_id
- before image (`b_image`)
- after image (`a_image`)
- metadata

Sensitive fields are sanitized from audit row images (for example password hashes and reset tokens).

## Coverage

Audit triggers are configured for many core tables, including:

- users
- accounts
- account categories/subcategories
- documents
- password history and password-expiry tracking
- journal/ledger/reporting-related tables
- app messages

## Access (Current)

Audit data is currently exposed through API endpoints:

- `GET /api/audit-logs`
- `GET /api/audit-logs/entity/:entityType/:entityId`

Supported filters include:

- `entity_type`
- `entity_id`
- `changed_by`
- `action`
- `start_at`
- `end_at`
- `limit`
- `offset`

Current access roles:

- Administrator
- Manager

## UI Availability

No dedicated audit-log viewer page is currently implemented.

Current UI note:

- The Accounts table renders an `Audit` button, but it is not wired to an audit-log action yet.

## Retention and Cleanup

Log cleanup runs on a daily interval.

Current behavior:

- `app_logs` retention is controlled by `APP_LOGS_RETENTION_DAYS`.
- `audit_logs` retention is controlled by `AUDIT_LOGS_RETENTION_DAYS` when set to a positive value.
- If `AUDIT_LOGS_RETENTION_DAYS` is unset or non-positive, audit-log deletion is skipped.
