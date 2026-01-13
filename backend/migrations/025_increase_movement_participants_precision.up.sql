-- Increase precision of percentage column in movement_participants
-- From DECIMAL(5,4) to DECIMAL(10,8) to support more precise percentage calculations
-- This allows storing percentages like 0.86111111 instead of 0.8611

ALTER TABLE movement_participants 
ALTER COLUMN percentage TYPE DECIMAL(10, 8);

-- Update comment to reflect new precision
COMMENT ON COLUMN movement_participants.percentage IS 'Participant share as decimal (0.0 to 1.0) with 8 decimal precision. E.g., 0.25000000 = 25%';
