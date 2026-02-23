-- Enable UUID generation for document file identifiers.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- User document metadata (binary content is stored outside DB).
-- file_name is a generated UUID used as the stable storage key.
CREATE TABLE IF NOT EXISTS documents (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  file_name UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  file_extension TEXT NOT NULL,
  meta_data JSONB NOT NULL,
  upload_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes supporting lookups by owner, time, and storage key.
CREATE INDEX IF NOT EXISTS idx_documents_user_id ON documents(user_id);
CREATE INDEX IF NOT EXISTS idx_documents_upload_at ON documents(upload_at);
CREATE INDEX IF NOT EXISTS idx_documents_file_name ON documents(file_name);
