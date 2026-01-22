-- Rollback migration 032

-- Drop index
DROP INDEX IF EXISTS idx_movements_template;

-- Drop column
ALTER TABLE movements DROP COLUMN IF EXISTS generated_from_template_id;
