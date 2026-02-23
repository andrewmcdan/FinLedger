# Financial Reports

This section documents current report-page behavior and in-progress trial-balance navigation.

## Access and Permissions

Current behavior:

- Any authenticated user can open `Reports`.
- Role-specific report authorization for full reporting workflows is not yet implemented.

## UI Location

Navigation path:

- `Reports` (`#/reports`)

Current page controls:

- Period dropdown
- Period label that updates when the dropdown changes
- Static executive-summary notices

## Trial Balance Navigation from Transactions

The `Ledger` section on `Transactions` includes:

- `View Trial Balance as of this date`

Current routing behavior:

- Navigates to `#/reports` with trial-balance query params.
- Current params: `report`, `as_of`, `from_date`, `to_date`.

Implementation note:

- Current Reports page does not yet consume these parameters into report-calculation logic.
- The link is in place to support the upcoming trial-balance workflow.

## Not Yet Implemented

The following reporting workflows remain in progress:

- Trial balance generation and rendering from posted ledger data
- Income statement generation
- Balance sheet generation
- Retained earnings statement generation
- Save/export/email report workflows
- Date/date-range driven report calculations

## What Exists in the Database

- Reporting-related tables: `trial_balance_runs`, `trial_balance_lines`, `statement_runs`.
- Audit logging infrastructure includes reporting-related entities.

## Related Sections

- `docs/User Manual/06_Journal_Entries/README.md`
- `docs/User Manual/07_Ledger/README.md`
