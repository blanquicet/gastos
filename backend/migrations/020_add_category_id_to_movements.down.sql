-- Drop index
DROP INDEX IF EXISTS idx_movements_category;

-- Remove category_id column
ALTER TABLE movements DROP COLUMN IF EXISTS category_id;
