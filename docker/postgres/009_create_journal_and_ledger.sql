CREATE TABLE IF NOT EXISTS journal_entries (
    id SERIAL PRIMARY KEY,
    journal_type TEXT NOT NULL CHECK (journal_type IN ('general', 'adjusting')),
    entry_date TIMESTAMP NOT NULL DEFAULT NOW(),
    description TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('draft', 'approved', 'posted', 'voided')),
    total_debits NUMERIC(18, 2) NOT NULL,
    total_credits NUMERIC(18, 2) NOT NULL,
    created_by INTEGER NOT NULL REFERENCES users(id),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_by INTEGER NOT NULL REFERENCES users(id),
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    approved_by INTEGER REFERENCES users(id),
    approved_at TIMESTAMP,
    posted_at TIMESTAMP,
);

CREATE INDEX IF NOT EXISTS idx_journal_entries_entry_date
ON journal_entries(entry_date);

CREATE INDEX IF NOT EXISTS idx_journal_entries_status
ON journal_entries(status);

CREATE TABLE IF NOT EXISTS journal_entry_lines (
    id SERIAL PRIMARY KEY,
    journal_entry_id INTEGER NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE,
    line_no INTEGER NOT NULL,
    account_id INTEGER NOT NULL REFERENCES accounts(id),
    dc TEXT NOT NULL CHECK (dc IN ('debit', 'credit')),
    amount NUMERIC(18, 2) NOT NULL,
    line_description TEXT,
    source_document_id INTEGER REFERENCES documents(id),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by INTEGER NOT NULL REFERENCES users(id),
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_by INTEGER NOT NULL REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_journal_entry_lines_journal_entry_id
ON journal_entry_lines(journal_entry_id);

CREATE INDEX IF NOT EXISTS idx_journal_entry_lines_account_id
ON journal_entry_lines(account_id);

CREATE INDEX IF NOT EXISTS idx_journal_entry_lines_dc
ON journal_entry_lines(dc);

CREATE INDEX IF NOT EXISTS idx_journal_entry_lines_amount
ON journal_entry_lines(amount);

CREATE TABLE IF NOT EXISTS ledger_entries (
    id SERIAL PRIMARY KEY,
    account_id INTEGER NOT NULL REFERENCES accounts(id),
    entry_date TIMESTAMP NOT NULL,
    dc TEXT NOT NULL CHECK (dc IN ('debit', 'credit')),
    amount NUMERIC(18, 2) NOT NULL,
    description TEXT,
    journal_entry_line_id INTEGER NOT NULL REFERENCES journal_entry_lines(id) ON DELETE CASCADE,
    journal_entry_id INTEGER NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE,
    pr_journal_ref TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by INTEGER NOT NULL REFERENCES users(id),
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_by INTEGER NOT NULL REFERENCES users(id),
    posted_at TIMESTAMP,
    posted_by INTEGER REFERENCES users(id)
);