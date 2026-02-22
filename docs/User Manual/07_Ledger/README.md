# Ledger

## Current Status

A dedicated ledger screen is not implemented in the current UI.

Not yet available as user-facing features:

- Ledger table with running balance by account
- Ledger filtering by date/account/amount
- Post-reference (`PR`) navigation to journal entries
- Full ledger drill-down workflow

## Current Navigation Behavior

From `Accounts`:

- Clicking account name/number routes to `#/transactions?account_id=<id>`.

Current limitation:

- The `Transactions` page does not currently render account-specific ledger data.

## What Exists in the Database

- `ledger_entries` table exists.
- Audit triggers include ledger tables.

## Documentation Note

Update this section when ledger UI/API functionality is exposed to end users.
