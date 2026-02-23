# Journal Entries

This section documents current journal-entry behavior visible in the Transactions UI.

## Access and Permissions

Current role visibility:

- `manager`: can access the Journal section.
- `accountant`: can access the Journal section.
- `administrator`: cannot access the Journal section in Transactions.

## UI Location

Navigation path:

- `Transactions` page (`#/transactions`)
- `Journal` card at the top of the page (for manager/accountant roles)

Current Journal controls:

- Entry Date
- Journal Type (`General`, `Adjusting`)
- Reference text field
- Source Document file upload control
- Entry Description
- Journal lines table (debit/credit columns)
- Totals row (`Debits`, `Credits`, `Difference`)
- `Submit for Approval` button

## Current Task Flow (UI Scaffold)

1. Open `Transactions`.
2. Enter journal header values (date, type, reference, description).
3. Add or edit journal lines in the lines table.
4. Review totals shown in the Journal summary row.
5. Select `Submit for Approval`.

## Expected Results (Current Build)

- Journal form and table controls render for manager/accountant users.
- Role restrictions hide the Journal section from administrator users.
- The current implementation is a UI scaffold and does not yet persist full journal workflows end to end.

## What Exists in the Database

- `journal_entries` table exists.
- `journal_entry_lines` table exists.
- Audit logging infrastructure includes journal-related entities.

## Current Limitations

- Full submit/approve/reject backend workflow is not yet wired end to end.
- Rejection-reason capture and manager-notification behavior are not yet exposed as complete user workflows.
- Validation and balance enforcement behavior shown in Sprint requirements is not fully implemented in UI/API integration.

## Related Sections

- `docs/User Manual/07_Ledger/README.md`
- `docs/User Manual/09_Financial_Reports/README.md`
