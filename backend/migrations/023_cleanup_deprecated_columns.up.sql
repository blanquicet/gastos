-- Remove deprecated 'category' column from movements table
-- This column was replaced by 'category_id' (FK to categories table)
-- Migration 021 added category_id and migrated data
-- Now we can safely remove the old column

ALTER TABLE movements DROP COLUMN IF EXISTS category;

-- Add comment
COMMENT ON COLUMN movements.category_id IS 'Category reference (FK to categories table, replaced old VARCHAR category column)';
