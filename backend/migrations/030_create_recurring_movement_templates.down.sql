-- Rollback migration 031

-- Drop indexes
DROP INDEX IF EXISTS idx_recurring_templates_household_category;
DROP INDEX IF EXISTS idx_recurring_templates_next_scheduled;
DROP INDEX IF EXISTS idx_recurring_templates_category;
DROP INDEX IF EXISTS idx_recurring_templates_household_active;
DROP INDEX IF EXISTS idx_recurring_templates_household;

-- Drop table
DROP TABLE IF EXISTS recurring_movement_templates;

-- Drop enums
DROP TYPE IF EXISTS recurrence_pattern;
