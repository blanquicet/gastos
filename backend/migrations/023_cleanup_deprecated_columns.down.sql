-- Restore deprecated 'category' column to movements table
-- (This is for rollback purposes only, data will be lost)

ALTER TABLE movements ADD COLUMN category VARCHAR(100);

-- Note: The old category data cannot be recovered after rollback
-- This column is only added back for schema compatibility
