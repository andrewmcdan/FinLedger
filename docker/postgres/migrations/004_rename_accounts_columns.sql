-- Rename legacy debit/credit accumulator columns to explicit total_* names.
-- This aligns column names with controller expectations.
ALTER TABLE accounts RENAME COLUMN debit TO total_debits;
ALTER TABLE accounts RENAME COLUMN credit TO total_credits;
