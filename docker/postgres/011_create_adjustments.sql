-- Adjustment header metadata tied to an adjusting journal entry.
CREATE TABLE IF NOT EXISTS adjustment_metadata (
    id SERIAL PRIMARY KEY,
    journal_entry_id INTEGER NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE,
    adjustment_reason TEXT NOT NULL CHECK (adjustment_reason IN ('prepaid_expense', 'accrual', 'depreciation', 'other')),
    period_end_date TIMESTAMP NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by INTEGER NOT NULL REFERENCES users(id),
    notes TEXT
);

-- Individual debit/credit lines for each adjustment header.
CREATE TABLE IF NOT EXISTS adjustment_lines (
    id SERIAL PRIMARY KEY,
    adjustment_metadata_id INTEGER NOT NULL REFERENCES adjustment_metadata(id) ON DELETE CASCADE,
    account_id INTEGER NOT NULL REFERENCES accounts(id),
    dc TEXT NOT NULL CHECK (dc IN ('debit', 'credit')),
    amount NUMERIC(18, 2) NOT NULL,
    line_description TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by INTEGER NOT NULL REFERENCES users(id)
);
