# Ledger

This section documents the ledger user interface and behavior in `Transactions`.

## Access and Permissions

Current role visibility:

- `manager`: can view Ledger section.
- `accountant`: can view Ledger section.
- `administrator`: can view Ledger section (read-only intent).

## UI Location

Navigation path:

- `Transactions` page (`#/transactions`)
- `Ledger` card in the lower section of the page

Current Ledger controls:

- Account filter
- From Date filter
- To Date filter
- Search field
- `Apply Filters` and `Clear` buttons
- Ledger table columns: Date, Account, Description, Posting Ref, Debit, Credit, Balance.

The page also includes:

- T-Account (Debit) table
- T-Account (Credit) table

## Trial Balance Quick Link

The Ledger controls include a quick link:

- `View Trial Balance as of this date`

Current behavior:

- Link routes to `#/reports` with trial-balance query parameters.
- Parameters include `report=trial_balance`, `as_of`, `from_date`, and `to_date`.

## Current Task Flow

1. Open `Transactions`.
2. Go to the `Ledger` section.
3. Set account/date/search filter inputs.
4. Select `Apply Filters` to scope the ledger view.
5. Use posting-reference links in the table to navigate to related journal context.
6. Use `View Trial Balance as of this date` to jump to Reports with prefilled query parameters.

## Expected Results

- Ledger and T-account sections render based on role access.
- Ledger rows load from posted `ledger_entries` data.
- Account/date/search filters are applied server-side through `/api/transactions/ledger`.
- Running balance is calculated per account and displayed in the ledger table.
- Posting-reference links are visible in ledger/T-account rows.
- Trial-balance quick link is visible in Ledger controls.

## What Exists in the Database

- `ledger_entries` table exists.
- Audit logging infrastructure includes ledger-related entities.

## Current Limitations

- Ledger drill-down currently routes back to Transactions queue context (`#/transactions?journal_id=...`).
- Full financial-statement generation and formatting are still in progress.

## Related Sections

- `docs/User Manual/06_Journal_Entries/README.md`
- `docs/User Manual/09_Financial_Reports/README.md`
