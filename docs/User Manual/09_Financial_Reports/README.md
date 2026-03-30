# Financial Reports

This section documents report generation, export, and delivery behavior.

## Access and Permissions

Current behavior:

- Any authenticated user can open `Reports`.
- Report generation and report email actions are authorized for `administrator` and `manager` roles.
- `accountant` users are blocked from report-generation APIs.

## UI Location

Navigation path:

- `Reports` (`#/reports`)

Current page controls:

- Report Type (`Trial Balance`, `Income Statement`, `Balance Sheet`, `Retained Earnings`)
- Date inputs (`As Of` or `From Date`/`To Date`, depending on report type)
- `Generate`
- `Save CSV`
- `Email`
- `Print`

## Trial Balance Navigation from Transactions

The `Ledger` section on `Transactions` includes:

- `View Trial Balance as of this date`

Current routing behavior:

- Navigates to `#/reports` with trial-balance query params.
- Current params: `report`, `as_of`, `from_date`, `to_date`.

Current behavior:

- The Reports page reads hash query params and prefills report type/date controls.
- Reports can be generated immediately using the prefilled values.

## Implemented Report APIs

- `GET /api/reports/trial-balance`
- `GET /api/reports/income-statement`
- `GET /api/reports/balance-sheet`
- `GET /api/reports/retained-earnings`
- `POST /api/reports/email`

## Output and Delivery

- Generated report output renders in the Reports page.
- `Save CSV` exports the currently rendered report dataset.
- `Email` sends the selected report as a CSV attachment.
- `Print` invokes browser print for the current report view.

## What Exists in the Database

- Reporting-related tables: `trial_balance_runs`, `trial_balance_lines`, `statement_runs`.
- Audit logging infrastructure includes reporting-related entities.

## Related Sections

- `docs/User Manual/06_Journal_Entries/README.md`
- `docs/User Manual/07_Ledger/README.md`
