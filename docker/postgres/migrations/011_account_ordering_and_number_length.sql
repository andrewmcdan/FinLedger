-- Ensure account_categories has an explicit display/order column.
ALTER TABLE account_categories
  ADD COLUMN IF NOT EXISTS order_index INT;

-- Backfill missing category order_index values using prefix-based ordering first,
-- then by name for non-numeric prefixes. We assign 10,20,30... spacing.
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

-- Set defaults and harden nullability after backfill.
ALTER TABLE account_categories
  ALTER COLUMN order_index SET DEFAULT 10;

UPDATE account_categories
SET order_index = 10
WHERE order_index IS NULL;

ALTER TABLE account_categories
  ALTER COLUMN order_index SET NOT NULL;

-- Index used for category ordering queries.
CREATE INDEX IF NOT EXISTS idx_account_categories_order_index
  ON account_categories(order_index);

-- Ensure subcategories also default to spaced ordering values.
ALTER TABLE account_subcategories
  ALTER COLUMN order_index SET DEFAULT 10;

UPDATE account_subcategories
SET order_index = 10
WHERE order_index IS NULL;

-- Expand legacy 8-digit account numbers into 10-digit format.
-- Formula preserves first 6 digits and converts 2-digit suffix -> 4-digit suffix.
UPDATE accounts
SET account_number = ((account_number / 100) * 10000) + (account_number % 100)
WHERE account_number IS NOT NULL
  AND char_length(account_number::text) = 8;
