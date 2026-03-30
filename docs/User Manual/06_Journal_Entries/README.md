# Journal Entries

This section documents journal-entry behavior in the Transactions UI.

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

## Current Task Flow

1. Open `Transactions`.
2. Enter journal header values (date, type, reference, description).
3. Attach one or more source documents.
4. Add or edit journal lines in the lines table.
5. Review totals shown in the Journal summary row.
6. Select `Submit for Approval`.

## Expected Results

- Journal entries are persisted as `pending`.
- Submission notification email is dispatched to manager and administrator stakeholders after successful submission.
- Role restrictions hide the Journal section from administrator users.
- Reference codes are checked for availability before submission when provided.
- Submission is blocked when:
    - no documents are attached
    - debits and credits are not balanced
    - reference-code validation is still pending
    - reference code is not available

## What Exists in the Database

- `journal_entries` table exists.
- `journal_entry_lines` table exists.
- `journal_entry_documents` table exists.
- `journal_entry_line_documents` table exists.
- Audit logging infrastructure includes journal-related entities.

## Current Limitations and Scope

- Journal types are currently limited to `General` and `Adjusting`.
- Journal approval actions remain manager-only.

## Related Sections

- `docs/User Manual/07_Ledger/README.md`
- `docs/User Manual/09_Financial_Reports/README.md`
