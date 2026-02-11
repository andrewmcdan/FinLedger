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