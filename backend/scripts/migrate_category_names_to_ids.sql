-- Data migration script: Map category names to category IDs
-- Run this AFTER migration 030 is applied
-- This populates movements.category_id from movements.category (VARCHAR)

-- Step 1: Update movements with matching category names
UPDATE movements m
SET category_id = c.id
FROM categories c
WHERE m.household_id = c.household_id
  AND m.category = c.name
  AND m.category_id IS NULL
  AND m.category IS NOT NULL;

-- Step 2: Verify migration
SELECT 
    COUNT(*) as total_movements,
    COUNT(category) as with_category_name,
    COUNT(category_id) as with_category_id,
    COUNT(CASE WHEN category IS NOT NULL AND category_id IS NULL THEN 1 END) as unmapped_categories
FROM movements;

-- Step 3: Show unmapped categories (if any)
SELECT DISTINCT
    m.household_id,
    m.category as unmapped_category_name,
    COUNT(*) as movement_count
FROM movements m
WHERE m.category IS NOT NULL 
  AND m.category_id IS NULL
GROUP BY m.household_id, m.category
ORDER BY movement_count DESC;

-- Note: If there are unmapped categories, you may need to:
-- 1. Create missing categories in the categories table
-- 2. Re-run this migration script
-- 3. Or manually map specific movements
