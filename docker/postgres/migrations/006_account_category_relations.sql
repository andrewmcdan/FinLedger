-- Replace legacy text category columns with FK references to normalized tables.
ALTER TABLE accounts
DROP COLUMN account_category,
DROP COLUMN account_subcategory;

-- Add nullable category FK (populated by application workflows).
ALTER TABLE accounts
 ADD COLUMN account_category_id BIGINT REFERENCES account_categories(id);

-- Add nullable subcategory FK (populated by application workflows).
ALTER TABLE accounts
 ADD COLUMN account_subcategory_id BIGINT REFERENCES account_subcategories(id);

-- Indexes for joins/filtering on category and subcategory selectors.
CREATE INDEX IF NOT EXISTS idx_accounts_account_subcategory_id
ON accounts(account_subcategory_id);
CREATE INDEX IF NOT EXISTS idx_accounts_account_category_id
ON accounts(account_category_id);
