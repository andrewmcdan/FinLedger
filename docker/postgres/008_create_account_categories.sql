CREATE TABLE IF NOT EXISTS account_categories (
    id SERIAL PRIMARY KEY,
    name VARCHAR(50) UNIQUE NOT NULL,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    account_number_prefix VARCHAR(10) UNIQUE
);

CREATE TABLE IF NOT EXISTS account_subcategories (
    id SERIAL PRIMARY KEY,
    account_category_id INT REFERENCES account_categories(id) ON DELETE CASCADE,
    name VARCHAR(50) UNIQUE NOT NULL,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    order_index INT DEFAULT 0
);

INSERT INTO account_categories (name, description, account_number_prefix) VALUES
('Assets', 'Resources owned by the company', '10'),
('Liabilities', 'Obligations owed to others', '20'),
('Equity', 'Owner''s interest in the company', '30'),
('Revenue', 'Income earned from business activities', '40'),
('Expenses', 'Costs incurred in the process of earning revenue', '50')
ON CONFLICT (name) DO NOTHING;

INSERT INTO account_subcategories (account_category_id, name, description, order_index) VALUES
((SELECT id FROM account_categories WHERE name = 'Assets'), 'Current Assets', 'Assets expected to be converted to cash within one year', 10),
((SELECT id FROM account_categories WHERE name = 'Assets'), 'Fixed Assets', 'Long-term tangible assets used in operations', 2),
((SELECT id FROM account_categories WHERE name = 'Liabilities'), 'Current Liabilities', 'Obligations due within one year', 1),
((SELECT id FROM account_categories WHERE name = 'Liabilities'), 'Long-term Liabilities', 'Obligations due after one year', 2),
((SELECT id FROM account_categories WHERE name = 'Equity'), 'Common Stock', 'Ownership shares in the company', 1),
((SELECT id FROM account_categories WHERE name = 'Equity'), 'Retained Earnings', 'Cumulative net income retained in the company', 2),
((SELECT id FROM account_categories WHERE name = 'Revenue'), 'Sales Revenue', 'Income from sales of goods or services', 1),
((SELECT id FROM account_categories WHERE name = 'Revenue'), 'Service Revenue', 'Income from providing services', 2),
((SELECT id FROM account_categories WHERE name = 'Expenses'), 'Operating Expenses', 'Costs related to normal business operations', 1),
((SELECT id FROM account_categories WHERE name = 'Expenses'), 'Non-operating Expenses', 'Costs not related to core business operations', 2)
ON CONFLICT (name) DO NOTHING;