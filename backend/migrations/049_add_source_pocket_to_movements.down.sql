DROP INDEX IF EXISTS idx_movements_source_pocket;
ALTER TABLE movements DROP COLUMN IF EXISTS source_pocket_id;
