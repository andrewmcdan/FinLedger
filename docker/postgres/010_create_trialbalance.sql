CREATE TABLE IF NOT EXISTS trial_balance_runs (
    id SERIAL PRIMARY KEY,
    run_type TEXT NOT NULL CHECK (run_type IN ('unadjusted', 'adjusted')),
    as_of_date TIMESTAMP NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by INTEGER NOT NULL REFERENCES users(id)
    total_debits NUMERIC(18, 2) NOT NULL,
    total_credits NUMERIC(18, 2) NOT NULL
);

CREATE TABLE IF NOT EXISTS trial_balance_lines (
    id SERIAL PRIMARY KEY,
    trial_balance_run_id INTEGER NOT NULL REFERENCES trial_balance_runs(id) ON DELETE CASCADE,
    account_id INTEGER NOT NULL REFERENCES accounts(id),
    debit_balance NUMERIC(18, 2) NOT NULL,
    credit_balance NUMERIC(18, 2) NOT NULL,
    liquidity_order_used INTEGER NOT NULL
);