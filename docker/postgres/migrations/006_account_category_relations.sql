ALTER TABLE accounts
DROP COLUMN account_category,
DROP COLUMN account_subcategory;

ALTER TABLE accounts
 ADD COLUMN account_category_id BIGINT REFERENCES account_categories(id);

ALTER TABLE accounts
 ADD COLUMN account_subcategory_id BIGINT REFERENCES account_subcategories(id);



CREATE INDEX IF NOT EXISTS idx_accounts_account_subcategory_id
ON accounts(account_subcategory_id);
CREATE INDEX IF NOT EXISTS idx_accounts_account_category_id
ON accounts(account_category_id);