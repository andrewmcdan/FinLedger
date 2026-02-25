-- Master account categories used for account grouping and numbering prefixes.
CREATE TABLE IF NOT EXISTS account_categories (
    id SERIAL PRIMARY KEY,
    name VARCHAR(50) UNIQUE NOT NULL,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    account_number_prefix VARCHAR(10) UNIQUE,
    order_index INT NOT NULL DEFAULT 10
);

-- Child subcategories scoped to a parent category.
CREATE TABLE IF NOT EXISTS account_subcategories (
    id SERIAL PRIMARY KEY,
    account_category_id INT REFERENCES account_categories(id) ON DELETE CASCADE,
    name VARCHAR(50) UNIQUE NOT NULL,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    order_index INT NOT NULL DEFAULT 10
);

-- Keep order defaults explicit for idempotent runs.
ALTER TABLE account_categories
    ALTER COLUMN order_index SET DEFAULT 10;

ALTER TABLE account_subcategories
    ALTER COLUMN order_index SET DEFAULT 10;

CREATE INDEX IF NOT EXISTS idx_account_categories_order_index
ON account_categories(order_index);

-- Seed default category set with explicit ordering and two-digit numbering prefixes.
INSERT INTO account_categories (name, description, account_number_prefix, order_index) VALUES
('Assets', 'Resources owned by the company', '10', 10),
('Liabilities', 'Obligations owed to others', '20', 20),
('Equity', 'Owner''s interest in the company', '30', 30),
('Revenue', 'Income earned from business activities', '40', 40),
('Expenses', 'Costs incurred in the process of earning revenue', '50', 50)
ON CONFLICT (name) DO NOTHING;

-- Seed common subcategories.
-- Parent category IDs are looked up by name to keep this script deterministic across DBs.
INSERT INTO account_subcategories (account_category_id, name, description, order_index) VALUES
((SELECT id FROM account_categories WHERE name = 'Assets'), 'Current Assets', 'Assets expected to be converted to cash within one year', 10),
((SELECT id FROM account_categories WHERE name = 'Assets'), 'Fixed Assets', 'Long-term tangible assets used in operations', 20),
((SELECT id FROM account_categories WHERE name = 'Liabilities'), 'Current Liabilities', 'Obligations due within one year', 10),
((SELECT id FROM account_categories WHERE name = 'Liabilities'), 'Long-term Liabilities', 'Obligations due after one year', 20),
((SELECT id FROM account_categories WHERE name = 'Equity'), 'Common Stock', 'Ownership shares in the company', 10),
((SELECT id FROM account_categories WHERE name = 'Equity'), 'Retained Earnings', 'Cumulative net income retained in the company', 20),
((SELECT id FROM account_categories WHERE name = 'Revenue'), 'Sales Revenue', 'Income from sales of goods or services', 10),
((SELECT id FROM account_categories WHERE name = 'Revenue'), 'Service Revenue', 'Income from providing services', 20),
((SELECT id FROM account_categories WHERE name = 'Expenses'), 'Operating Expenses', 'Costs related to normal business operations', 10),
((SELECT id FROM account_categories WHERE name = 'Expenses'), 'Non-operating Expenses', 'Costs not related to core business operations', 20)
ON CONFLICT (name) DO NOTHING;

-- Account table is created before categories. Add FK constraints after both exist.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'accounts_account_category_id_fkey'
    ) THEN
        ALTER TABLE accounts
            ADD CONSTRAINT accounts_account_category_id_fkey
            FOREIGN KEY (account_category_id) REFERENCES account_categories(id);
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'accounts_account_subcategory_id_fkey'
    ) THEN
        ALTER TABLE accounts
            ADD CONSTRAINT accounts_account_subcategory_id_fkey
            FOREIGN KEY (account_subcategory_id) REFERENCES account_subcategories(id);
    END IF;
END $$;
