# Documents and Attachments

## Current Status

Document/attachment workflows are not fully implemented in the user-facing app.

Current API route status:

- `GET /api/documents/:filename` returns "not yet implemented."
- `POST /api/documents/upload` returns "not yet implemented."

## Not Yet Implemented

- Journal-entry source document upload from UI
- Document retrieval/download with permission checks
- User-facing attachment metadata management
- Enforced allowed-file-type rules for user documents

## What Exists Today

- `documents` table exists in the database.
- Audit triggers include `documents`.
- Cleanup utilities remove unreferenced files from `user-docs/`.

Related implemented upload feature (separate from documents):

- User profile image upload is implemented with file-type and size validation.

## Documentation Note

Update this section when document upload/retrieval workflows are connected to journal or other user flows.
