# Chart of Accounts

## Scope

The `Accounts` page (`#/accounts_list`) is the current Chart of Accounts module.

Role behavior:

- Administrator: full create/edit/status/category management.
- Manager and accountant: read-only table usage.

## Account List

The account table includes:

- Account name and number
- Owner
- Status
- Normal side
- Balance and opening balance
- Description and comments
- Category and subcategory
- Statement type
- Account order
- Total debits and credits
- Action column (`Audit` button rendered per row)

Current navigation behavior:

- Single-click account name or account number opens `#/transactions?account_id=<id>`.

## Filtering, Sorting, and Pagination

Implemented features:

- Header-click filter modal for supported columns.
- Sort ascending/descending for sortable columns.
- Balance range filter (min/max).
- Remove-filters button.
- Pagination controls and rows-per-page selector (`5`, `10`, `25`, `50`, `100`).

## Administrator Actions

### Add Account

Administrators can add accounts through the account modal.

Key fields include:

- Account name
- Description
- Normal side
- Category/subcategory
- Statement type
- Opening balance
- Account order
- Owner

Account number behavior:

- Generated server-side from category/subcategory/order pattern with suffix handling.

### Inline Edit

Administrators can double-click and edit selected columns, including:

- Account name
- Account number
- Owner
- Normal side
- Description
- Category
- Subcategory
- Statement type
- Comment

### Category and Subcategory Management

Administrators can:

- Add category (with prefix and initial subcategory)
- Add subcategory to existing category
- Delete category or subcategory

Deletion safeguards:

- Category/subcategory deletion is blocked when accounts are tied to them.

### Deactivate/Reactivate

Administrators can deactivate and reactivate accounts.

Status safeguards:

- Deactivation is blocked if account balance is non-zero.

## Audit and Event Logging

Current logging behavior:

- Account changes are captured in `audit_logs` (before/after images).
- Account-specific metadata/debit-credit-balance trails are written to account audit tables.

Current UI status:

- The row `Audit` button is rendered but not wired to an audit-log viewer.
- Audit access is currently API-based.

## Current Gaps

- No dedicated account-audit viewer page is implemented yet.
