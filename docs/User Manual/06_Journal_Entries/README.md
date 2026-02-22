# Journal Entries

## Current Status

A complete journal-entry user workflow is not implemented in the current web UI/API.

The expected capabilities below are not yet available as user-facing features:

- Creating journal entries from a dedicated page
- Multi-line debit/credit entry workflow
- Submit/approve/reject workflow with rejection comments
- Journal status views with date filters
- Journal search by account/date/amount
- Source-document attachment from journal-entry UI
- Manager notification on journal submission

## What Exists Today

- Database tables exist (`journal_entries`, `journal_entry_lines`).
- Database-level audit triggers exist for journal tables.
- The `Transactions` page is currently a lightweight activity view and does not create journal entries.

## Documentation Note

When journal-entry workflows are implemented, this section should be updated with page-level procedures, role permissions, and validation rules.
