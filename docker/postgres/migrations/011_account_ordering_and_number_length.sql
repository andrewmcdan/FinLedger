ALTER TABLE account_categories
  ADD COLUMN IF NOT EXISTS order_index INT;

WITH ranked_categories AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      ORDER BY
        CASE
          WHEN account_number_prefix ~ '^[0-9]+$' THEN account_number_prefix::INT
          ELSE 2147483647
        END ASC,
        name ASC
    ) AS row_num
  FROM account_categories
)
UPDATE account_categories AS categories
SET order_index = ranked_categories.row_num * 10
FROM ranked_categories
WHERE categories.id = ranked_categories.id
  AND categories.order_index IS NULL;

ALTER TABLE account_categories
  ALTER COLUMN order_index SET DEFAULT 10;

UPDATE account_categories
SET order_index = 10
WHERE order_index IS NULL;

ALTER TABLE account_categories
  ALTER COLUMN order_index SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_account_categories_order_index
  ON account_categories(order_index);

ALTER TABLE account_subcategories
  ALTER COLUMN order_index SET DEFAULT 10;

UPDATE account_subcategories
SET order_index = 10
WHERE order_index IS NULL;

UPDATE accounts
SET account_number = ((account_number / 100) * 10000) + (account_number % 100)
WHERE account_number IS NOT NULL
  AND char_length(account_number::text) = 8;
