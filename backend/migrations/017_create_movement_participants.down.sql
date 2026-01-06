-- Drop indexes
DROP INDEX IF EXISTS idx_movement_participants_contact;
DROP INDEX IF EXISTS idx_movement_participants_user;
DROP INDEX IF EXISTS idx_movement_participants_movement;

-- Drop table (CASCADE will drop foreign key constraints)
DROP TABLE IF EXISTS movement_participants;
