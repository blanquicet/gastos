-- Rollback migration 033

-- Drop indexes
DROP INDEX IF EXISTS idx_recurring_participants_contact;
DROP INDEX IF EXISTS idx_recurring_participants_user;
DROP INDEX IF EXISTS idx_recurring_participants_template;

-- Drop table
DROP TABLE IF EXISTS recurring_movement_participants;
