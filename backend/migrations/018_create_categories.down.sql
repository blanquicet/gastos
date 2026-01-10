-- Drop indexes
DROP INDEX IF EXISTS idx_categories_display_order;
DROP INDEX IF EXISTS idx_categories_household_group;
DROP INDEX IF EXISTS idx_categories_household_active;
DROP INDEX IF EXISTS idx_categories_household;

-- Drop table
DROP TABLE IF EXISTS categories;
