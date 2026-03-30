# Adjusting Entries

## Current Status

Adjusting entries are supported in the accounting workflow, but they are currently surfaced through the Transactions experience rather than a dedicated standalone Adjusting Entries page.

## Where Users Work with Adjusting Entries

In Transactions:

- Journal creation supports `Journal Type = Adjusting`.
- Journal Queue supports a `Journal Type` filter (`All`, `General`, `Adjusting`).
- Manager users can approve/reject pending adjusting entries from the same queue controls used for general journal entries.

This aligns with Help guidance for month-end review using the Journal Queue type filter.

## API Support

Adjustment routes exist and support list/create/approve/reject workflows:

- `GET /api/adjustments`
- `POST /api/adjustments`
- `PATCH /api/adjustments/:journalEntryId/approve`
- `PATCH /api/adjustments/:journalEntryId/reject`

Access behavior:

- `administrator`: blocked from adjustment actions.
- `manager`: full access including approval/rejection.
- `accountant`: can create/list but cannot approve/reject.

## Data and Posting Behavior

Adjusting entries use the same journal posting model:

- Header record in `journal_entries` with `journal_type = adjusting`
- Line records in `journal_entry_lines`
- Optional adjustment-specific metadata in `adjustment_metadata` and `adjustment_lines`
- Approved entries post to `ledger_entries`

## Notes

- There is no separate adjusting-entry navigation page at this time.
- Use Transactions Journal and Journal Queue for operational adjusting-entry work.
