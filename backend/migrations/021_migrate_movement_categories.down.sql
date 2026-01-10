-- Reverse migration: clear category_id from movements
-- Note: This does NOT delete categories created during migration
-- Categories will be cleaned up when 018_create_categories.down.sql runs

UPDATE movements
SET category_id = NULL
WHERE category_id IS NOT NULL;
