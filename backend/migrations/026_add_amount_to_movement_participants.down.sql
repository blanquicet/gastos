-- Remove amount column from movement_participants

ALTER TABLE movement_participants 
DROP CONSTRAINT IF EXISTS movement_participants_amount_check;

ALTER TABLE movement_participants 
DROP COLUMN IF EXISTS amount;
