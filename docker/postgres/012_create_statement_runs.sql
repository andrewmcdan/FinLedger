-- Stores each generated financial statement run for reproducibility/audit.
-- data_line_type distinguishes "as of" style statements from period-ending reports.
CREATE TABLE IF NOT EXISTS statement_runs (
    id SERIAL PRIMARY KEY,
    statement_type TEXT NOT NULL CHECK (statement_type IN ('IS', 'BS', 'RE')),
    company_name TEXT NOT NULL,
    title_line TEXT,
    data_line_type TEXT NOT NULL CHECK (data_line_type IN ('as_of_date', 'period_ending') ),
    date_value TIMESTAMP NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by INTEGER NOT NULL REFERENCES users(id)
);

-- Attach shared event-log trigger to tracked tables.
DROP TRIGGER IF EXISTS trg_event_log_users ON users;
CREATE TRIGGER trg_event_log_users
AFTER INSERT OR UPDATE OR DELETE ON users
FOR EACH ROW
EXECUTE FUNCTION trg_write_event_log();

DROP TRIGGER IF EXISTS trg_event_log_accounts ON accounts;
CREATE TRIGGER trg_event_log_accounts
AFTER INSERT OR UPDATE OR DELETE ON accounts
FOR EACH ROW
EXECUTE FUNCTION trg_write_event_log();

DROP TRIGGER IF EXISTS trg_event_log_account_categories ON account_categories;
CREATE TRIGGER trg_event_log_account_categories
AFTER INSERT OR UPDATE OR DELETE ON account_categories
FOR EACH ROW
EXECUTE FUNCTION trg_write_event_log();

DROP TRIGGER IF EXISTS trg_event_log_account_subcategories ON account_subcategories;
CREATE TRIGGER trg_event_log_account_subcategories
AFTER INSERT OR UPDATE OR DELETE ON account_subcategories
FOR EACH ROW
EXECUTE FUNCTION trg_write_event_log();

DROP TRIGGER IF EXISTS trg_event_log_documents ON documents;
CREATE TRIGGER trg_event_log_documents
AFTER INSERT OR UPDATE OR DELETE ON documents
FOR EACH ROW
EXECUTE FUNCTION trg_write_event_log();

DROP TRIGGER IF EXISTS trg_event_log_password_history ON password_history;
CREATE TRIGGER trg_event_log_password_history
AFTER INSERT OR UPDATE OR DELETE ON password_history
FOR EACH ROW
EXECUTE FUNCTION trg_write_event_log();

DROP TRIGGER IF EXISTS trg_event_log_password_expiry_email_tracking ON password_expiry_email_tracking;
CREATE TRIGGER trg_event_log_password_expiry_email_tracking
AFTER INSERT OR UPDATE OR DELETE ON password_expiry_email_tracking
FOR EACH ROW
EXECUTE FUNCTION trg_write_event_log();

DROP TRIGGER IF EXISTS trg_event_log_journal_entries ON journal_entries;
CREATE TRIGGER trg_event_log_journal_entries
AFTER INSERT OR UPDATE OR DELETE ON journal_entries
FOR EACH ROW
EXECUTE FUNCTION trg_write_event_log();

DROP TRIGGER IF EXISTS trg_event_log_journal_entry_lines ON journal_entry_lines;
CREATE TRIGGER trg_event_log_journal_entry_lines
AFTER INSERT OR UPDATE OR DELETE ON journal_entry_lines
FOR EACH ROW
EXECUTE FUNCTION trg_write_event_log();

DROP TRIGGER IF EXISTS trg_event_log_journal_entry_documents ON journal_entry_documents;
CREATE TRIGGER trg_event_log_journal_entry_documents
AFTER INSERT OR UPDATE OR DELETE ON journal_entry_documents
FOR EACH ROW
EXECUTE FUNCTION trg_write_event_log();

DROP TRIGGER IF EXISTS trg_event_log_journal_entry_line_documents ON journal_entry_line_documents;
CREATE TRIGGER trg_event_log_journal_entry_line_documents
AFTER INSERT OR UPDATE OR DELETE ON journal_entry_line_documents
FOR EACH ROW
EXECUTE FUNCTION trg_write_event_log();

DROP TRIGGER IF EXISTS trg_event_log_ledger_entries ON ledger_entries;
CREATE TRIGGER trg_event_log_ledger_entries
AFTER INSERT OR UPDATE OR DELETE ON ledger_entries
FOR EACH ROW
EXECUTE FUNCTION trg_write_event_log();

DROP TRIGGER IF EXISTS trg_event_log_trial_balance_runs ON trial_balance_runs;
CREATE TRIGGER trg_event_log_trial_balance_runs
AFTER INSERT OR UPDATE OR DELETE ON trial_balance_runs
FOR EACH ROW
EXECUTE FUNCTION trg_write_event_log();

DROP TRIGGER IF EXISTS trg_event_log_trial_balance_lines ON trial_balance_lines;
CREATE TRIGGER trg_event_log_trial_balance_lines
AFTER INSERT OR UPDATE OR DELETE ON trial_balance_lines
FOR EACH ROW
EXECUTE FUNCTION trg_write_event_log();

DROP TRIGGER IF EXISTS trg_event_log_adjustment_metadata ON adjustment_metadata;
CREATE TRIGGER trg_event_log_adjustment_metadata
AFTER INSERT OR UPDATE OR DELETE ON adjustment_metadata
FOR EACH ROW
EXECUTE FUNCTION trg_write_event_log();

DROP TRIGGER IF EXISTS trg_event_log_adjustment_lines ON adjustment_lines;
CREATE TRIGGER trg_event_log_adjustment_lines
AFTER INSERT OR UPDATE OR DELETE ON adjustment_lines
FOR EACH ROW
EXECUTE FUNCTION trg_write_event_log();

DROP TRIGGER IF EXISTS trg_event_log_statement_runs ON statement_runs;
CREATE TRIGGER trg_event_log_statement_runs
AFTER INSERT OR UPDATE OR DELETE ON statement_runs
FOR EACH ROW
EXECUTE FUNCTION trg_write_event_log();

DROP TRIGGER IF EXISTS trg_event_log_app_messages ON app_messages;
CREATE TRIGGER trg_event_log_app_messages
AFTER INSERT OR UPDATE OR DELETE ON app_messages
FOR EACH ROW
EXECUTE FUNCTION trg_write_event_log();
