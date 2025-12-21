-- Remove name column from users table

ALTER TABLE users DROP COLUMN IF EXISTS name;
