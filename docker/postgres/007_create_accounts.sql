CREATE TABLE IF NOT EXISTS accounts (
  id BIGSERIAL PRIMARY KEY,
  account_name TEXT NOT NULL,
  account_number BIGINT NOT NULL UNIQUE,
  account_description TEXT,
  normal_side TEXT NOT NULL CHECK (normal_side IN ('debit', 'credit')),
  account_category TEXT NOT NULL,
  account_subcategory TEXT NOT NULL,
  initial_balance NUMERIC NOT NULL DEFAULT 0,
  debit NUMERIC NOT NULL DEFAULT 0,
  credit NUMERIC NOT NULL DEFAULT 0,
  balance NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  account_order INTEGER NOT NULL,
  statement_type TEXT NOT NULL CHECK (statement_type IN ('IS', 'BS', 'RE')),
  comment TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_account_user_account_number
ON accounts(user_id, account_number);