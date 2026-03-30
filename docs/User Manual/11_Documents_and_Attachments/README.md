# Documents and Attachments

## Journal Document Workflow (Implemented)

Journal entries support document attachments through the Transactions workflow.

Implemented behavior:

- Users add one or more documents before submitting a journal entry.
- Submission is blocked when no documents are attached.
- Allowed file types are validated by extension/MIME mapping.
- Uploaded files are stored in `user-docs/` and linked through journal/document tables.
- Journal Queue review includes downloadable document links.

## Supported Journal Document Types and Limits

- Supported extensions include: `pdf`, `png`, `jpg`, `jpeg`, `gif`, `webp`, `txt`, `csv`, `xls`, `xlsx`, `doc`, `docx`.
- Max file size per upload: 15 MB.
- Max files per request is bounded by route-level upload limits.

## Separate User-Document Routes (Not Yet Implemented)

Separate generic user-document endpoints remain placeholders:

- `GET /api/documents/:filename`
- `POST /api/documents/upload`

These routes currently return "not yet implemented" responses and are distinct from journal-document handling under Transactions.

## Data Model

- `documents` table exists in the database.
- `journal_entry_documents` and `journal_entry_line_documents` link docs to journal headers/lines.
- Audit triggers include `documents` and related journal entities.
- Cleanup utilities remove unreferenced files from `user-docs/`.

Related implemented upload feature (separate from documents):

- User profile image upload is implemented with file-type and size validation.
