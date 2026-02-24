-- Application log stream for operational/diagnostic logging.
CREATE TABLE IF NOT EXISTS app_logs (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  level TEXT NOT NULL,
  message TEXT NOT NULL,
  context TEXT,
  source TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Audit/event log stream for entity-level changes.
-- Later migrations expand this table with JSON images and action metadata.
CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGSERIAL PRIMARY KEY,
  event_type TEXT NOT NULL,
  user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  entity_type TEXT,
  entity_id BIGINT,
  changes TEXT,
  metadata TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Common access-path indexes for log viewers and audit lookups.
CREATE INDEX IF NOT EXISTS idx_logs_user_id ON app_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON audit_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_app_logs_level ON app_logs(level);
