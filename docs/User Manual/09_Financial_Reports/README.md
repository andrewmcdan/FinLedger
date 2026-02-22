# Financial Reports

## Current Status

The `Reports` page is currently a lightweight placeholder UI.

Current behavior:

- User can select a period value from a dropdown.
- Page label updates to match selected period.
- Summary text is static.

## Not Yet Implemented

The following report workflows are not yet implemented as end-user features:

- Trial balance generation and viewing
- Income statement generation and viewing
- Balance sheet generation and viewing
- Retained earnings statement generation and viewing
- Save/email/print report workflows
- Date/date-range driven report calculations

## Role Access (Current)

- Any authenticated user can open the current `Reports` page.
- Role-specific report authorization for full reporting workflows is not implemented yet.

## What Exists in the Database

- Reporting-related tables exist (`trial_balance_runs`, `trial_balance_lines`, `statement_runs`).
- Audit triggers include reporting tables.

## Documentation Note

Expand this section when true report-generation workflows are delivered.
