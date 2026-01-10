-- Script to update category_group icons based on existing Gastos view mapping
-- Run this after migration 022 has been applied
--
-- Usage:
--   psql $DATABASE_URL -f scripts/update-category-group-icons.sql
--
-- Or with explicit connection:
--   PGPASSWORD=password psql -h localhost -U gastos -d gastos -f scripts/update-category-group-icons.sql

BEGIN;

-- Update icons for all category groups based on current mapping
UPDATE category_groups SET icon = '🏠' WHERE name = 'Casa';
UPDATE category_groups SET icon = '🤴🏾' WHERE name = 'Jose';
UPDATE category_groups SET icon = '👸' WHERE name = 'Caro';
UPDATE category_groups SET icon = '🏎️' WHERE name = 'Carro';
UPDATE category_groups SET icon = '🏦' WHERE name = 'Ahorros';
UPDATE category_groups SET icon = '📈' WHERE name = 'Inversiones';
UPDATE category_groups SET icon = '🎉' WHERE name = 'Diversión';
UPDATE category_groups SET icon = '📦' WHERE name = 'Otros';

-- Show updated results
SELECT 
  name as group_name,
  icon,
  display_order,
  COUNT(*) OVER (PARTITION BY household_id) as total_groups_in_household
FROM category_groups
ORDER BY household_id, display_order;

COMMIT;
